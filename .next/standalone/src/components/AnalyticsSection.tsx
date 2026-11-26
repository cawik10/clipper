/**
 * 📈 AI ANALYTICS & FEEDBACK LOOP — section dashboard (FITUR BARU!)
 * Server component terpisah supaya src/app/page.tsx tidak berubah banyak.
 * Konfigurasi: src/lib/analytics-config.ts · Laporan: src/lib/analytics-report.ts
 */
import { db } from "@/db";
import { analyticsLearningLog, analyticsUserState } from "@/db/schema";
import { desc, isNotNull } from "drizzle-orm";
import {
  getAnalyticsTimezone,
  getLearningMinClips,
  getLearningTopPercent,
  getSyncIntervalMinutes,
  getTrackDays,
  isAnalyticsEnabled,
  isLearningAutoApply,
  isLearningEnabled,
  isWeeklyReportEnabled,
} from "@/lib/analytics-config";
import {
  buildNicheBreakdown,
  buildTotals,
  ensureAnalyticsTables,
  getPerformanceRows,
  nicheEmoji,
  withStats,
} from "@/lib/analytics-store";
import { compactNumber, getReportScheduleLabel } from "@/lib/analytics-report";
import { parseInsights } from "@/lib/analytics-learning";

async function loadAnalytics() {
  try {
    await ensureAnalyticsTables();
    const rows = await getPerformanceRows(null, null);
    const learnedUsers = await db
      .select({ id: analyticsUserState.id })
      .from(analyticsUserState)
      .where(isNotNull(analyticsUserState.learnedPrompt));
    const logs = await db.select().from(analyticsLearningLog).orderBy(desc(analyticsLearningLog.createdAt)).limit(3);
    return { ok: true as const, rows, learnedUsers: learnedUsers.length, logs };
  } catch (err) {
    console.warn("[analytics] dashboard fallback:", err instanceof Error ? err.message : err);
    return { ok: false as const, rows: [], learnedUsers: 0, logs: [] };
  }
}

