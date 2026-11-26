/**
 * 📈 LAPORAN PERFORMA KLIP (FITUR BARU!)
 * =====================================================================
 * Membangun teks laporan (format HTML Telegram) berisi:
 *   🏆 Klip dengan View terbanyak
 *   🎯 Niche yang paling banyak menghasilkan penonton
 *   🧠 Status Smart Learning (prompt hasil belajar AI)
 *
 * Mau ubah tampilan/isi laporan? Cukup edit file ini. Jumlah baris
 * klip/niche diatur lewat ANALYTICS_TOP_CLIPS / ANALYTICS_TOP_NICHES.
 */

import type { ClipPerformanceRow } from "@/db/schema";
import { WEEKDAY_LABELS_ID, getReportDay, getReportHour, getTopClipsCount, getTopNichesCount, getAnalyticsTimezone, isLearningEnabled, isWeeklyReportEnabled } from "@/lib/analytics-config";
import { buildNicheBreakdown, buildTotals, getOrCreateUserState, getPerformanceRows, nicheEmoji, withStats } from "@/lib/analytics-store";
import { parseInsights } from "@/lib/analytics-learning";
import { getDefaultNichePrompt } from "@/lib/niche-prompt";

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** 1234 → 1,2K · 2500000 → 2,5M */
export function compactNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",").replace(/,0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(".", ",").replace(/,0$/, "")}K`;
  return String(n);
}

function clipLine(rank: number, r: ClipPerformanceRow): string {
  const gain = r.views - r.viewsBaseline;
  const title = escapeHtml(r.title.length > 60 ? `${r.title.slice(0, 57)}...` : r.title);
  const link = `https://youtu.be/${r.youtubeVideoId}`;
  const extras = [
    `👁 <b>${compactNumber(r.views)}</b>${gain > 0 && r.viewsBaseline > 0 ? ` (+${compactNumber(gain)})` : ""}`,
    r.likes ? `👍 ${compactNumber(r.likes)}` : null,
    r.comments ? `💬 ${compactNumber(r.comments)}` : null,
    `${nicheEmoji(r.niche)} ${escapeHtml(r.niche)}`,
    r.viralScore != null ? `🔥 ${r.viralScore}/10` : null,
  ].filter(Boolean);
  return `${rank}. <a href="${link}">${title}</a>\n    ${extras.join(" · ")}`;
}

export interface ReportOptions {
  /** Batasi ke klip yang diupload N hari terakhir. Kosong = semua klip yang dilacak. */
  days?: number | null;
  /** True kalau dipanggil dari laporan mingguan otomatis (hanya mengubah judul). */
  weekly?: boolean;
}

export async function buildAnalyticsReport(userId: string, opts: ReportOptions = {}): Promise<string> {
  const rows = await getPerformanceRows(userId, opts.days);
  const state = await getOrCreateUserState(userId);
  const data = withStats(rows);
  const totals = buildTotals(rows);

  const periodLabel = opts.days ? `${opts.days} hari terakhir` : "semua klip yang dilacak";
  const title = opts.weekly ? "📈 <b>Laporan Mingguan Performa Klip</b>" : "📈 <b>Laporan Performa Klip</b>";
  const lines: string[] = [title, `🗓 <i>${periodLabel}</i>`, ""];

  if (!rows.length) {
    lines.push(
      "Belum ada klip yang terupload ke YouTube, jadi belum ada data untuk dilaporkan.",
      "",
      "👉 Kirim link video ke bot, hubungkan YouTube lewat /connect, lalu laporan ini akan terisi otomatis."
    );
    return lines.join("\n");
  }

  // Ringkasan
  lines.push("📊 <b>Ringkasan</b>");
  lines.push(`• Klip dilacak: <b>${totals.tracked}</b> (data terbaca: ${totals.withData})`);
  lines.push(`• Total views: <b>${compactNumber(totals.views)}</b>${totals.gain > 0 && state.lastReportAt ? ` (+${compactNumber(totals.gain)} sejak laporan lalu)` : ""}`);
  if (totals.withData) {
    lines.push(`• Rata-rata: <b>${compactNumber(totals.avgViews)}</b> views/klip · 👍 ${compactNumber(totals.likes)} · 💬 ${compactNumber(totals.comments)}`);
  }
  lines.push("");

  if (!data.length) {
    lines.push(
      "⚠️ Statistik views belum bisa dibaca. Penyebab umum:",
      "• Video masih <b>private/draft</b> — kirim /connect lagi (izin baca statistik), atau set <code>YOUTUBE_API_KEY</code> untuk video public/unlisted",
      "• Atau isi manual: <code>/analytics views &lt;videoId&gt; &lt;jumlah&gt;</code>"
    );
    return lines.join("\n");
  }

  // Klip teratas
  const topClips = [...data].sort((a, b) => b.views - a.views).slice(0, getTopClipsCount());
  lines.push("🏆 <b>Klip dengan View Terbanyak</b>");
  topClips.forEach((r, i) => lines.push(clipLine(i + 1, r)));
  lines.push("");

  // Niche teratas
  const niches = buildNicheBreakdown(rows).slice(0, getTopNichesCount());
  lines.push("🎯 <b>Niche Penghasil Penonton Terbanyak</b>");
  niches.forEach((n, i) => {
    const medal = ["🥇", "🥈", "🥉"][i] ?? `${i + 1}.`;
    lines.push(
      `${medal} ${n.emoji} <b>${escapeHtml(n.niche)}</b> — ${compactNumber(n.views)} views · ${n.clips} klip · ≈${compactNumber(n.avgViews)}/klip`
    );
  });
  lines.push("");

  // Smart Learning
  lines.push("🧠 <b>Smart Learning</b>");
  if (!isLearningEnabled() || !state.learningEnabled) {
    lines.push("• Nonaktif");
  } else if (state.learnedPrompt) {
    const insights = parseInsights(state.learnedInsights);
    lines.push(`• Aktif — AI belajar dari ${state.learnedSampleSize ?? 0} klip${state.learnedAt ? ` (${state.learnedAt.toLocaleDateString("id-ID", { timeZone: getAnalyticsTimezone() })})` : ""}`);
    lines.push(`• Arahan niche otomatis: <i>"${escapeHtml(state.learnedPrompt)}"</i>`);
    insights.slice(0, 3).forEach((i) => lines.push(`  ▫️ ${escapeHtml(i)}`));
  } else {
    const def = getDefaultNichePrompt();
    lines.push(`• Belum ada hasil belajar${def ? ` (masih pakai default: "${escapeHtml(def)}")` : ""}`);
    lines.push("• AI mulai belajar otomatis begitu data klip cukup, atau paksa dengan tombol 🧠 di bawah.");
  }

  const unreadable = rows.filter((r) => r.syncError && r.statsSource === null).length;
  if (unreadable > 0) {
    lines.push("", `ℹ️ ${unreadable} klip belum terbaca statistiknya (kemungkinan private/draft). Kirim /connect lagi atau set <code>YOUTUBE_API_KEY</code>.`);
  }

  return lines.join("\n");
}

/** Teks jadwal laporan otomatis, mis. "Senin 08:00 (Asia/Jakarta)". */
export function getReportScheduleLabel(): string {
  if (!isWeeklyReportEnabled()) return "nonaktif";
  const hour = String(getReportHour()).padStart(2, "0");
  return `${WEEKDAY_LABELS_ID[getReportDay()]} ${hour}:00 (${getAnalyticsTimezone()})`;
}
