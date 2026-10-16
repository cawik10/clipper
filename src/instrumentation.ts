/**
 * Next.js instrumentation hook — dijalankan SEKALI saat server boot.
 * Dipakai untuk menyalakan worker background Scheduler / Queue Posting
 * (lihat src/lib/scheduler-worker.ts) tanpa perlu mengubah entrypoint lain
 * atau menambah proses terpisah di Railway.
 *
 * Fitur BARU & additive — kalau file ini dihapus, seluruh fitur lain
 * (dashboard, bot Telegram, job AutoClip) tetap berjalan normal seperti
 * biasa; hanya penjadwalan otomatis yang tidak akan berjalan.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startSchedulerWorker } = await import("@/lib/scheduler-worker");
    startSchedulerWorker();
  }
}
