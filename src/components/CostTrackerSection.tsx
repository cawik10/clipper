/**
 * 💰 COST TRACKER — section dashboard (FITUR BARU!)
 * Server component terpisah (seperti SourceGuardSection) supaya section lain tidak berubah.
 * Konfigurasi & tabel harga: src/lib/cost-config.ts · Logika: src/lib/cost-tracker.ts
 * Catatan privasi: dashboard ini publik, jadi ID user hanya tampil disamarkan.
 */
import {
  FEATURE_LABELS,
  featureLabel,
  getBudgetMode,
  getCostReportDays,
  getCostTimezone,
  getDailyBudgetUsd,
  getIdrRate,
  getUserDailyBudgetUsd,
  isCostTrackerEnabled,
} from "@/lib/cost-config";
import {
  formatMoney,
  formatUsd,
  getBudgetStatus,
  getByFeature,
  getByModel,
  getByUser,
  getDailySeries,
  getTotals,
  periodStart,
  startOfLocalDay,
} from "@/lib/cost-tracker";

async function loadData() {
  try {
    const days = getCostReportDays();
    const since = periodStart(days);
    const [budget, today, period, month, models, features, users, series] = await Promise.all([
      getBudgetStatus(null),
      getTotals(startOfLocalDay(), null),
      getTotals(since, null),
      getTotals(periodStart(30), null),
      getByModel(since, null),
      getByFeature(since, null),
      getByUser(since, 5),
      getDailySeries(7, null),
    ]);
    return { ok: true as const, days, budget, today, period, month, models, features, users, series };
  } catch {
    return { ok: false as const };
  }
}

function Row({ k, v, hint }: { k: string; v: string; hint?: string }) {
  return (
    <div>
      <span className="text-yellow-300">{k}</span> = <span className="text-emerald-400">{v}</span>
      {hint && <span className="text-slate-600"> ← {hint}</span>}
    </div>
  );
}

function maskId(id: string): string {
  return /^-?\d+$/.test(id) && id.length > 4 ? `••••${id.slice(-4)}` : id;
}

const MODE_STYLE = {
  pause: { label: "⏸️ PAUSE — AI dijeda saat batas lewat", cls: "bg-amber-500/20 border-amber-500/40 text-amber-300" },
  warn: { label: "⚠️ WARN — notifikasi saja", cls: "bg-sky-500/20 border-sky-500/40 text-sky-300" },
  off: { label: "⚪ OFF — tanpa batas", cls: "bg-slate-700/40 border-slate-600 text-slate-400" },
} as const;

