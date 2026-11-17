import { NextRequest, NextResponse } from "next/server";
import { isAnalyticsEnabled } from "@/lib/analytics-config";
import { runAnalyticsCycle, sendWeeklyReport } from "@/lib/analytics-worker";
import { syncUserStats } from "@/lib/analytics-store";
import { runSmartLearning } from "@/lib/analytics-learning";

export const dynamic = "force-dynamic";

/**
 * 📈 AI Analytics — pemicu manual / Railway Cron (FITUR BARU!)
 *
 *   GET /api/analytics/run?secret=<SETUP_SECRET>                      → satu siklus worker (sync + laporan kalau sudah jadwalnya)
 *   GET /api/analytics/run?secret=...&action=sync                    → paksa sync views semua user
 *   GET /api/analytics/run?secret=...&action=report                  → paksa kirim laporan mingguan ke semua user
 *   GET /api/analytics/run?secret=...&action=report&userId=123       → ... hanya untuk satu user
 *   GET /api/analytics/run?secret=...&action=learn&userId=123        → paksa Smart Learning untuk satu user
 */
export async function GET(req: NextRequest) {
  const secret = process.env.SETUP_SECRET;
  if (!secret || req.nextUrl.searchParams.get("secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAnalyticsEnabled()) {
    return NextResponse.json({ enabled: false, message: "ANALYTICS_ENABLED=false" });
  }

  const action = req.nextUrl.searchParams.get("action") || "cycle";
  const userId = req.nextUrl.searchParams.get("userId") || undefined;

  try {
    if (action === "sync") {
      const { listTrackedUserIds } = await import("@/lib/analytics-store");
      const ids = userId ? [userId] : await listTrackedUserIds();
      const results = [];
      for (const id of ids) results.push({ userId: id, ...(await syncUserStats(id)) });
      return NextResponse.json({ action, results });
    }

    if (action === "learn") {
      if (!userId) return NextResponse.json({ error: "userId wajib untuk action=learn" }, { status: 400 });
      await syncUserStats(userId);
      return NextResponse.json({ action, result: await runSmartLearning(userId, { force: true }) });
    }

    if (action === "report") {
      const { listTrackedUserIds } = await import("@/lib/analytics-store");
      const ids = userId ? [userId] : await listTrackedUserIds();
      const results = [];
      for (const id of ids) results.push(await sendWeeklyReport(id));
      return NextResponse.json({ action, results });
    }

    return NextResponse.json({ action: "cycle", ...(await runAnalyticsCycle()) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
