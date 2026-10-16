/**
 * GET/POST /api/schedule/run?secret=xxx
 * Jaring pengaman manual untuk memaksa worker scheduler memproses antrean
 * yang sudah jatuh tempo. Worker background (src/lib/scheduler-worker.ts)
 * sudah berjalan otomatis di proses server, tapi endpoint ini berguna untuk:
 *   - Railway Cron Job / external uptime pinger sebagai pengaman tambahan
 *   - Trigger manual saat debugging
 *
 * Lindungi dengan SETUP_SECRET / SCHEDULER_SECRET (sama polanya dengan
 * /api/webhook/setup yang sudah ada) — tidak mengubah endpoint lain.
 */
import { NextRequest, NextResponse } from "next/server";
import { runDueScheduledPosts } from "@/lib/scheduler";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function isAuthorized(req: NextRequest): boolean {
  const secret = req.nextUrl.searchParams.get("secret");
  const expected = process.env.SCHEDULER_SECRET || process.env.SETUP_SECRET || "setup-autoclip-2024";
  return secret === expected;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runDueScheduledPosts();
  return NextResponse.json({ ok: true, ...result });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
