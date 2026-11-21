/**
 * ✂️ AUTO-PRUNE KLIP GAGAL — section dashboard (FITUR BARU!)
 * Server component terpisah (seperti AutoTitleDoctorSection) supaya section lain tidak berubah.
 * Konfigurasi: src/lib/auto-prune-config.ts · Logika: src/lib/auto-prune.ts
 * Keputusan (sembunyikan / hapus / pertahankan) diambil lewat tombol di Telegram.
 */
import {
  describePruneRules,
  getPruneActions,
  getPruneAllowedPrivacy,
  getPruneHideTo,
  getPruneKeepSnoozeDays,
  getPruneMaxPerNotify,
  getPruneMinAgeDays,
  getPruneMinRetitles,
  getPruneReminderDays,
  getPruneRetitleGraceDays,
  getPruneViewsThreshold,
  isAutoPruneEnabled,
  isPruneDeleteConfirmRequired,
  isPruneNotifyEnabled,
} from "@/lib/auto-prune-config";
import { getPendingSuggestions, getPruneCounts, getPruneHistory } from "@/lib/auto-prune";
import { isAutoRetitleEnabled } from "@/lib/auto-title-doctor-config";
import { getSyncIntervalMinutes, isAnalyticsEnabled } from "@/lib/analytics-config";

async function loadData() {
  try {
    const [counts, pending, history] = await Promise.all([getPruneCounts(null), getPendingSuggestions(null, 6), getPruneHistory(null, 4)]);
    return { ok: true as const, counts, pending, history };
  } catch (err) {
    console.warn("[auto-prune] dashboard fallback:", err instanceof Error ? err.message : err);
    return { ok: false as const, counts: { pending: 0, hidden: 0, deleted: 0, kept: 0 }, pending: [], history: [] };
  }
}

