import { db } from "@/db";
import {
  clipJobs,
  youtubeTokens,
  tiktokTokens,
  userSettings,
  ClipResult,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  downloadVideo,
  transcribeAudio,
  processClips,
} from "@/lib/video-processor";
import { analyzeVideoForClips } from "@/lib/ai-analyzer";
import {
  uploadClipsToYouTube,
  isTokenExpired as isYoutubeTokenExpired,
  refreshAccessToken as refreshYoutubeToken,
} from "@/lib/youtube-uploader";
import {
  uploadClipsToTikTok,
  TikTokPrivacy,
} from "@/lib/tiktok-uploader";
import {
  isTokenExpired as isTikTokTokenExpired,
  refreshAccessToken as refreshTikTokToken,
} from "@/lib/tiktok-oauth";

type StatusUpdateFn = (status: string, message: string) => Promise<void>;

export async function processJob(
  jobId: string,
  onStatusUpdate?: StatusUpdateFn
): Promise<void> {
  const update = onStatusUpdate || (async () => {});

  const jobs = await db
    .select()
    .from(clipJobs)
    .where(eq(clipJobs.jobId, jobId));

  if (!jobs.length) {
    throw new Error(`Job ${jobId} not found`);
  }

  const job = jobs[0];

  const settingsRows = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.telegramUserId, job.telegramUserId));

  const settings = settingsRows[0] || {
    maxClips: 3,
    minDuration: 20,
    maxDuration: 40,
    defaultPrivacy: "private",
    language: "id",
    youtubeConnected: false,
    tiktokConnected: false,
    tiktokPrivacy: "SELF_ONLY",
    tiktokAutoUpload: true,
  };

  try {
    // ── STEP 1: DOWNLOAD ────────────────────────────────────────────────────
    await db
      .update(clipJobs)
      .set({ status: "downloading", updatedAt: new Date() })
      .where(eq(clipJobs.jobId, jobId));

    await update("downloading", "⬇️ Mengunduh video...");

    let downloadResult: { filePath: string; title: string; duration: number };

    try {
      downloadResult = await downloadVideo(
        job.sourceUrl,
        jobId,
        async (progress) => {
          if (progress % 20 === 0) {
            await update(
              "downloading",
              `⬇️ Mengunduh video... ${progress.toFixed(0)}%`
            );
          }
        }
      );
    } catch (err) {
      throw new Error(
        `Gagal mengunduh video: ${err instanceof Error ? err.message : String(err)}`
      );
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

    // ── STEP 2: TRANSCRIBE ──────────────────────────────────────────────────
    await db
      .update(clipJobs)
      .set({ status: "analyzing", updatedAt: new Date() })
      .where(eq(clipJobs.jobId, jobId));

    await update("analyzing", "🎙️ Mentranskripsi audio...");

    let transcript: { start: number; end: number; text: string }[] = [];
    try {
      transcript = await transcribeAudio(
        downloadResult.filePath,
        settings.language || "id"
      );
    } catch (err) {
      console.warn("Transcription failed, proceeding without:", err);
    }

    // ── STEP 3: ANALYZE ─────────────────────────────────────────────────────
    await update("analyzing", "🧠 Menganalisis momen viral dengan AI...");

    let analysisClips: Omit<ClipResult, "filePath">[];
    try {
      analysisClips = await analyzeVideoForClips(
        {
          title: downloadResult.title,
          duration: downloadResult.duration,
          transcript,
          platform: job.platform,
          language: settings.language || "id",
        },
        settings.maxClips || 3,
        settings.minDuration || 20,
        settings.maxDuration || 40
      );
    } catch (err) {
      throw new Error(
        `Analisis AI gagal: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    if (!analysisClips.length) {
      throw new Error(
        "Tidak ada momen yang cocok ditemukan untuk dijadikan Shorts"
      );
    }

    await update("analyzing", `🎯 ${analysisClips.length} momen viral ditemukan!`);

    // ── STEP 4: CLIP ─────────────────────────────────────────────────────────
    await db
      .update(clipJobs)
      .set({ status: "clipping", updatedAt: new Date() })
      .where(eq(clipJobs.jobId, jobId));

    const processedClips = await processClips(
      downloadResult.filePath,
      analysisClips,
      jobId,
      true, // make vertical 9:16
      async (clipIndex, total) => {
        await update("clipping", `✂️ Memotong klip ${clipIndex + 1}/${total}...`);
      }
    );

    const successfulClips = processedClips.filter((c) => c.filePath);

    if (!successfulClips.length) {
      throw new Error("Semua klip gagal diproses");
    }

    await db
      .update(clipJobs)
      .set({
        clips: processedClips,
        status: "uploading",
        updatedAt: new Date(),
      })
      .where(eq(clipJobs.jobId, jobId));

    // ── STEP 5: UPLOAD TO YOUTUBE ──────────────────────────────────────────
    let updatedClips = [...processedClips];

    const ytTokenRows = await db
      .select()
      .from(youtubeTokens)
      .where(eq(youtubeTokens.telegramUserId, job.telegramUserId));

    if (ytTokenRows.length > 0) {
      const ytToken = ytTokenRows[0];
      let { accessToken: ytAccess, refreshToken: ytRefresh } = ytToken;

      if (isYoutubeTokenExpired(ytToken.expiresAt)) {
        try {
          const newTokens = await refreshYoutubeToken(ytToken.refreshToken);
          ytAccess = newTokens.accessToken;
          await db
            .update(youtubeTokens)
            .set({
              accessToken: newTokens.accessToken,
              expiresAt: newTokens.expiresAt,
              updatedAt: new Date(),
            })
            .where(eq(youtubeTokens.telegramUserId, job.telegramUserId));
        } catch (err) {
          console.error("YouTube token refresh failed:", err);
        }
      }

      await update("uploading", "📺 Mengupload ke YouTube Studio sebagai Draft...");

      const ytResults = await uploadClipsToYouTube(
        successfulClips,
        ytAccess,
        ytRefresh,
        (settings.defaultPrivacy as "private" | "unlisted" | "public") ||
          "private",
        async (clipIndex, result, error) => {
          if (result) {
            await update(
              "uploading",
              `✅ Klip ${clipIndex + 1} berhasil diupload ke YouTube!\n🔗 ${result.videoUrl}`
            );
          } else {
            await update(
              "uploading",
              `⚠️ YouTube Klip ${clipIndex + 1} gagal: ${error}`
            );
          }
        }
      );

      // Merge YouTube results into clips
      updatedClips = updatedClips.map((clip, i) => {
        const ytResult = ytResults[i];
        if (ytResult) {
          return {
            ...clip,
            youtubeVideoId: ytResult.videoId,
            youtubeUrl: ytResult.videoUrl,
          };
        }
        return clip;
      });

      await db
        .update(clipJobs)
        .set({ clips: updatedClips, updatedAt: new Date() })
        .where(eq(clipJobs.jobId, jobId));
    }

    // ── STEP 6: UPLOAD TO TIKTOK ───────────────────────────────────────────
    const ttTokenRows = await db
      .select()
      .from(tiktokTokens)
      .where(eq(tiktokTokens.telegramUserId, job.telegramUserId));

    const tiktokAutoUpload =
      settings.tiktokAutoUpload !== false; // default true

    if (ttTokenRows.length > 0 && tiktokAutoUpload) {
      const ttToken = ttTokenRows[0];
      let { accessToken: ttAccess } = ttToken;

      if (isTikTokTokenExpired(ttToken.expiresAt)) {
        try {
          const newTokens = await refreshTikTokToken(ttToken.refreshToken);
          ttAccess = newTokens.accessToken;
          await db
            .update(tiktokTokens)
            .set({
              accessToken: newTokens.accessToken,
              refreshToken: newTokens.refreshToken,
              expiresAt: newTokens.expiresAt,
              updatedAt: new Date(),
            })
            .where(eq(tiktokTokens.telegramUserId, job.telegramUserId));
        } catch (err) {
          console.error("TikTok token refresh failed:", err);
        }
      }

      await update("uploading", "🎵 Mengupload ke TikTok Inbox...");

      const privacyLevel = (settings.tiktokPrivacy ||
        "SELF_ONLY") as TikTokPrivacy;

      const ttResults = await uploadClipsToTikTok(
        successfulClips,
        ttAccess,
        privacyLevel,
        "inbox", // change to "direct" when your TikTok app is approved
        async (clipIndex, result, error) => {
          if (result) {
            await update(
              "uploading",
              `✅ Klip ${clipIndex + 1} berhasil dikirim ke TikTok Inbox!`
            );
          } else {
            await update(
              "uploading",
              `⚠️ TikTok Klip ${clipIndex + 1} gagal: ${error}`
            );
          }
        }
      );

      // Merge TikTok results into clips
      updatedClips = updatedClips.map((clip, i) => {
        const ttResult = ttResults[i];
        if (ttResult) {
          return {
            ...clip,
            tiktokPublishId: ttResult.publishId,
          };
        }
        return clip;
      });

      await db
        .update(clipJobs)
        .set({ clips: updatedClips, updatedAt: new Date() })
        .where(eq(clipJobs.jobId, jobId));
    }

    // ── DONE ──────────────────────────────────────────────────────────────
    await db
      .update(clipJobs)
      .set({ clips: updatedClips, status: "done", updatedAt: new Date() })
      .where(eq(clipJobs.jobId, jobId));

    // Cleanup source video
    try {
      const { unlinkSync, existsSync } = await import("fs");
      if (existsSync(downloadResult.filePath)) {
        unlinkSync(downloadResult.filePath);
      }
    } catch {
      // ignore cleanup errors
    }
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
