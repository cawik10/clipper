import { db } from "@/db";
import { clipJobs, youtubeTokens, userSettings, ClipResult } from "@/db/schema";
import { eq } from "drizzle-orm";
import { downloadVideo, transcribeAudio, processClips } from "@/lib/video-processor";
import { analyzeVideoForClips } from "@/lib/ai-analyzer";
import { resolveMaxClips } from "@/lib/video-config";
import {
  uploadClipsToYouTube,
  isTokenExpired,
  refreshAccessToken,
} from "@/lib/youtube-uploader";

type StatusUpdateFn = (status: string, message: string) => Promise<void>;

export async function processJob(
  jobId: string,
  onStatusUpdate?: StatusUpdateFn
): Promise<void> {
  const update = onStatusUpdate || (async () => {});

  const jobs = await db.select().from(clipJobs).where(eq(clipJobs.jobId, jobId));
  if (!jobs.length) throw new Error(`Job ${jobId} tidak ditemukan`);

  const job = jobs[0];

  // ── Load per-user settings ──────────────────────────────────────────────
  const settingsRows = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.telegramUserId, job.telegramUserId));

  const userSetting = settingsRows[0] || null;

  // Resolve effective values: per-user DB > env var default > hardcoded fallback
  const effectiveMaxClips = resolveMaxClips(userSetting?.maxClips);
  const effectiveMinDuration = userSetting?.minDuration ?? 20;
  const effectiveMaxDuration = userSetting?.maxDuration ?? 40;
  const effectivePrivacy = (userSetting?.defaultPrivacy as "private" | "unlisted" | "public") ?? "private";
  const effectiveLanguage = userSetting?.language ?? "id";

  // Per-user video processing config (passed to processClips)
  const userVideoConfig = {
    aspectRatioMode: userSetting?.aspectRatioMode,
    watermarkEnabled: userSetting?.watermarkEnabled,
    watermarkText: userSetting?.watermarkText,
    watermarkPosition: userSetting?.watermarkPosition,
    watermarkFontSize: userSetting?.watermarkFontSize,
    watermarkColor: userSetting?.watermarkColor,
    watermarkOpacity: userSetting?.watermarkOpacity,
    watermarkBox: userSetting?.watermarkBox,
    thumbnailEnabled: userSetting?.thumbnailEnabled,
    thumbnailMode: userSetting?.thumbnailMode,
    thumbnailQuality: userSetting?.thumbnailQuality,
    zoomEnabled: userSetting?.zoomEnabled,
    zoomMode: userSetting?.zoomMode,
    zoomType: userSetting?.zoomType,
    zoomIntensity: userSetting?.zoomIntensity,
    zoomMinScore: userSetting?.zoomMinScore,
    introEnabled: userSetting?.introEnabled,
    introText: userSetting?.introText,
    introDuration: userSetting?.introDuration,
    outroEnabled: userSetting?.outroEnabled,
    outroText: userSetting?.outroText,
    outroDuration: userSetting?.outroDuration,
  };

  try {
    // ── STEP 1: DOWNLOAD ───────────────────────────────────────────────────
    await db
      .update(clipJobs)
      .set({ status: "downloading", updatedAt: new Date() })
      .where(eq(clipJobs.jobId, jobId));
    await update("downloading", "⬇️ Mengunduh video...");

    let downloadResult: { filePath: string; title: string; duration: number };
    try {
      downloadResult = await downloadVideo(job.sourceUrl, jobId, async (progress) => {
        if (progress % 20 === 0) {
          await update("downloading", `⬇️ Mengunduh video... ${progress.toFixed(0)}%`);
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

    // ── STEP 2: TRANSCRIBE ─────────────────────────────────────────────────
    await db
      .update(clipJobs)
      .set({ status: "analyzing", updatedAt: new Date() })
      .where(eq(clipJobs.jobId, jobId));
    await update("analyzing", "🎙️ Mentranskripsi audio...");

    let transcript: { start: number; end: number; text: string }[] = [];
    try {
      transcript = await transcribeAudio(downloadResult.filePath, effectiveLanguage);
    } catch (err) {
      console.warn("Transcription failed, proceeding without:", err);
    }

    // ── STEP 3: ANALYZE ────────────────────────────────────────────────────
    await update("analyzing", `🧠 Menganalisis momen viral dengan AI... (target: ${effectiveMaxClips} klip)`);

    let analysisClips: Omit<ClipResult, "filePath" | "thumbnailPath">[];
    try {
      analysisClips = await analyzeVideoForClips(
        {
          title: downloadResult.title,
          duration: downloadResult.duration,
          transcript,
          platform: job.platform,
          language: effectiveLanguage,
        },
        effectiveMaxClips,
        effectiveMinDuration,
        effectiveMaxDuration
      );
    } catch (err) {
      throw new Error(`Analisis AI gagal: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (!analysisClips.length) {
      throw new Error("Tidak ada momen yang cocok ditemukan untuk dijadikan Shorts");
    }

    await update("analyzing", `🎯 ${analysisClips.length} momen viral ditemukan!`);

    // ── STEP 4: CLIP + ZOOM + WATERMARK + INTRO/OUTRO + THUMBNAIL ──────────
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
        await update("clipping", `✂️ Memproses klip ${clipIndex + 1}/${total}...`);
      },
      userVideoConfig
    );

    const successfulClips = processedClips.filter((c) => c.filePath);
    if (!successfulClips.length) throw new Error("Semua klip gagal diproses");

    await db
      .update(clipJobs)
      .set({ clips: processedClips, status: "uploading", updatedAt: new Date() })
      .where(eq(clipJobs.jobId, jobId));

    // ── STEP 5: UPLOAD TO YOUTUBE ──────────────────────────────────────────
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
            .set({ accessToken: newTokens.accessToken, expiresAt: newTokens.expiresAt, updatedAt: new Date() })
            .where(eq(youtubeTokens.telegramUserId, job.telegramUserId));
        } catch (err) {
          console.error("Token refresh failed:", err);
        }
      }

      await update("uploading", "📤 Mengupload ke YouTube Studio sebagai Draft...");

      const uploadResults = await uploadClipsToYouTube(
        successfulClips,
        accessToken,
        refreshToken,
        effectivePrivacy,
        async (clipIndex, result, error) => {
          if (result) {
            await update("uploading", `✅ Klip ${clipIndex + 1} berhasil diupload!\n🔗 ${result.videoUrl}`);
          } else {
            await update("uploading", `⚠️ Klip ${clipIndex + 1} gagal: ${error}`);
          }
        }
      );

      const updatedClips = processedClips.map((clip, i) => {
        const uploadResult = uploadResults[i];
        if (uploadResult) {
          return { ...clip, youtubeVideoId: uploadResult.videoId, youtubeUrl: uploadResult.videoUrl };
        }
        return clip;
      });

      await db
        .update(clipJobs)
        .set({ clips: updatedClips, status: "done", updatedAt: new Date() })
        .where(eq(clipJobs.jobId, jobId));
    } else {
      await db
        .update(clipJobs)
        .set({ status: "done", updatedAt: new Date() })
        .where(eq(clipJobs.jobId, jobId));
    }

    // Cleanup source video
    try {
      const { unlinkSync, existsSync } = await import("fs");
      if (existsSync(downloadResult.filePath)) unlinkSync(downloadResult.filePath);
    } catch { /* ignore */ }

  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`Job ${jobId} failed:`, err);
    await db
      .update(clipJobs)
      .set({ status: "error", errorMessage: errorMsg, updatedAt: new Date() })
      .where(eq(clipJobs.jobId, jobId));
    await update("error", `❌ ${errorMsg}`);
    throw err;
  }
}