export default async function AnalyticsSection() {
  const enabled = isAnalyticsEnabled();
  const data = await loadAnalytics();
  const totals = buildTotals(data.rows);
  const topClips = withStats(data.rows).slice(0, 5);
  const niches = buildNicheBreakdown(data.rows).slice(0, 5);
  const maxNicheViews = niches[0]?.views || 1;

  const configRows: [string, string][] = [
    ["ANALYTICS_ENABLED", enabled ? "true" : "false"],
    ["ANALYTICS_WEEKLY_REPORT_ENABLED", isWeeklyReportEnabled() ? `true (${getReportScheduleLabel()})` : "false"],
    ["ANALYTICS_SYNC_INTERVAL_MINUTES", `${getSyncIntervalMinutes()} menit`],
    ["ANALYTICS_TRACK_DAYS", `${getTrackDays()} hari`],
    ["ANALYTICS_LEARNING_ENABLED", isLearningEnabled() ? "true" : "false"],
    ["ANALYTICS_LEARNING_AUTO_APPLY", isLearningAutoApply() ? "true" : "false"],
    ["ANALYTICS_LEARNING_MIN_CLIPS", String(getLearningMinClips())],
    ["ANALYTICS_LEARNING_TOP_PERCENT", `${getLearningTopPercent()}%`],
    ["ANALYTICS_TIMEZONE", getAnalyticsTimezone()],
  ];

  return (
    <section className="bg-gradient-to-br from-cyan-500/10 to-blue-600/10 border-2 border-cyan-500/40 rounded-2xl p-6 space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-cyan-400 flex items-center gap-2">
            📈 AI Analytics &amp; Feedback Loop
            <span className="text-xs bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 px-2 py-0.5 rounded-full">
              Fitur Baru!
            </span>
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Bot melacak views tiap klip di YouTube, mengirim laporan mingguan ke Telegram, lalu AI mempelajari klip yang
            sukses dan otomatis menyesuaikan arahan niche (<code className="text-slate-300">DEFAULT_NICHE_PROMPT</code>) untuk
            klip berikutnya — makin lama makin pintar.
          </p>
        </div>
        <span
          className={`text-xs px-2 py-1 rounded-full border ${
            enabled
              ? "bg-green-500/20 border-green-500/40 text-green-400"
              : "bg-slate-700/40 border-slate-600 text-slate-400"
          }`}
        >
          {enabled ? "✅ Aktif" : "⚪ Nonaktif"}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Klip Dilacak", value: totals.tracked, icon: "🎬" },
          { label: "Total Views", value: compactNumber(totals.views), icon: "👁" },
          { label: "Rata-rata / Klip", value: compactNumber(totals.avgViews), icon: "📊" },
          { label: "Akun Sudah Belajar", value: data.learnedUsers, icon: "🧠" },
        ].map((s) => (
          <div key={s.label} className="bg-slate-900/60 border border-slate-700/50 rounded-xl p-4 text-center">
            <div className="text-2xl">{s.icon}</div>
            <div className="text-2xl font-bold text-white mt-1">{s.value}</div>
            <div className="text-xs text-slate-400 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {!data.ok && (
        <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
          ⚠️ Data analytics belum bisa dimuat dari database. Tabel dibuat otomatis saat bot pertama kali dipakai.
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-slate-900/60 border border-slate-700/50 rounded-xl p-4 space-y-3">
          <h3 className="font-semibold text-slate-200">🏆 Klip dengan View Terbanyak</h3>
          {topClips.length === 0 ? (
            <p className="text-sm text-slate-500">
              Belum ada data views. Upload klip ke YouTube lalu kirim <code className="text-cyan-300">/analytics</code> di Telegram.
            </p>
          ) : (
            <ol className="space-y-2">
              {topClips.map((c, i) => (
                <li key={c.youtubeVideoId} className="flex items-start gap-2 text-sm">
                  <span className="text-slate-500 w-5">{i + 1}.</span>
                  <div className="min-w-0 flex-1">
                    <a
                      href={`https://youtu.be/${c.youtubeVideoId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-slate-200 hover:text-cyan-300 truncate block"
                    >
                      {c.title}
                    </a>
                    <div className="text-xs text-slate-500">
                      {nicheEmoji(c.niche)} {c.niche}
                      {c.viralScore != null ? ` · 🔥 ${c.viralScore}/10` : ""}
                    </div>
                  </div>
                  <span className="text-cyan-300 font-semibold whitespace-nowrap">{compactNumber(c.views)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="bg-slate-900/60 border border-slate-700/50 rounded-xl p-4 space-y-3">
          <h3 className="font-semibold text-slate-200">🎯 Niche Penghasil Penonton Terbanyak</h3>
          {niches.length === 0 ? (
            <p className="text-sm text-slate-500">Ranking niche muncul setelah views klip terbaca.</p>
          ) : (
            <ul className="space-y-3">
              {niches.map((n) => (
                <li key={n.niche} className="text-sm">
                  <div className="flex justify-between text-slate-200">
                    <span>
                      {n.emoji} {n.niche} <span className="text-xs text-slate-500">· {n.clips} klip</span>
                    </span>
                    <span className="text-cyan-300 font-semibold">{compactNumber(n.views)}</span>
                  </div>
                  <div className="h-1.5 bg-slate-800 rounded-full mt-1 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-400 to-blue-500"
                      style={{ width: `${Math.max(4, Math.round((n.views / maxNicheViews) * 100))}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="bg-slate-900/60 border border-slate-700/50 rounded-xl p-4 space-y-3">
        <h3 className="font-semibold text-slate-200">🧠 Smart Learning Loop — Riwayat Belajar AI</h3>
        {data.logs.length === 0 ? (
          <p className="text-sm text-slate-500">
            Belum ada proses belajar. AI mulai belajar otomatis setelah minimal {getLearningMinClips()} klip punya data views.
          </p>
        ) : (
          <ul className="space-y-3">
            {data.logs.map((l) => (
              <li key={l.id} className="text-sm border-l-2 border-cyan-500/50 pl-3">
                <div className="text-emerald-300">&quot;{l.newPrompt}&quot;</div>
                {parseInsights(l.insights)
                  .slice(0, 2)
                  .map((i) => (
                    <div key={i} className="text-xs text-slate-400">▫️ {i}</div>
                  ))}
                <div className="text-xs text-slate-500 mt-0.5">
                  {l.createdAt.toLocaleDateString("id-ID", { timeZone: getAnalyticsTimezone() })} · {l.sampleSize} klip ·{" "}
                  {l.method === "ai" ? "analisis AI" : "heuristik"} · {l.applied ? "✅ diterapkan" : "⏳ menunggu /analytics apply"}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-slate-500">
          Prompt hasil belajar menggantikan <code className="text-slate-300">DEFAULT_NICHE_PROMPT</code> untuk akun yang belum
          mengatur <code className="text-slate-300">/niche</code> sendiri. Niche kustom user tidak pernah ditimpa.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-slate-900/60 border border-slate-700/50 rounded-xl p-4">
          <h3 className="font-semibold text-slate-200 mb-2">⚙️ Konfigurasi (Railway Variables)</h3>
          <div className="space-y-1 text-xs">
            {configRows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <code className="text-yellow-300">{k}</code>
                <span className="text-slate-300 text-right">{v}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Semua parameter &amp; kata kunci niche: <code className="text-slate-300">src/lib/analytics-config.ts</code>
          </p>
        </div>
        <div className="bg-slate-900/60 border border-slate-700/50 rounded-xl p-4">
          <h3 className="font-semibold text-slate-200 mb-2">🤖 Perintah Telegram</h3>
          <div className="text-xs text-slate-400 space-y-1">
            <div><code className="text-cyan-300">/analytics</code> — laporan klip &amp; niche terbaik</div>
            <div><code className="text-cyan-300">/analytics 30</code> — klip 30 hari terakhir</div>
            <div><code className="text-cyan-300">/analytics sync</code> — tarik views terbaru</div>
            <div><code className="text-cyan-300">/analytics learn</code> — AI belajar sekarang</div>
            <div><code className="text-cyan-300">/analytics weekly on|off</code> — laporan mingguan</div>
            <div><code className="text-cyan-300">/analytics reset</code> — hapus hasil belajar</div>
            <div><code className="text-cyan-300">/analytics views &lt;id&gt; &lt;n&gt;</code> — isi views manual</div>
            <div className="pt-1">
              🔑 Views video private butuh izin baca statistik: kirim <code className="text-yellow-300">/connect</code> ulang, atau
              set <code className="text-yellow-300">YOUTUBE_API_KEY</code> untuk video public/unlisted.
            </div>
            <div>
              ⏰ Pemicu manual: <code className="text-slate-300">GET /api/analytics/run?secret=…</code>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