export default async function AutoPruneSection() {
  const enabled = isAutoPruneEnabled();
  const analyticsOn = isAnalyticsEnabled();
  const needsRetitle = getPruneMinRetitles() > 0 && !isAutoRetitleEnabled();
  const data = await loadData();

  const configRows: [string, string][] = [
    ["AUTO_PRUNE_ENABLED", enabled ? "true" : "false"],
    ["AUTO_PRUNE_MIN_AGE_DAYS", `${getPruneMinAgeDays()} hari`],
    ["AUTO_PRUNE_VIEWS_THRESHOLD", `< ${getPruneViewsThreshold().toLocaleString("id-ID")} views`],
    ["AUTO_PRUNE_MIN_RETITLES", `${getPruneMinRetitles()}x (jeda ${getPruneRetitleGraceDays()} hari)`],
    ["AUTO_PRUNE_ACTIONS", getPruneActions().join(", ")],
    ["AUTO_PRUNE_HIDE_TO", getPruneHideTo()],
    ["AUTO_PRUNE_DELETE_CONFIRM", isPruneDeleteConfirmRequired() ? "true" : "false"],
    ["AUTO_PRUNE_PRIVACY", getPruneAllowedPrivacy().join(", ")],
    ["AUTO_PRUNE_MAX_PER_NOTIFY", String(getPruneMaxPerNotify())],
    ["AUTO_PRUNE_NOTIFY", isPruneNotifyEnabled() ? "true" : "false"],
    ["AUTO_PRUNE_REMINDER_DAYS", getPruneReminderDays() ? `${getPruneReminderDays()} hari` : "tidak"],
    ["AUTO_PRUNE_KEEP_SNOOZE_DAYS", getPruneKeepSnoozeDays() ? `${getPruneKeepSnoozeDays()} hari` : "tidak pernah"],
  ];

  const statusIcon: Record<string, string> = { hidden: "🙈 disembunyikan", deleted: "🗑 dihapus", kept: "✅ dipertahankan" };

  return (
    <section className="bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10 border-2 border-violet-500/40 rounded-2xl p-6 space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-violet-400 flex items-center gap-2">
            ✂️ Auto-Prune Klip Gagal
            <span className="text-xs bg-violet-500/20 border border-violet-500/40 text-violet-300 px-2 py-0.5 rounded-full">
              Fitur Baru!
            </span>
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Klip yang {describePruneRules()} akan{" "}
            <b className="text-slate-200">diusulkan untuk disembunyikan atau dihapus</b>. Channel dengan banyak klip sepi
            bisa menurunkan performa distribusi. Bot hanya memberi usulan lewat Telegram — kamu yang memutuskan lewat
            tombol <i>Sembunyikan / Hapus / Pertahankan</i>.
          </p>
        </div>
        <span
          className={`text-xs px-2 py-1 rounded-full border ${
            enabled ? "bg-green-500/20 border-green-500/40 text-green-400" : "bg-slate-700/40 border-slate-600 text-slate-400"
          }`}
        >
          {enabled ? "✅ Aktif (hanya usulan)" : "⚪ Nonaktif"}
        </span>
      </div>

      {!enabled && (
        <div className="text-xs text-slate-300 bg-slate-900/60 border border-slate-700/50 rounded-lg p-3">
          Untuk menyalakan, set <code className="text-yellow-300">AUTO_PRUNE_ENABLED=true</code> di Railway Variables.
        </div>
      )}
      {enabled && !analyticsOn && (
        <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
          ⚠️ <code>ANALYTICS_ENABLED=false</code> — Auto-Prune ikut berhenti karena bergantung pada worker analytics.
        </div>
      )}
      {needsRetitle && (
        <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
          ⚠️ Syarat &quot;sudah di-retitle&quot; belum bisa terpenuhi karena Auto-Title Doctor nonaktif (
          <code>ANALYTICS_AUTO_RETITLE_LOW_VIEWS</code>). Nyalakan Auto-Title Doctor, atau set{" "}
          <code className="text-yellow-300">AUTO_PRUNE_MIN_RETITLES=0</code> untuk melewati syarat itu.
        </div>
      )}
      {!data.ok && (
        <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
          ⚠️ Usulan belum bisa dimuat dari database. Tabel dibuat otomatis saat worker pertama kali berjalan.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Menunggu Keputusan", value: data.counts.pending, icon: "⏳" },
          { label: "Disembunyikan", value: data.counts.hidden, icon: "🙈" },
          { label: "Dihapus", value: data.counts.deleted, icon: "🗑" },
          { label: "Dipertahankan", value: data.counts.kept, icon: "✅" },
        ].map((s) => (
          <div key={s.label} className="bg-slate-900/60 border border-slate-700/50 rounded-xl p-4 text-center">
            <div className="text-2xl">{s.icon}</div>
            <div className="text-2xl font-bold text-white mt-1">{s.value}</div>
            <div className="text-xs text-slate-400 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-slate-900/60 border border-slate-700/50 rounded-xl p-4 space-y-3">
          <h3 className="font-semibold text-slate-200">📉 Usulan Klip Sepi</h3>
          {data.pending.length === 0 ? (
            <p className="text-sm text-slate-500">Belum ada klip yang perlu dirapikan. 🎉</p>
          ) : (
            <ul className="space-y-3">
              {data.pending.map((p) => (
                <li key={p.id} className="text-sm border-l-2 border-violet-500/50 pl-3">
                  <a
                    href={`https://youtu.be/${p.youtubeVideoId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-violet-200 hover:text-violet-100 block truncate"
                  >
                    {p.title}
                  </a>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {p.views.toLocaleString("id-ID")} views · {p.ageDays} hari · di-retitle {p.retitleCount}x
                  </div>
                </li>
              ))}
            </ul>
          )}
          {data.history.length > 0 && (
            <div className="pt-2 border-t border-slate-700/50 space-y-1">
              <div className="text-xs text-slate-400">Keputusan terakhir</div>
              {data.history.map((h) => (
                <div key={h.id} className="text-xs text-slate-500 truncate">
                  {statusIcon[h.status] || h.status} · {h.title}
                </div>
              ))}
            </div>
          )}
        </div>

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
            Semua parameter &amp; teks pesan: <code className="text-slate-300">src/lib/auto-prune-config.ts</code>. Dicek
            setiap siklus sync views (tiap {getSyncIntervalMinutes()} menit).
          </p>
          <div className="text-xs text-slate-400 mt-3 space-y-1">
            <div>
              🤖 <code className="text-violet-300">/prune</code> — status &amp; aturan
            </div>
            <div>
              🤖 <code className="text-violet-300">/prune list</code> — lihat &amp; putuskan usulan
            </div>
            <div>
              🤖 <code className="text-violet-300">/prune run</code> — cari klip gagal sekarang
            </div>
            <div>
              ⏰ <code className="text-slate-300">GET /api/analytics/run?secret=…&amp;action=prune</code>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
