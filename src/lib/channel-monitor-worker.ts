/**
 * 📡 AUTO-MONITOR CHANNEL/PLAYLIST — BACKGROUND WORKER (BARU!)
 * =====================================================================
 * Di sinilah "keajaiban" fitur ini terjadi: dipanggil berkala (lihat
 * `startChannelMonitorWorker()`, dijalankan sekali saat server boot oleh
 * src/instrumentation.ts) untuk mengecek channel/playlist yang terdaftar,
 * menemukan video baru, lalu OTOMATIS menjalankan pipeline AutoClip penuh
 * (download → transkripsi → analisis AI → potong klip → upload YouTube)
 * dan mengirim hasilnya ke Telegram user — TANPA user perlu mengirim link
 * video secara manual sama sekali.
 *
 * Sebagai jaring pengaman tambahan (misal container baru restart dan
 * worker belum lama berjalan, atau mau dipicu manual), endpoint
 * `GET /api/monitor/run` (lihat src/app/api/monitor/run/route.ts) bisa
 * dipanggil kapan saja oleh Railway Cron / external pinger untuk memaksa
 * satu siklus pengecekan — aman dipanggil bersamaan berkat `claimDueMonitors()`
 * yang atomic (lihat src/lib/channel-monitor.ts).
 *
 * File ini TIDAK mengubah job-processor.ts / telegram-bot.ts yang sudah
 * ada — hanya memakai fungsi yang sudah diekspor dari sana, sama seperti
 * pola src/app/api/scheduler/run/route.ts.
 */

import fs from "fs";
import { InputFile } from "grammy";
import { bot } from "@/lib/telegram-bot";
import { processJob } from "@/lib/job-processor";
import { db } from "@/db";
import { clipJobs, ClipResult } from "@/db/schema";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { TelegramProgressTracker } from "@/lib/telegram-progress-tracker";
import {
  claimDueMonitors,
  findNewVideos,
  createJobForMonitoredVideo,
  recordMonitoredVideo,
  updateMonitoredVideoStatus,
  markMonitorChecked,
  incrementMonitorProcessedCount,
  type VideoItem,
} from "@/lib/channel-monitor";
import { MonitoredChannelRow } from "@/db/schema";
import { getChannelMonitorPollIntervalMs, isChannelMonitorEnabled } from "@/lib/channel-monitor-config";

function safeMd(text: string): string {
  return (text || "").replace(/[_*[\]()~`>#+\-=|{}.!]/g, " ");
}

export interface MonitorRunResult {
  enabled: boolean;
  checked: number;
  newVideos: number;
  processed: number;
  errors: number;
}

/**
 * Satu siklus penuh: klaim monitor yang due → cek video baru → proses tiap
 * video baru lewat pipeline AutoClip, berurutan (biar tidak membebani
 * CPU/FFmpeg kalau banyak channel update bersamaan).
 */
export async function runChannelMonitorOnce(): Promise<MonitorRunResult> {
  if (!isChannelMonitorEnabled()) {
    return { enabled: false, checked: 0, newVideos: 0, processed: 0, errors: 0 };
  }

  const dueMonitors = await claimDueMonitors();
  let newVideos = 0;
  let processed = 0;
  let errors = 0;

  for (const monitor of dueMonitors) {
    try {
      const fresh = await findNewVideos(monitor);
      newVideos += fresh.length;

      for (const video of fresh) {
        try {
          await processMonitoredVideo(monitor, video);
          processed++;
        } catch (err) {
          errors++;
          console.error(`[channel-monitor] Gagal memproses video ${video.id} (monitor #${monitor.id}):`, err);
        }
      }

      if (fresh.length) {
        await incrementMonitorProcessedCount(monitor.id, fresh.filter((v) => v).length);
        await markMonitorChecked(monitor.id, fresh[fresh.length - 1]);
      } else {
        await markMonitorChecked(monitor.id);
      }
    } catch (err) {
      errors++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[channel-monitor] Gagal cek monitor #${monitor.id} (${monitor.title}):`, msg);
      await markMonitorChecked(monitor.id, undefined, msg).catch(() => {});
    }
  }

  return { enabled: true, checked: dueMonitors.length, newVideos, processed, errors };
}

