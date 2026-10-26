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
  }
}
