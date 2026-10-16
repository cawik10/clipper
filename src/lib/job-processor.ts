import { db } from "@/db";
import { clipJobs, youtubeTokens, userSettings, ClipResult } from "@/db/schema";
import { eq } from "drizzle-orm";
import { downloadVideo, transcribeAudio, processClips } from "@/lib/video-processor";
import { analyzeVideoForClips } from "@/lib/ai-analyzer";
import { getMaxClipsConfig, getDefaultClipDuration, getDurationRange } from "@/lib/video-config";
import { getDefaultNichePrompt } from "@/lib/niche-prompt";
import {
  uploadClipsToYouTube,
  isTokenExpired,
  refreshAccessToken,
} from "@/lib/youtube-uploader";
import { uploadClipsToDrive } from "@/lib/drive-uploader";
import { filterDuplicateClips, recordClipFingerprints } from "@/lib/duplicate-filter";
import fs from "fs";

// `meta.step` memetakan update ke step real-time progress Telegram (lihat
// src/lib/progress-config.ts). Opsional — kalau tidak diisi, `status` dipakai
// sebagai id step. `meta.percent` dipakai untuk progress bar per-step.
export type JobStatusMeta = { step?: string; percent?: number };
export type StatusUpdateFn = (
  status: string,
  message: string,
  meta?: JobStatusMeta
) => Promise<void>;

type EffectiveSettings = {
  maxClips: number | null;
  clipDuration: number | null;
  minDuration: number | null;
  maxDuration: number | null;
  defaultPrivacy: string | null;
  language: string | null;
  youtubeConnected?: boolean | null;
  nichePrompt?: string | null;
};

async function getEffectiveSettings(telegramUserId: string): Promise<EffectiveSettings> {
  const settingsRows = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.telegramUserId, telegramUserId));

  const envMaxClips = getMaxClipsConfig();
  const envClipDuration = getDefaultClipDuration();

  return (
    settingsRows[0] || {
      maxClips: envMaxClips,
      clipDuration: envClipDuration,
      minDuration: 20,
      maxDuration: 40,
      defaultPrivacy: "private",
      language: "id",
      youtubeConnected: false,
      // 🎯 Custom Niche Prompt (BARU!) — fallback ke default global kalau user belum punya setting
      nichePrompt: getDefaultNichePrompt(),
    }
  );
}

/**
 * === STEP 1-4: DOWNLOAD → TRANSKRIPSI → ANALISIS AI → POTONG/EDIT KLIP ===
 *
 * Dipisah dari upload (lihat `publishJobClips` di bawah) supaya alur bot
 * Telegram bisa berhenti sejenak SEBELUM upload ke YouTube dan menanyakan
 * ke user: upload sekarang, dijadwalkan sesuai rekomendasi AI, atau jam
 * custom. Lihat src/lib/scheduler.ts & src/lib/scheduler-worker.ts untuk
 * fitur "🗓️ Scheduler / Queue Posting" tersebut — 100% tambahan baru,
 * tidak mengubah perilaku lama kalau fitur dimatikan (SCHEDULER_ENABLED=false).
 *
 * Setelah sukses, job disimpan dengan status `clips_ready` dan kolom
 * `clips` berisi hasil pemotongan (lengkap dengan zoom/watermark/intro-outro/
 * thumbnail) — siap dipublish kapan saja lewat `publishJobClips(jobId)`.
 */
