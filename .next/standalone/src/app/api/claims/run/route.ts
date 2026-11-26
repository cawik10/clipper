import { NextRequest, NextResponse } from "next/server";
import { runClaimMonitor } from "@/lib/claim-monitor";

/**
 * 🚨 Post-Upload Claim Monitor (BARU!)
 * =====================================================================
 * Endpoint cadangan untuk memaksa satu siklus pengecekan klaim secara manual
 * atau lewat Railway Cron / external pinger. Diamankan pakai SETUP_SECRET
 * (pola sama dengan /api/monitor/run & /api/analytics/run).
 *
 *   GET /api/claims/run?secret=...            → siklus normal (hormati jeda per video)
 *   GET /api/claims/run?secret=...&force=1    → cek semua video sekarang
 *   GET /api/claims/run?secret=...&notify=0   → tanpa kirim alert Telegram
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  if (params.get("secret") !== process.env.SETUP_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runClaimMonitor({
      force: params.get("force") === "1",
      notify: params.get("notify") === "0" ? false : undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
