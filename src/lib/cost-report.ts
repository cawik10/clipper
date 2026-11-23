/**
 * 💰 COST TRACKER — LAPORAN (FITUR BARU!)
 * =====================================================================
 * Membangun teks (format HTML Telegram) untuk:
 *   • /cost, /cost 30, /cost models, /cost jobs, /cost users   → src/lib/cost-telegram.ts
 *   • Bagian "Biaya AI" di laporan mingguan                    → src/lib/analytics-worker.ts
 *
 * Mau ubah tampilan/isi laporan? Cukup edit file ini. Label fitur ada di
 * FEATURE_LABELS (src/lib/cost-config.ts).
 */

import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { adminUsers } from "@/db/schema";
import { isAdmin } from "@/lib/admin-config";
import { ensureAdminTables } from "@/lib/admin-store";
import { escapeHtml } from "@/lib/analytics-report";
import {
  featureLabel,
  getBudgetMode,
  getCostReportDays,
  getCostTopN,
  getCostTimezone,
  getDailyBudgetUsd,
  getUserDailyBudgetUsd,
  isCostInWeeklyReport,
  isCostTrackerEnabled,
  resolvePrice,
} from "@/lib/cost-config";
import {
  budgetBlockedMessage,
  formatMoney,
  formatUsd,
  getBudgetStatus,
  getByFeature,
  getByModel,
  getByUser,
  getRecentJobCosts,
  getTotals,
  periodStart,
  startOfLocalDay,
  type BudgetStatus,
  type ModelRow,
} from "@/lib/cost-tracker";

function bar(percent: number): string {
  const filled = Math.round(Math.min(100, Math.max(0, percent)) / 10);
  return "█".repeat(filled) + "░".repeat(10 - filled);
}

