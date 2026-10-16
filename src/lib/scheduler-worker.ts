/**
 * 📅 SCHEDULER / QUEUE POSTING — BACKGROUND WORKER
 * ===================================================
 * Dipanggil sekali saat server Next.js boot (lihat instrumentation.ts) agar
 * antrean di tabel `scheduled_posts` otomatis dieksekusi tepat waktu tanpa
 * perlu Railway Cron terpisah. Dibuat sebagai singleton (seperti pool DB di
 * src/db/index.ts) supaya tidak membuat banyak interval saat hot-reload.
 *
 * Catatan: ini berjalan karena aplikasi di-deploy sebagai proses Node.js
 * yang hidup terus-menerus di Railway (bukan serverless function), sama
 * seperti webhook Telegram yang sudah berjalan di proses yang sama.
 *
 * Sebagai jaring pengaman tambahan (misal kontainer baru saja restart dan
 * worker belum lama berjalan), endpoint `GET/POST /api/schedule/run` bisa
 * dipanggil manual atau oleh Railway Cron/external pinger kapan saja untuk
 * memaksa pengecekan antrean — lihat src/app/api/schedule/run/route.ts.
 */

import { getSchedulerPollIntervalMs } from "@/lib/scheduler-config";
import { runDueScheduledPosts } from "@/lib/scheduler";

const globalForScheduler = globalThis as typeof globalThis & {
  __autoclipSchedulerStarted?: boolean;
  __autoclipSchedulerTimer?: ReturnType<typeof setInterval>;
};

export function startSchedulerWorker(): void {
  if (globalForScheduler.__autoclipSchedulerStarted) return;
  globalForScheduler.__autoclipSchedulerStarted = true;

  const intervalMs = getSchedulerPollIntervalMs();

  const tick = async () => {
    try {
      const { processed } = await runDueScheduledPosts();
      if (processed > 0) {
        console.log(`[scheduler-worker] ${processed} antrean terjadwal berhasil diproses.`);
      }
    } catch (err) {
      console.error("[scheduler-worker] Gagal menjalankan pengecekan antrean:", err);
    }
  };

  // Jalankan sekali di awal (tunda sedikit agar koneksi DB/bot siap), lalu
  // berulang sesuai SCHEDULER_POLL_INTERVAL_MS (default 60 detik).
  setTimeout(tick, 10_000);
  globalForScheduler.__autoclipSchedulerTimer = setInterval(tick, intervalMs);

  console.log(`[scheduler-worker] Worker aktif — cek antrean setiap ${Math.round(intervalMs / 1000)} detik.`);
}