export async function processClipsOnly(
  jobId: string,
  onStatusUpdate?: StatusUpdateFn
): Promise<{ successfulClipsCount: number; platform: string }> {
  const update = onStatusUpdate || (async () => {});

  const jobs = await db.select().from(clipJobs).where(eq(clipJobs.jobId, jobId));
  if (!jobs.length) throw new Error(`Job ${jobId} tidak ditemukan`);
  const job = jobs[0];

  const settings = await getEffectiveSettings(job.telegramUserId);
  const envMaxClips = getMaxClipsConfig();
  const envClipDuration = getDefaultClipDuration();

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
        effectiveClipDuration,
        // 🎯 Custom Niche Prompt (BARU!) — arahan khusus per-akun untuk AI Analysis
        settings.nichePrompt
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

    // === STEP 3b: 🧹 DUPLICATE / REPETITIVE CLIP FILTER ===
    // Membuang kandidat klip yang kontennya terlalu mirip dengan klip yang
    // sudah pernah dibuat sebelumnya (mis. source video ini diproses ulang).
    // Lihat src/lib/duplicate-filter.ts & duplicate-filter-config.ts — fitur
    // ini sepenuhnya opsional/additive dan bisa dimatikan via
    // DUPLICATE_FILTER_ENABLED=false tanpa memengaruhi langkah lain.
    const dedupeResult = await filterDuplicateClips({
      sourceUrl: job.sourceUrl,
      telegramUserId: job.telegramUserId,
      jobId,
      candidates: analysisClips,
    });

    if (dedupeResult.skipped.length > 0) {
      await update(
        "analyzing",
        `🧹 ${dedupeResult.skipped.length} klip duplikat/repetitif disaring (konten mirip klip sebelumnya dari source ini).`,
        { step: "analyzing", percent: 100 }
      );
    }

    if (!dedupeResult.accepted.length) {
      throw new Error(
        "Semua momen yang ditemukan AI terdeteksi sebagai duplikat/repetitif dari klip yang sudah pernah dibuat. Coba video lain atau atur DUPLICATE_FILTER_TEXT_THRESHOLD."
      );
    }

    analysisClips = dedupeResult.accepted;

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

    // 🧹 Simpan sidik jari klip yang berhasil dibuat, supaya jadi pembanding
    // ketika source video ini (atau yang mirip) diproses lagi di kemudian hari.
    await recordClipFingerprints({
      sourceUrl: job.sourceUrl,
      telegramUserId: job.telegramUserId,
      jobId,
      clips: successfulClips,
    });

    // Status baru "clips_ready" — murni tambahan (tidak menggantikan status
    // lama manapun). Dashboard web menampilkannya dengan label fallback
    // netral kalau belum dikenal, dan juga sudah ditambahkan secara eksplisit
    // di src/app/page.tsx (statusConfig) tanpa mengubah entri status lain.
    await db
      .update(clipJobs)
      .set({ clips: processedClips, status: "clips_ready", updatedAt: new Date() })
      .where(eq(clipJobs.jobId, jobId));

    // Video sumber (hasil download) sudah tidak diperlukan lagi setelah klip
    // selesai dipotong — dihapus di sini (bukan menunggu upload) supaya tidak
    // menumpuk disk kalau upload baru dijadwalkan beberapa jam/hari lagi.
    try {
      if (fs.existsSync(downloadResult.filePath)) fs.unlinkSync(downloadResult.filePath);
    } catch {
      /* ignore */
    }

    return { successfulClipsCount: successfulClips.length, platform: job.platform };
  } catch (err) {
    // Escape karakter khusus agar tidak merusak format Markdown Telegram
    const rawError = err instanceof Error ? err.message : String(err);
    const errorMsg = rawError.replace(/([_*`\[\]])/g, "\\$1");
    console.error(`Job ${jobId} failed (clip stage):`, err);
    await db
      .update(clipJobs)
      .set({ status: "error", errorMessage: errorMsg, updatedAt: new Date() })
      .where(eq(clipJobs.jobId, jobId));
    await update("error", `❌ ${errorMsg}`, { step: "error" });
    throw err;
  }
}

/**
 * === STEP 5: UPLOAD KE YOUTUBE (+ 5b: GOOGLE DRIVE) ===
 *
 * Mempublish klip yang sudah disiapkan oleh `processClipsOnly`. Dipanggil:
 *   - langsung setelah `processClipsOnly` kalau user memilih "📤 Post Sekarang"
 *     (atau kalau fitur scheduler dimatikan / YouTube belum terhubung), ATAU
 *   - belakangan oleh src/lib/scheduler-worker.ts tepat pada jam yang
 *     dijadwalkan (rekomendasi AI / custom).
 *
 * Catatan: file klip disimpan sementara di disk lokal container. Kalau
 * penjadwalan melewati restart container (Railway redeploy dsb.), file bisa
 * hilang — worker akan menandai scheduled upload tsb sebagai error dengan
 * pesan yang jelas (klip tetap sudah dikirim ke Telegram saat dibuat).
 */
export async function publishJobClips(
  jobId: string,
  onStatusUpdate?: StatusUpdateFn
): Promise<void> {
  const update = onStatusUpdate || (async () => {});

  const jobs = await db.select().from(clipJobs).where(eq(clipJobs.jobId, jobId));
  if (!jobs.length) throw new Error(`Job ${jobId} tidak ditemukan`);
  const job = jobs[0];

  const settings = await getEffectiveSettings(job.telegramUserId);
  const processedClips = (job.clips as ClipResult[] | null) || [];

  if (!processedClips.length) {
    throw new Error("Tidak ada klip yang bisa dipublish.");
  }

  // 🔄 AUTO-RECOVERY ON-DEMAND
  // Memeriksa dan memotong ulang klip otomatis jika file terhapus karena restart/redeploy Railway
  for (let i = 0; i < processedClips.length; i++) {
    const clip = processedClips[i];
    if (!clip.filePath || !fs.existsSync(clip.filePath)) {
      console.log(`[publishJobClips] File klip ${i + 1} hilang di server, memotong ulang on-the-fly...`);
      await update("uploading", `🔄 Memotong ulang Klip ${i + 1} dari sumber...`, { step: "recutting" });

      // 1. Unduh ulang video sumber
      const downloadResult = await downloadVideo(job.sourceUrl, jobId);
      const newFilePath = path.join("/tmp/autoclip", `clip_recut_${jobId}_${i}.mp4`);

      // 2. Potong ulang sesuai timestamp yang tersimpan di DB
      await cutAndConvertClip(
        downloadResult.filePath,
        clip.startTime,
        clip.endTime,
        newFilePath,
        job.aspectRatioMode || "crop"
      );

      // Perbarui path file klip
      clip.filePath = newFilePath;

      // Hapus video sumber sementara
      if (fs.existsSync(downloadResult.filePath)) {
        try { fs.unlinkSync(downloadResult.filePath); } catch {}
      }
    }
  }

  // Ambil klip yang filenya sudah dipastikan siap
  const successfulClips = processedClips.filter((c) => c.filePath && fs.existsSync(c.filePath));

  if (!successfulClips.length) {
    const msg = "Gagal memproses atau memotong ulang klip.";
    await db
      .update(clipJobs)
      .set({ status: "error", errorMessage: msg, updatedAt: new Date() })
      .where(eq(clipJobs.jobId, jobId));
    await update("error", `❌ ${msg}`, { step: "error" });
    throw new Error(msg);
  }

  // === PROSES UPLOAD TO YOUTUBE ===
  try {
    await db
      .update(clipJobs)
      .set({ status: "uploading", updatedAt: new Date() })
      .where(eq(clipJobs.jobId, jobId));

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

      finalClips = finalClips.map((clip) => {
        const idx = successfulClips.indexOf(clip);
        const uploadResult = idx >= 0 ? uploadResults[idx] : null;
        if (uploadResult) {
          return { ...clip, youtubeVideoId: uploadResult.videoId, youtubeUrl: uploadResult.videoUrl };
        }
        return clip;
      });
    }

    await db
      .update(clipJobs)
      .set({
        status: "done",
        clips: finalClips,
        updatedAt: new Date(),
      })
      .where(eq(clipJobs.jobId, jobId));

    await update("done", "🎉 Semua klip berhasil dipublish!", { step: "done" });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await db
      .update(clipJobs)
      .set({ status: "error", errorMessage: errorMsg, updatedAt: new Date() })
      .where(eq(clipJobs.jobId, jobId));
    await update("error", `❌ Upload gagal: ${errorMsg}`, { step: "error" });
    throw err;
  }
}

await db
      .update(clipJobs)
      .set({
        status: "done",
        clips: finalClips,
        updatedAt: new Date(),
      })
      .where(eq(clipJobs.jobId, jobId));

    await update("done", "🎉 Semua klip berhasil dipublish!", { step: "done" });

    // 🧹 Pembersihan otomatis file sementara di /tmp
    cleanupJobFiles(jobId);

/**
 * Alur lama (download → ... → upload) dalam satu panggilan — dipertahankan
 * untuk kompatibilitas (dipakai kalau SCHEDULER_ENABLED=false atau YouTube
 * belum terhubung sama sekali, lihat src/lib/telegram-bot.ts).
 */
export async function processJob(jobId: string, onStatusUpdate?: StatusUpdateFn): Promise<void> {
  await processClipsOnly(jobId, onStatusUpdate);
  await publishJobClips(jobId, onStatusUpdate);
}

export function cleanupJobFiles(jobId: string): void {
  const downloadDir = "/tmp/autoclip";
  try {
    if (fs.existsSync(downloadDir)) {
      const files = fs.readdirSync(downloadDir);
      for (const file of files) {
        if (file.includes(jobId)) {
          const filePath = path.join(downloadDir, file);
          try {
            fs.unlinkSync(filePath);
            console.log(`[cleanup] Berhasil menghapus file sementara: ${filePath}`);
          } catch (e) {
            console.warn(`[cleanup] Gagal menghapus file ${filePath}:`, e);
          }
        }
      }
    }
  } catch (err) {
    console.warn(`[cleanup] Error saat membersihkan file untuk job ${jobId}:`, err);
  }
}