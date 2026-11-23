/**
 * 🚨 POST-UPLOAD CLAIM MONITOR — BACKGROUND WORKER (FITUR BARU!)
 * =====================================================================
 * Dijalankan sekali saat server boot (lihat src/instrumentation.ts), lalu
 * mengulang setiap CLAIM_MONITOR_INTERVAL_MINUTES (default 60 menit):
 * cek status video di YouTube → alert klaim → hitung rasio → auto-blacklist.
 *
 * Worker ini berdiri sendiri (tidak bergantung ANALYTICS_ENABLED) dan mati total
 * kalau CLAIM_MONITOR_ENABLED=false. Bisa dipicu manual lewat /claims run di
 * Telegram atau GET /api/claims/run?secret=... (Railway Cron).
 */

import { CLAIM_FIRST_RUN_DELAY_MS, getClaimIntervalMinutes, isClaimMonitorEnabled } from "@/lib/claim-monitor-config";
import { runClaimMonitor } from "@/lib/claim-monitor";

const globalForWorker = globalThis as typeof globalThis & {
  __claimMonitorWorkerStarted?: boolean;
  __claimMonitorWorkerTimer?: ReturnType<typeof setInterval>;
};

export function startClaimMonitorWorker(): void {
  if (!isClaimMonitorEnabled()) {
    console.log("[claim-monitor] Worker tidak dijalankan (CLAIM_MONITOR_ENABLED=false).");
    return;
  }
  if (globalForWorker.__claimMonitorWorkerStarted) return;
  globalForWorker.__claimMonitorWorkerStarted = true;

  const intervalMs = getClaimIntervalMinutes() * 60_000;

  const tick = async () => {
    try {
      const r = await runClaimMonitor();
      if (r.discovered || r.checked || r.newClaims || r.blacklisted || r.errors.length) {
        console.log(
          `[claim-monitor] dicek ${r.checked} video • klaim baru ${r.newClaims} • dilepas ${r.cleared} • alert ${r.alerted} • blacklist ${r.blacklisted}` +
            (r.errors.length ? ` • error: ${r.errors.slice(0, 2).join(" | ")}` : "")
        );
      }
    } catch (err) {
      console.error("[claim-monitor] Tick worker gagal:", err instanceof Error ? err.message : err);
    }
  };

  // Tunda di awal supaya DB & bot Telegram siap, lalu ulangi berkala.
  setTimeout(tick, CLAIM_FIRST_RUN_DELAY_MS);
  globalForWorker.__claimMonitorWorkerTimer = setInterval(tick, intervalMs);
  console.log(`[claim-monitor] Worker aktif — cek klaim setiap ${getClaimIntervalMinutes()} menit.`);
}