export default async function CostTrackerSection() {
  const enabled = isCostTrackerEnabled();
  const mode = MODE_STYLE[getBudgetMode()];
  const dailyLimit = getDailyBudgetUsd();
  const userLimit = getUserDailyBudgetUsd();
  const data = enabled ? await loadData() : null;
  const days = data && data.ok ? data.days : getCostReportDays();

  const pct = data && data.ok ? Math.min(100, data.budget.percent) : 0;
  const barColor = pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-400" : "bg-emerald-400";
  const maxDay = data && data.ok ? Math.max(0.0001, ...data.series.map((d) => d.cost)) : 1;

  return (
    <section className="bg-gradient-to-br from-amber-500/10 to-yellow-500/10 border-2 border-amber-500/40 rounded-2xl p-6 space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-amber-400 flex items-center gap-2 flex-wrap">
            💰 Cost Tracker
            <span className="text-xs bg-amber-500/20 border border-amber-500/40 text-amber-300 px-2 py-0.5 rounded-full">
              Fitur Baru!
            </span>
          </h2>
          <p className="text-slate-400 text-sm mt-1 max-w-3xl">
            Melacak biaya OpenAI / Gemini / Groq / Whisper per job dan per user, lengkap dengan batas biaya harian. Saat batas
            terlewati, AI dijeda otomatis. Berguna untuk memilih model yang layak dan menghitung harga bila bot dijual sebagai
            layanan.
          </p>
        </div>
        <span className={`text-xs px-3 py-1.5 rounded-full border font-semibold ${enabled ? mode.cls : "bg-slate-700/40 border-slate-600 text-slate-400"}`}>
          {enabled ? mode.label : "⚪ Cost Tracker nonaktif"}
        </span>
      </div>

      {enabled && data && !data.ok && (
        <div className="text-sm text-slate-400 bg-slate-900/50 rounded-xl p-4 border border-slate-700/50">
          Data biaya belum bisa dibaca (database belum siap). Coba muat ulang halaman.
        </div>
      )}

      {data && data.ok && (
        <>
          <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-700/50 space-y-2">
            <div className="flex justify-between flex-wrap gap-2 text-sm">
              <span className="text-slate-300 font-semibold">
                {data.budget.allowed ? "💳 Batas harian" : "⏸️ AI DIJEDA — batas harian tercapai"}
              </span>
              <span className="text-slate-400">
                {dailyLimit > 0 ? (
                  <>
                    <span className="text-amber-300 font-bold">{formatUsd(data.budget.spentToday)}</span> dari {formatUsd(dailyLimit)} (
                    {Math.round(data.budget.percent)}%)
                  </>
                ) : (
                  <>
                    <span className="text-amber-300 font-bold">{formatUsd(data.budget.spentToday)}</span> hari ini · tanpa batas
                  </>
                )}
              </span>
            </div>
            {dailyLimit > 0 && (
              <div className="h-2.5 rounded-full bg-slate-800 overflow-hidden">
                <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
            <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-700/50">
              <div className="text-xs text-slate-500">Hari ini</div>
              <div className="text-amber-300 font-bold text-xl mt-1">{formatUsd(data.today.cost)}</div>
              <div className="text-[11px] text-slate-600">{data.today.calls} panggilan</div>
            </div>
            <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-700/50">
              <div className="text-xs text-slate-500">{days} hari terakhir</div>
              <div className="text-amber-300 font-bold text-xl mt-1">{formatUsd(data.period.cost)}</div>
              <div className="text-[11px] text-slate-600">{data.period.jobs} job</div>
            </div>
            <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-700/50">
              <div className="text-xs text-slate-500">30 hari terakhir</div>
              <div className="text-amber-300 font-bold text-xl mt-1">{formatUsd(data.month.cost)}</div>
              <div className="text-[11px] text-slate-600">{getIdrRate() ? `≈ Rp ${Math.round(data.month.cost * getIdrRate()).toLocaleString("id-ID")}` : `${data.month.calls} panggilan`}</div>
            </div>
            <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-700/50">
              <div className="text-xs text-slate-500">Rata-rata / job</div>
              <div className="text-amber-300 font-bold text-xl mt-1">
                {data.period.jobs > 0 ? formatUsd(data.period.jobCost / data.period.jobs) : "–"}
              </div>
              <div className="text-[11px] text-slate-600">{days} hari terakhir</div>
            </div>
          </div>

          <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700/50">
            <div className="text-sm font-semibold text-slate-300 mb-3">📅 Biaya 7 hari terakhir</div>
            <div className="flex items-end gap-2 h-24">
              {data.series.map((d) => (
                <div key={d.day} className="flex-1 flex flex-col items-center justify-end h-full gap-1">
                  <div className="text-[10px] text-slate-500">{d.cost > 0 ? formatUsd(d.cost) : ""}</div>
                  <div
                    className="w-full rounded-t bg-amber-400/70"
                    style={{ height: `${d.cost > 0 ? Math.max(4, (d.cost / maxDay) * 70) : 2}%`, opacity: d.cost > 0 ? 1 : 0.25 }}
                  />
                  <div className="text-[10px] text-slate-600">{d.day.slice(5)}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700/50">
              <div className="text-sm font-semibold text-slate-300 mb-2">🤖 Per Model ({days} hari)</div>
              {data.models.length === 0 ? (
                <div className="text-xs text-slate-500">Belum ada panggilan AI tercatat.</div>
              ) : (
                <div className="space-y-1.5">
                  {data.models.slice(0, 6).map((m) => (
                    <div key={`${m.provider}-${m.model}`} className="flex justify-between gap-2 text-xs">
                      <span className="text-slate-300 truncate">
                        {m.model} <span className="text-slate-600">({m.provider})</span>
                      </span>
                      <span className="text-amber-300 font-semibold whitespace-nowrap">
                        {formatUsd(m.cost)} <span className="text-slate-600 font-normal">· {m.calls}×</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700/50">
              <div className="text-sm font-semibold text-slate-300 mb-2">🧩 Per Fitur ({days} hari)</div>
              {data.features.length === 0 ? (
                <div className="text-xs text-slate-500">Belum ada data.</div>
              ) : (
                <div className="space-y-1.5">
                  {data.features.map((f) => (
                    <div key={f.feature} className="flex justify-between gap-2 text-xs">
                      <span className="text-slate-300 truncate">{featureLabel(f.feature)}</span>
                      <span className="text-amber-300 font-semibold whitespace-nowrap">{formatUsd(f.cost)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {data.users.length > 0 && (
            <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700/50">
              <div className="text-sm font-semibold text-slate-300 mb-2">👥 Pemakai terbesar ({days} hari)</div>
              <div className="space-y-1.5">
                {data.users.map((u, i) => (
                  <div key={u.userId} className="flex justify-between gap-2 text-xs">
                    <span className="text-slate-300">
                      {i + 1}. <span className="font-mono">{maskId(u.userId)}</span>
                    </span>
                    <span className="text-amber-300 font-semibold whitespace-nowrap">
                      {formatMoney(u.cost)} <span className="text-slate-600 font-normal">· {u.jobs} job</span>
                    </span>
                  </div>
                ))}
              </div>
              <div className="text-[11px] text-slate-600 mt-2">ID user disamarkan. Detail lengkap hanya untuk admin lewat /cost users di Telegram.</div>
            </div>
          )}
        </>
      )}

      <div className="bg-amber-950/30 border border-amber-500/20 rounded-xl p-4 space-y-3">
        <div className="text-sm font-semibold text-amber-300">🔧 Cara Atur di Railway Variables:</div>
        <div className="font-mono text-sm bg-slate-900/80 rounded-lg p-3 space-y-1 overflow-x-auto">
          <Row k="DAILY_BUDGET_USD" v={String(dailyLimit)} hint="batas biaya AI per hari (semua user), 0 = tanpa batas" />
          <Row k="USER_DAILY_BUDGET_USD" v={String(userLimit)} hint="batas per user per hari, 0 = tanpa batas" />
          <Row k="COST_BUDGET_MODE" v={getBudgetMode()} hint="pause | warn | off" />
          <Row k="COST_TRACKER_ENABLED" v={String(enabled)} />
          <Row k="COST_TIMEZONE" v={getCostTimezone()} hint="pergantian hari" />
          <Row k="COST_IDR_RATE" v={String(getIdrRate())} hint="kurs USD→Rp, 0 = sembunyikan" />
          <Row k="COST_REPORT_DAYS" v={String(getCostReportDays())} hint="periode laporan mingguan" />
          <Row k="COST_PRICE_OVERRIDES" v={'{"nama-model":{"in":0.1,"out":0.4}}'} hint="timpa harga per 1 juta token / perHour audio" />
        </div>
        <div className="text-xs text-slate-400 space-y-1.5">
          <div>
            🤖 Telegram: <code className="text-yellow-300">/cost</code> (ringkasan) · <code className="text-yellow-300">/cost models</code> (banding model) ·{" "}
            <code className="text-yellow-300">/cost jobs</code> (per job) · <code className="text-yellow-300">/cost users</code> (admin)
          </div>
          <div>
            📈 Biaya juga masuk ke <span className="text-slate-300">laporan mingguan</span> Telegram (matikan: <code className="text-slate-300">COST_WEEKLY_REPORT=false</code>).
          </div>
          <div>
            🏷️ Harga model bawaan ({Object.keys(FEATURE_LABELS).length} fitur dilacak) ada di{" "}
            <code className="text-slate-300">src/lib/cost-config.ts</code> (MODEL_PRICES) — edit satu baris atau pakai COST_PRICE_OVERRIDES.
          </div>
        </div>
      </div>
    </section>
  );
}
