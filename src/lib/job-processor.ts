import { db } from "@/db";
import { clipJobs, youtubeTokens, userSettings, ClipResult } from "@/db/schema";
import { eq } from "drizzle-orm";
import { downloadVideo, transcribeAudio, processClips } from "@/lib/video-processor";
import { analyzeVideoForClips } from "@/lib/ai-analyzer";
import { getMaxClipsConfig, getDefaultClipDuration, getDurationRange } from "@/lib/video-config";
import {
  uploadClipsToYouTube,
  isTokenExpired,
  refreshAccessToken,
} from "@/lib/youtube-uploader";
import { uploadClipsToDrive } from "@/lib/drive-uploader";

// `meta.step` memetakan update ke step real-time progress Telegram (lihat
// src/lib/progress-config.ts). Opsional — kalau tidak diisi, `status` dipakai
// sebagai id step. `meta.percent` dipakai untuk progress bar per-step.
export type JobStatusMeta = { step?: string; percent?: number };
export type StatusUpdateFn = (
  status: string,
  message: string,
  meta?: JobStatusMeta
) => Promise<void>;

export async function processJob(
  jobId: string,
  onStatusUpdate?: StatusUpdateFn
): Promise<void> {
  const update = onStatusUpdate || (async () => {});

  const jobs = await db.select().from(clipJobs).where(eq(clipJobs.jobId, jobId));
  if (!jobs.length) throw new Error(`Job ${jobId} tidak ditemukan`);
  const job = jobs[0];

  const settingsRows = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.telegramUserId, job.telegramUserId));

  // Use env var MAX_CLIPS as the source of truth; fall back to user DB setting, then default 5
  const envMaxClips = getMaxClipsConfig();
  const envClipDuration = getDefaultClipDuration();
  const settings = settingsRows[0] || {
    maxClips: envMaxClips,
    clipDuration: envClipDuration,
    minDuration: 20,
    maxDuration: 40,
    defaultPrivacy: "private",
    language: "id",
    youtubeConnected: false,
  };

  // Memprioritaskan setting per-akun dari database pengguna
  const effectiveMaxClips = settings.maxClips || envMaxClips;
  // Durasi klip: pilihan tetap (15/20/30/40/60 detik) — lihat src/lib/video-config.ts
  const effectiveClipDuration = settings.clipDuration || envClipDuration;
  const { min: effectiveMinDuration, max: effectiveMaxDuration } = getDurationRange(effectiveClipDuration);

  try {
    // === STEP 1: DOWNLOAD ===
    await db
      .update(clipJobs)
      .set({ status: "downloading", updatedAt: new Date() })
      .where(eq(clipJobs.jobId, jobId));
    await update("downloading", "⬇️ Mengunduh video...", { step: "downloading", percent: 0 });

    let downloadResult: { filePath: string; title: string; duration: number };
    try {
      downloadResult = await downloadVideo(job.sourceUrl, jobId, async (progress) => {
        if (progress % 20 === 0) {
          await update("downloading", `⬇️ Mengunduh video... ${progress.toFixed(0)}%`, {
            step: "downloading",
            percent: progress,
          });
        }
      });
    } catch (err) {
      throw new Error(`Gagal mengunduh: ${err instanceof Error ? err.message : String(err)}`);
    }

    await db
      .update(clipJobs)
      .set({
        videoTitle: downloadResult.title,
        videoDuration: Math.round(downloadResult.duration),
        downloadPath: downloadResult.filePath,
        updatedAt: new Date(),
      })
      .where(eq(clipJobs.jobId, jobId));

    // === STEP 2: TRANSCRIBE ===
    await db
      .update(clipJobs)
      .set({ status: "analyzing", updatedAt: new Date() })
      .where(eq(clipJobs.jobId, jobId));
    await update("analyzing", "🎙️ Mentranskripsi audio...", { step: "transcribing" });

    let transcript: { start: number; end: number; text: string }[] = [];
    try {
      transcript = await transcribeAudio(downloadResult.filePath, settings.language || "id");
    } catch (err) {
      console.warn("Transcription failed, proceeding without:", err);
    }

    // === STEP 3: ANALYZE ===
    await update(
      "analyzing",
      `🧠 Menganalisis momen viral dengan AI... (target: ${effectiveMaxClips} klip, durasi ~${effectiveClipDuration}s)`,
      { step: "analyzing" }
    );

    let analysisClips: Omit<ClipResult, "filePath" | "thumbnailPath" | "youtubeVideoId" | "youtubeUrl">[];
    try {
      analysisClips = await analyzeVideoForClips(
        {
          title: downloadResult.title,
          duration: downloadResult.duration,
          transcript,
          platform: job.platform,
          language: settings.language || "id",
        },
        effectiveMaxClips,
        effectiveMinDuration,
        effectiveMaxDuration,
        effectiveClipDuration
      );
    } catch (err) {
      throw new Error(`Analisis AI gagal: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (!analysisClips.length) {
      throw new Error("Tidak ada momen yang cocok ditemukan untuk dijadikan Shorts");
    }

    await update("analyzing", `🎯 ${analysisClips.length} momen viral ditemukan!`, {
      step: "analyzing",
      percent: 100,
    });

    // === STEP 4: CLIP + ZOOM + WATERMARK + INTRO/OUTRO + THUMBNAIL ===
    await db
      .update(clipJobs)
      .set({ status: "clipping", updatedAt: new Date() })
      .where(eq(clipJobs.jobId, jobId));

    const processedClips = await processClips(
      downloadResult.filePath,
      analysisClips,
      jobId,
      true,
      async (clipIndex, total) => {
        await update(
          "clipping",
          `✂️ Memproses klip ${clipIndex + 1}/${total}... (Zoom + Watermark + Intro/Outro)`,
          { step: "clipping", percent: Math.round(((clipIndex + 1) / total) * 100) }
        );
      }
    );

    const thumbnailCount = processedClips.filter((c) => c.thumbnailPath).length;
    if (thumbnailCount > 0) {
      await update("clipping", `🖼 ${thumbnailCount} thumbnail berhasil di-generate!`, {
        step: "clipping",
        percent: 100,
      });
    }

    const successfulClips = processedClips.filter((c) => c.filePath);
    if (!successfulClips.length) throw new Error("Semua klip gagal diproses");

    await db
      .update(clipJobs)
      .set({ clips: processedClips, status: "uploading", updatedAt: new Date() })
      .where(eq(clipJobs.jobId, jobId));

    // === STEP 5: UPLOAD TO YOUTUBE (jika terhubung) ===
    let finalClips: ClipResult[] = processedClips;

    const tokenRows = await db
      .select()
      .from(youtubeTokens)
      .where(eq(youtubeTokens.telegramUserId, job.telegramUserId));

    if (tokenRows.length > 0) {
      const tokenRow = tokenRows[0];
      let { accessToken, refreshToken } = tokenRow;

      if (isTokenExpired(tokenRow.expiresAt)) {
        try {
          const newTokens = await refreshAccessToken(tokenRow.refreshToken);
          accessToken = newTokens.accessToken;
          await db
            .update(youtubeTokens)
            .set({
              accessToken: newTokens.accessToken,
              expiresAt: newTokens.expiresAt,
              updatedAt: new Date(),
            })
            .where(eq(youtubeTokens.telegramUserId, job.telegramUserId));
        } catch (err) {
          console.error("Token refresh failed:", err);
        }
      }

      await update("uploading", "📤 Mengupload ke YouTube Studio sebagai Draft...", {
        step: "uploading_youtube",
        percent: 0,
      });

      const uploadResults = await uploadClipsToYouTube(
        successfulClips,
        accessToken,
        refreshToken,
        (settings.defaultPrivacy as "private" | "unlisted" | "public") || "private",
        async (clipIndex, result, error) => {
          const percent = Math.round(((clipIndex + 1) / successfulClips.length) * 100);
          if (result) {
            await update("uploading", `✅ Klip ${clipIndex + 1} berhasil diupload!\n🔗 ${result.videoUrl}`, {
              step: "uploading_youtube",
              percent,
            });
          } else {
            await update("uploading", `⚠️ Klip ${clipIndex + 1} gagal: ${error}`, {
              step: "uploading_youtube",
              percent,
            });
          }
        }
      );

      // uploadResults sejajar dengan successfulClips (bukan processedClips)
      finalClips = finalClips.map((clip) => {
        const idx = successfulClips.indexOf(clip);
        const uploadResult = idx >= 0 ? uploadResults[idx] : null;
        if (uploadResult) {
          return { ...clip, youtubeVideoId: uploadResult.videoId, youtubeUrl: uploadResult.videoUrl };
        }
        return clip;
      });
    }

    // === STEP 5b: AUTO-UPLOAD KE GOOGLE DRIVE (jika terhubung & aktif) ===
    // Kegagalan Drive TIDAK menggagalkan job — klip tetap dikirim ke Telegram.
    try {
      const driveSummary = await uploadClipsToDrive({
        userId: job.telegramUserId,
        jobId,
        videoTitle: downloadResult.title,
        clips: successfulClips,
        onProgress: async (clipIndex, total, result, error) => {
          const percent = Math.round(((clipIndex + 1) / total) * 100);
          if (result) {
            await update("uploading", `☁️ Klip ${clipIndex + 1}/${total} masuk Google Drive`, {
              step: "uploading_drive",
              percent,
            });
          } else {
            await update("uploading", `⚠️ Drive klip ${clipIndex + 1} gagal: ${error}`, {
              step: "uploading_drive",
              percent,
            });
          }
        },
      });

      if (driveSummary.attempted) {
        finalClips = finalClips.map((clip) => {
          const idx = successfulClips.indexOf(clip);
          const r = idx >= 0 ? driveSummary.results[idx] : null;
          return r ? { ...clip, driveFileId: r.fileId, driveUrl: r.url } : clip;
        });
        const okCount = driveSummary.results.filter(Boolean).length;
        if (okCount > 0) {
          await update(
            "uploading",
            `☁️ ${okCount}/${successfulClips.length} klip tersimpan di Google Drive` +
              (driveSummary.folderName ? ` (📁 ${driveSummary.folderName})` : ""),
            { step: "uploading_drive", percent: 100 }
          );
        }
        if (driveSummary.warning)
          await update("uploading", `⚠️ ${driveSummary.warning}`, { step: "uploading_drive" });
        if (driveSummary.error && okCount === 0) {
          await update("uploading", `⚠️ Upload Google Drive gagal: ${driveSummary.error}`, {
            step: "uploading_drive",
          });
        }
      }
    } catch (err) {
      console.error("[drive] step gagal (diabaikan):", err);
    }

    await db
      .update(clipJobs)
      .set({ clips: finalClips, status: "done", updatedAt: new Date() })
      .where(eq(clipJobs.jobId, jobId));

    // Cleanup source video
    try {
      const { unlinkSync, existsSync } = await import("fs");
      if (existsSync(downloadResult.filePath)) unlinkSync(downloadResult.filePath);
    } catch {
      /* ignore */
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`Job ${jobId} failed:`, err);
    await db
      .update(clipJobs)
      .set({ status: "error", errorMessage: errorMsg, updatedAt: new Date() })
      .where(eq(clipJobs.jobId, jobId));
    await update("error", `❌ ${errorMsg}`, { step: "error" });
    throw err;
  }
}