/** Jalankan pipeline AutoClip penuh untuk satu video baru + kirim notifikasi real-time ke Telegram. */
async function processMonitoredVideo(monitor: MonitoredChannelRow, video: VideoItem): Promise<void> {
  const jobId = uuidv4();
  await createJobForMonitoredVideo(monitor, video, jobId);
  await recordMonitoredVideo({
    monitorId: monitor.id,
    videoId: video.id,
    title: video.title,
    publishedAt: video.publishedAt,
    status: "processing",
    jobId,
  });

  const chatId = Number(monitor.telegramChatId);

  await bot.api
    .sendMessage(
      chatId,
      `📡 *Upload baru terdeteksi!*\n\n*${safeMd(monitor.title || "Channel")}*\nVideo: ${safeMd(video.title)}\n\n🤖 Auto-clip dimulai otomatis, tidak perlu kirim link manual...`,
      { parse_mode: "Markdown" }
    )
    .catch((err) => console.error("[channel-monitor] Gagal kirim notifikasi awal:", err));

  const tracker = new TelegramProgressTracker({
    api: bot.api,
    chatId,
    jobId,
    title: `📡 ${monitor.title || "Monitor"}`,
    jobLabel: `\`${video.title.slice(0, 60)}\``,
  });
  await tracker.start().catch(() => {});

  const onStatusUpdate = async (status: string, message: string, meta?: { step?: string; percent?: number }) => {
    if (status === "error") {
      await tracker.fail(message).catch(() => {});
      return;
    }
    await tracker.update(meta?.step ?? status, { detail: message, percent: meta?.percent }).catch(() => {});
  };

  try {
    await processJob(jobId, onStatusUpdate);

    const jobs = await db.select().from(clipJobs).where(eq(clipJobs.jobId, jobId));
    const job = jobs[0];

    if (job?.status === "done" && job.clips) {
      const clips = (job.clips as ClipResult[]).filter((c) => c.filePath);
      await tracker.finishSuccess(`🎬 *${clips.length} klip otomatis berhasil dibuat & diupload!*`).catch(() => {});

      for (let i = 0; i < clips.length; i++) {
        const clip = clips[i];
        try {
          if (clip.thumbnailPath && fs.existsSync(clip.thumbnailPath)) {
            await bot.api.sendPhoto(chatId, new InputFile(clip.thumbnailPath), {
              caption: `Thumbnail Klip ${i + 1}`,
            });
          }
          const caption =
            `🎬 *${safeMd(clip.title)}*\n` +
            `⭐ Viral Score: ${clip.viralScore}/10\n` +
            (clip.youtubeUrl ? `🔗 ${clip.youtubeUrl}` : "");
          await bot.api.sendVideo(chatId, new InputFile(clip.filePath!), {
            caption,
            parse_mode: "Markdown",
          });
        } catch (err) {
          console.error(`[channel-monitor] Gagal kirim klip ${i + 1}:`, err);
        }
        setTimeout(() => {
          if (clip.filePath && fs.existsSync(clip.filePath)) {
            try { fs.unlinkSync(clip.filePath); } catch {}
          }
          if (clip.thumbnailPath && fs.existsSync(clip.thumbnailPath)) {
            try { fs.unlinkSync(clip.thumbnailPath); } catch {}
          }
        }, 30000);
      }

      await updateMonitoredVideoStatus(monitor.id, video.id, "done", undefined);
    } else if (job?.status === "error") {
      const errMsg = job.errorMessage || "Terjadi kesalahan tidak diketahui";
      await tracker.finishError(safeMd(errMsg)).catch(() => {});
      await updateMonitoredVideoStatus(monitor.id, video.id, "error", errMsg);
    } else {
      await updateMonitoredVideoStatus(monitor.id, video.id, "done", undefined);
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await tracker.finishError(safeMd(errMsg)).catch(() => {});
    await updateMonitoredVideoStatus(monitor.id, video.id, "error", errMsg);
    throw err;
  }
}

// ─── IN-PROCESS BACKGROUND LOOP ──────────────────────────────────────────
// Dipanggil sekali dari src/instrumentation.ts saat server Next.js boot.
// Dibuat sebagai singleton (pola sama dgn pool DB di src/db/index.ts) supaya
// tidak membuat banyak interval saat hot-reload di development.
const globalForMonitor = globalThis as typeof globalThis & {
  __autoclipChannelMonitorStarted?: boolean;
  __autoclipChannelMonitorTimer?: ReturnType<typeof setInterval>;
};

export function startChannelMonitorWorker(): void {
  if (!isChannelMonitorEnabled()) {
    console.log("[channel-monitor] Worker tidak dijalankan (CHANNEL_MONITOR_ENABLED=false).");
    return;
  }
  if (globalForMonitor.__autoclipChannelMonitorStarted) return;
  globalForMonitor.__autoclipChannelMonitorStarted = true;

  const intervalMs = getChannelMonitorPollIntervalMs();

  const tick = async () => {
    try {
      const result = await runChannelMonitorOnce();
      if (result.checked > 0 || result.newVideos > 0) {
        console.log(
          `[channel-monitor] Cek ${result.checked} channel/playlist — ${result.newVideos} video baru, ${result.processed} berhasil diproses, ${result.errors} error.`
        );
      }
    } catch (err) {
      console.error("[channel-monitor] Tick worker gagal:", err);
    }
  };

  // Tunda sedikit di awal supaya koneksi DB/bot Telegram siap, lalu ulangi berkala.
  setTimeout(tick, 15_000);
  globalForMonitor.__autoclipChannelMonitorTimer = setInterval(tick, intervalMs);

  console.log(`[channel-monitor] Worker aktif — cek channel/playlist setiap ${Math.round(intervalMs / 1000)} detik.`);
}
