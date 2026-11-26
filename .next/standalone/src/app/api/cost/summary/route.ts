import { NextRequest, NextResponse } from "next/server";
import { getCostReportDays } from "@/lib/cost-config";
import {
  getBudgetStatus,
  getByFeature,
  getByModel,
  getByUser,
  getRecentJobCosts,
  getTotals,
  periodStart,
  startOfLocalDay,
} from "@/lib/cost-tracker";

/**
 * 💰 Cost Tracker (BARU!)
 * =====================================================================
 * Ekspor ringkasan biaya AI sebagai JSON (mis. untuk spreadsheet, dashboard
 * billing, atau menghitung harga bila bot dijual sebagai layanan).
 * Diamankan pakai SETUP_SECRET (pola sama dengan /api/claims/run).
 *
 *   GET /api/cost/summary?secret=...              → periode default (COST_REPORT_DAYS)
 *   GET /api/cost/summary?secret=...&days=30      → periode 30 hari (1–365)
 *   GET /api/cost/summary?secret=...&user=12345   → hanya satu user Telegram
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  if (!process.env.SETUP_SECRET || params.get("secret") !== process.env.SETUP_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const rawDays = parseInt(params.get("days") ?? "", 10);
    const days = Number.isFinite(rawDays) ? Math.min(365, Math.max(1, rawDays)) : getCostReportDays();
    const userId = params.get("user")?.trim() || null;
    const since = periodStart(days);

    const [budget, today, period, byModel, byFeature, byUser, jobs] = await Promise.all([
      getBudgetStatus(userId),
      getTotals(startOfLocalDay(), userId),
      getTotals(since, userId),
      getByModel(since, userId),
      getByFeature(since, userId),
      userId ? Promise.resolve([]) : getByUser(since, 50),
      getRecentJobCosts(userId, 50, since),
    ]);

    return NextResponse.json({
      days,
      userId,
      currency: "USD",
      budget: {
        allowed: budget.allowed,
        mode: budget.mode,
        scope: budget.scope,
        dailyLimitUsd: budget.dailyLimit,
        userLimitUsd: budget.userLimit,
        spentTodayUsd: budget.spentToday,
        userSpentTodayUsd: budget.userSpentToday,
        resetAt: budget.resetAt.toISOString(),
      },
      today,
      period,
      byModel,
      byFeature,
      byUser,
      jobs,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