function trunc(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function modelLabel(r: Pick<ModelRow, "provider" | "model">): string {
  return `${escapeHtml(r.model)} <i>(${escapeHtml(r.provider)})</i>`;
}

function hours(seconds: number): string {
  return seconds >= 3600 ? `${(seconds / 3600).toFixed(2)} jam` : `${Math.round(seconds / 60)} mnt`;
}

function tokens(n: number): string {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
}

async function userNames(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const real = ids.filter((i) => /^-?\d+$/.test(i));
  if (!real.length) return map;
  try {
    await ensureAdminTables();
    const rows = await db.select().from(adminUsers).where(inArray(adminUsers.telegramUserId, real));
    for (const u of rows) {
      const name = u.username ? `@${u.username}` : [u.firstName, u.lastName].filter(Boolean).join(" ");
      if (name) map.set(u.telegramUserId, name);
    }
  } catch {
    /* nama hanya pemanis — pakai ID */
  }
  return map;
}

// ─── BARIS BUDGET ────────────────────────────────────────────────────────

/** Baris status batas harian. `global` = lihat batas semua user (admin), selain itu batas milik user. */
export function budgetLines(s: BudgetStatus, view: "global" | "user"): string[] {
  const lines: string[] = [];
  const mode = getBudgetMode();
  const resetNote = `reset ${s.resetAt.toLocaleTimeString("id-ID", { timeZone: getCostTimezone(), hour: "2-digit", minute: "2-digit" })} (${getCostTimezone()})`;

  if (view === "global") {
    if (s.dailyLimit > 0) {
      const icon = s.scope === "global" ? "⏸️" : s.percent >= 80 ? "⚠️" : "💳";
      lines.push(
        `${icon} Batas harian: <b>${formatUsd(s.dailyLimit)}</b> — terpakai ${formatUsd(s.spentToday)} (${Math.round(s.percent)}%)`,
        `<code>${bar(s.percent)}</code> <i>${resetNote}</i>`
      );
    } else {
      lines.push("💳 Batas harian: <b>tanpa batas</b> (set <code>DAILY_BUDGET_USD</code>)");
    }
    if (s.userLimit > 0) lines.push(`👤 Batas per user: <b>${formatUsd(s.userLimit)}</b>/hari`);
    if (mode === "warn") lines.push("<i>Mode warn: hanya notifikasi, AI tidak dijeda.</i>");
    if (mode === "off") lines.push("<i>Mode off: batas tidak diberlakukan.</i>");
    if (!s.allowed) lines.push(`⏸️ <b>AI sedang DIJEDA.</b> ${escapeHtml(budgetBlockedMessage(s))}`);
    return lines;
  }

  // view user: jangan bocorkan biaya global ke user biasa
  if (s.userLimit > 0 && s.userSpentToday !== null) {
    const pct = (s.userSpentToday / s.userLimit) * 100;
    lines.push(
      `${s.scope === "user" ? "⏸️" : "💳"} Batas harianmu: <b>${formatUsd(s.userLimit)}</b> — terpakai ${formatUsd(s.userSpentToday)} (${Math.round(pct)}%)`,
      `<code>${bar(pct)}</code> <i>${resetNote}</i>`
    );
  }
  if (!s.allowed) lines.push(`⏸️ <b>AI sedang dijeda.</b> ${s.scope === "user" ? "Batas harianmu tercapai." : "Batas harian bot tercapai."} Coba lagi setelah reset.`);
  return lines;
}

// ─── LAPORAN UTAMA (/cost) ───────────────────────────────────────────────

/**
 * Ringkasan biaya. `userId` kosong = semua user (khusus admin).
 * Berisi: hari ini + N hari, status batas harian, per fitur, per model, (admin) user teratas.
 */
export async function buildCostReport(opts: { userId?: string | null; days: number; weekly?: boolean }): Promise<string> {
  const { userId = null, days } = opts;
  const since = periodStart(days);
  const todayStart = startOfLocalDay();
  const [today, period, features, models, budget] = await Promise.all([
    getTotals(todayStart, userId),
    getTotals(since, userId),
    getByFeature(since, userId),
    getByModel(since, userId),
    getBudgetStatus(userId),
  ]);

  const scopeLabel = userId ? "akunmu" : "semua user";
  const lines: string[] = [
    opts.weekly ? `💰 <b>Biaya AI Mingguan</b> — ${scopeLabel}` : `💰 <b>Biaya AI</b> — ${scopeLabel}`,
    `🗓 <i>${days} hari terakhir</i>`,
    "",
  ];

  lines.push("📊 <b>Ringkasan</b>");
  lines.push(`• Hari ini: <b>${escapeHtml(formatMoney(today.cost))}</b> (${today.calls} panggilan AI)`);
  lines.push(`• ${days} hari: <b>${escapeHtml(formatMoney(period.cost))}</b> (${period.calls} panggilan · ${period.jobs} job)`);
  if (period.jobs > 0) {
    lines.push(`• Rata-rata per job: <b>${escapeHtml(formatMoney(period.jobCost / period.jobs))}</b>`);
  }
  lines.push("");

  const bl = budgetLines(budget, userId ? "user" : "global");
  if (bl.length) lines.push(...bl, "");

  if (!period.calls) {
    lines.push("Belum ada biaya AI tercatat di periode ini. Kirim link video ke bot — biaya tiap job akan muncul di sini.");
    return lines.join("\n");
  }

  lines.push("🧩 <b>Per Fitur</b>");
  features.forEach((f) => {
    const pct = period.cost > 0 ? Math.round((f.cost / period.cost) * 100) : 0;
    lines.push(`• ${escapeHtml(featureLabel(f.feature))} — ${formatUsd(f.cost)} (${pct}%) · ${f.calls}×`);
  });
  lines.push("");

  lines.push("🤖 <b>Per Model</b>");
  models.slice(0, getCostTopN()).forEach((m) => {
    lines.push(`• ${modelLabel(m)} — <b>${formatUsd(m.cost)}</b> · ${m.calls}×${m.estimated ? " ≈" : ""}`);
  });
  if (models.some((m) => m.estimated)) lines.push("<i>≈ = token/harga diperkirakan (model belum ada di tabel harga).</i>");

  if (!userId) {
    const users = await getByUser(since, getCostTopN());
    const names = await userNames(users.map((u) => u.userId));
    lines.push("", "👥 <b>Pemakai Terbesar</b>");
    users.forEach((u, i) => {
      const name = names.get(u.userId);
      lines.push(
        `${i + 1}. <code>${escapeHtml(u.userId)}</code>${name ? ` ${escapeHtml(name)}` : ""} — <b>${formatUsd(u.cost)}</b> · ${u.jobs} job`
      );
    });
  }

  return lines.join("\n");
}

// ─── PERBANDINGAN MODEL (/cost models) ───────────────────────────────────

export async function buildModelReport(opts: { userId?: string | null; days: number }): Promise<string> {
  const rows = await getByModel(periodStart(opts.days), opts.userId ?? null);
  const lines = ["🤖 <b>Perbandingan Model</b>", `🗓 <i>${opts.days} hari terakhir</i>`, ""];
  if (!rows.length) {
    lines.push("Belum ada data. Proses beberapa video dulu, lalu bandingkan biaya tiap model di sini.");
    return lines.join("\n");
  }
  const total = rows.reduce((n, r) => n + r.cost, 0);
  rows.forEach((r) => {
    const share = total > 0 ? Math.round((r.cost / total) * 100) : 0;
    lines.push(`<b>${modelLabel(r)}</b>${r.estimated ? " ≈" : ""}`);
    const parts = [`${formatUsd(r.cost)} (${share}%)`, `${r.calls} panggilan`, `${formatUsd(r.cost / Math.max(1, r.calls))}/panggilan`];
    if (r.jobs > 0) parts.push(`${formatUsd(r.cost / r.jobs)}/job`);
    lines.push(`   ${parts.join(" · ")}`);
    if (r.audioSeconds > 0) {
      lines.push(`   🎧 ${hours(r.audioSeconds)} audio · ${formatUsd((r.cost / r.audioSeconds) * 3600)}/jam`);
    } else {
      lines.push(`   🔤 ${tokens(r.inputTokens)} token masuk · ${tokens(r.outputTokens)} keluar`);
    }
  });
  lines.push(
    "",
    "💡 <i>Untuk mencoba model lain, ubah GEMINI_MODEL / GROQ_MODEL / GROQ_WHISPER_MODEL / AI_PROVIDER_ORDER di Railway Variables, " +
      "proses beberapa video, lalu bandingkan biaya per job di sini.</i>"
  );
  return lines.join("\n");
}

// ─── BIAYA PER JOB (/cost jobs) ──────────────────────────────────────────

export async function buildJobsReport(opts: { userId?: string | null; limit?: number }): Promise<string> {
  const limit = opts.limit ?? 8;
  const jobs = await getRecentJobCosts(opts.userId ?? null, limit);
  const lines = ["🧾 <b>Biaya per Job</b>", `<i>${jobs.length} job terakhir</i>`, ""];
  if (!jobs.length) {
    lines.push("Belum ada job dengan biaya AI tercatat.");
    return lines.join("\n");
  }
  const names = opts.userId ? new Map<string, string>() : await userNames(jobs.map((j) => j.userId || "").filter(Boolean));
  jobs.forEach((j, i) => {
    const title = escapeHtml(trunc(j.title || `Job ${j.jobId.slice(0, 8)}`, 48));
    const date = j.at.toLocaleString("id-ID", { timeZone: getCostTimezone(), day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    const extra = [`${j.calls} panggilan`];
    if (j.clips) extra.push(`${j.clips} klip · ${formatUsd(j.cost / j.clips)}/klip`);
    lines.push(`${i + 1}. <b>${title}</b>`);
    lines.push(`   ${escapeHtml(formatMoney(j.cost))} · ${extra.join(" · ")}`);
    const who = !opts.userId && j.userId ? ` · 👤 ${escapeHtml(names.get(j.userId) || j.userId)}` : "";
    lines.push(`   <i>${date}${j.status ? ` · ${escapeHtml(j.status)}` : ""}${who}</i>`);
  });
  return lines.join("\n");
}

// ─── PER USER (/cost users — admin) ──────────────────────────────────────

export async function buildUsersReport(days: number): Promise<string> {
  const users = await getByUser(periodStart(days), 15);
  const lines = ["👥 <b>Biaya per User</b>", `🗓 <i>${days} hari terakhir</i>`, ""];
  if (!users.length) {
    lines.push("Belum ada data.");
    return lines.join("\n");
  }
  const names = await userNames(users.map((u) => u.userId));
  const total = users.reduce((n, u) => n + u.cost, 0);
  users.forEach((u, i) => {
    const name = names.get(u.userId);
    lines.push(
      `${i + 1}. <code>${escapeHtml(u.userId)}</code>${name ? ` ${escapeHtml(name)}` : ""}\n` +
        `   <b>${escapeHtml(formatMoney(u.cost))}</b> · ${u.jobs} job · ${u.calls} panggilan` +
        (u.jobs > 0 ? ` · ${formatUsd(u.cost / u.jobs)}/job` : "")
    );
  });
  lines.push("", `Total: <b>${escapeHtml(formatMoney(total))}</b>`);
  lines.push("<i>Data ini berguna untuk menentukan harga langganan bila bot dijual sebagai layanan.</i>");
  return lines.join("\n");
}

// ─── HARGA YANG DIPAKAI (/cost price — admin) ────────────────────────────

export async function buildPriceReport(models: Array<{ label: string; model: string; kind: "text" | "audio" }>): Promise<string> {
  const lines = ["🏷️ <b>Harga Model yang Dipakai</b>", ""];
  for (const m of models) {
    const p = resolvePrice(m.model, m.kind);
    const price =
      m.kind === "audio"
        ? `${formatUsd(p.perHour ?? 0)}/jam audio`
        : `${formatUsd(p.in ?? 0)} masuk · ${formatUsd(p.out ?? 0)} keluar per 1 juta token`;
    const src = p.source === "override" ? "override env" : p.source === "unknown" ? "⚠️ tidak dikenal (perkiraan)" : "tabel bawaan";
    lines.push(`• <b>${escapeHtml(m.label)}</b>: <code>${escapeHtml(m.model)}</code>\n   ${price} <i>(${src})</i>`);
  }
  lines.push(
    "",
    "<i>Ubah harga tanpa deploy: <code>COST_PRICE_OVERRIDES</code> di Railway Variables, atau edit MODEL_PRICES di src/lib/cost-config.ts.</i>"
  );
  return lines.join("\n");
}

// ─── BAGIAN LAPORAN MINGGUAN ─────────────────────────────────────────────

/**
 * Blok "Biaya AI" yang ditempel di laporan mingguan Telegram (src/lib/analytics-worker.ts).
 * Kosong ("") kalau fitur mati atau belum ada biaya — jadi laporan lama tidak berubah.
 * Admin juga mendapat ringkasan SEMUA user + pemakai terbesar.
 */
export async function buildWeeklyCostSection(userId: string): Promise<string> {
  if (!isCostTrackerEnabled() || !isCostInWeeklyReport()) return "";
  const days = getCostReportDays();
  const since = periodStart(days);

  const own = await getTotals(since, userId);
  const admin = isAdmin(userId);
  if (!own.calls && !admin) return "";

  const lines: string[] = ["", "", `💰 <b>Biaya AI — ${days} hari terakhir</b>`];

  if (own.calls) {
    const [features, models] = await Promise.all([getByFeature(since, userId), getByModel(since, userId)]);
    lines.push(`• Akunmu: <b>${escapeHtml(formatMoney(own.cost))}</b> · ${own.jobs} job${own.jobs ? ` · ≈${escapeHtml(formatUsd(own.jobCost / own.jobs))}/job` : ""}`);
    features.slice(0, 3).forEach((f) => lines.push(`  ▫️ ${escapeHtml(featureLabel(f.feature))}: ${formatUsd(f.cost)}`));
    models.slice(0, 3).forEach((m) => lines.push(`  ▫️ ${escapeHtml(m.model)}: ${formatUsd(m.cost)}`));
  } else {
    lines.push("• Akunmu: belum ada biaya AI.");
  }

  if (admin) {
    const [all, users, budget] = await Promise.all([getTotals(since, null), getByUser(since, getCostTopN()), getBudgetStatus(null)]);
    lines.push(`• Semua user: <b>${escapeHtml(formatMoney(all.cost))}</b> · ${all.jobs} job · ${all.calls} panggilan`);
    if (users.length) {
      const names = await userNames(users.map((u) => u.userId));
      users.forEach((u, i) =>
        lines.push(`  ${i + 1}. ${escapeHtml(names.get(u.userId) || u.userId)} — ${formatUsd(u.cost)} (${u.jobs} job)`)
      );
    }
    if (getDailyBudgetUsd() > 0) {
      lines.push(`• Batas harian ${formatUsd(budget.dailyLimit)} — hari ini terpakai ${formatUsd(budget.spentToday)} (${Math.round(budget.percent)}%)`);
    }
    if (getUserDailyBudgetUsd() > 0) lines.push(`• Batas per user: ${formatUsd(getUserDailyBudgetUsd())}/hari`);
  }
  lines.push("<i>Detail lengkap: /cost</i>");
  return lines.join("\n");
}
