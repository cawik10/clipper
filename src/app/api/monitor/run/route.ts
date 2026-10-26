import { NextRequest, NextResponse } from "next/server";
import { runChannelMonitorOnce } from "@/lib/channel-monitor-worker";

/**
 * 📡 Auto-Monitor Channel/Playlist (BARU!)
 * =====================================================================
 * Endpoint cadangan untuk memaksa satu siklus pengecekan channel/playlist
 * secara manual atau lewat Railway Cron / external pinger — berguna kalau
 * worker in-process (src/instrumentation.ts) belum sempat jalan (mis. baru
 * saja deploy/restart). Aman dipanggil kapan saja & berkali-kali karena
 * `claimDueMonitors()` di src/lib/channel-monitor.ts bersifat atomic.
 *
 * Mirror pola yang sama dengan /api/scheduler/run — diamankan pakai
 * SETUP_SECRET dari env.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("secret") !== process.env.SETUP_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runChannelMonitorOnce();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
