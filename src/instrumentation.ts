/**
 * NEXT.JS INSTRUMENTATION HOOK
 * =====================================================================
 * Dijalankan SEKALI oleh Next.js setiap kali server/proses Node.js boot
 * (termasuk di `.next/standalone/server.js` hasil build Docker Railway).
 * Dipakai untuk menyalakan worker background fitur:
 *
 *   📡 Auto-Monitor Channel/Playlist (BARU!) — lihat
 *      src/lib/channel-monitor-worker.ts untuk logikanya. Kalau
 *      CHANNEL_MONITOR_ENABLED=false, worker tidak akan start sama sekali
 *      (lihat src/lib/channel-monitor-config.ts).
 *
 * File ini TIDAK mengubah route/handler lain apapun — murni bootstrap.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startChannelMonitorWorker } = await import("@/lib/channel-monitor-worker");
    startChannelMonitorWorker();

    // 📈 AI Analytics & Feedback Loop (BARU!) — sync views, laporan mingguan,
    // Smart Learning. Mati otomatis kalau ANALYTICS_ENABLED=false.
    const { startAnalyticsWorker } = await import("@/lib/analytics-worker");
    startAnalyticsWorker();

    // 🚨 Post-Upload Claim Monitor (BARU!) — cek berkala klaim/pembatasan video yang sudah
    // diupload (videos.list) + auto-blacklist channel sumber. Mati kalau CLAIM_MONITOR_ENABLED=false.
    const { startClaimMonitorWorker } = await import("@/lib/claim-monitor-worker");
    startClaimMonitorWorker();

    // 🛠️ Admin Panel (BARU!) — error tak tertangani dikirim ke admin Telegram
    // (ADMIN_TELEGRAM_IDS) + dicatat di log. Catatan: dengan listener
    // unhandledRejection, proses tidak lagi crash karena promise yang lupa di-catch.
    const { reportError } = await import("@/lib/admin-notify");
    const g = globalThis as typeof globalThis & { __adminErrorHooks?: boolean };
    if (!g.__adminErrorHooks) {
      g.__adminErrorHooks = true;
      process.on("unhandledRejection", (reason) => {
        console.error("[unhandledRejection]", reason);
        void reportError("Unhandled rejection", reason);
      });
      process.on("uncaughtExceptionMonitor", (err) => {
        void reportError("Uncaught exception", err);
      });
    }
  }
}
