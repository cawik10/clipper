/**
 * 🩺 AUTO-TITLE DOCTOR — section dashboard (FITUR BARU!)
 * Server component terpisah (seperti AnalyticsSection) supaya section lain tidak berubah.
 * Konfigurasi: src/lib/auto-title-doctor-config.ts · Logika: src/lib/auto-title-doctor.ts
 */
import {
  describeRetitleThreshold,
  getRetitleAllowedPrivacy,
  getRetitleCooldownHours,
  getRetitleHashtagCount,
  getRetitleMaxAgeDays,
  getRetitleMaxPerClip,
  getRetitleMaxPerCycle,
  getRetitleMinAgeHours,
  isAutoRetitleEnabled,
  isRetitleDryRun,
  isRetitleNotifyEnabled,
} from "@/lib/auto-title-doctor-config";
import { getRetitleCounts, getRetitleHistory } from "@/lib/auto-title-doctor";
import { getAnalyticsTimezone, getSyncIntervalMinutes, isAnalyticsEnabled } from "@/lib/analytics-config";

async function loadData() {
  try {
    const [counts, history] = await Promise.all([getRetitleCounts(null), getRetitleHistory(null, 5)]);
    return { ok: true as const, counts, history };
  } catch (err) {
    console.warn("[title-doctor] dashboard fallback:", err instanceof Error ? err.message : err);
    return { ok: false as const, counts: { success: 0, dryRun: 0, failed: 0 }, history: [] };
  }
}

export default async function AutoTitleDoctorSection() {
  const enabled = isAutoRetitleEnabled();
  const analyticsOn = isAnalyticsEnabled();
  const dryRun = isRetitleDryRun();
  const data = await loadData();

  const configRows: [string, string][] = [
    ["ANALYTICS_AUTO_RETITLE_LOW_VIEWS", enabled ? "true" : "false"],
    ["ANALYTICS_RETITLE_VIEWS_THRESHOLD", describeRetitleThreshold()],
    ["ANALYTICS_RETITLE_MIN_AGE_HOURS", `${getRetitleMinAgeHours()} jam`],
    ["ANALYTICS_RETITLE_MAX_AGE_DAYS", `${getRetitleMaxAgeDays()} hari`],
    ["ANALYTICS_RETITLE_MAX_PER_CLIP", `${getRetitleMaxPerClip()}x (jeda ${getRetitleCooldownHours()} jam)`],
    ["ANALYTICS_RETITLE_MAX_PER_CYCLE", String(getRetitleMaxPerCycle())],
    ["ANALYTICS_RETITLE_PRIVACY", getRetitleAllowedPrivacy().join(", ")],
    ["ANALYTICS_RETITLE_HASHTAGS", String(getRetitleHashtagCount())],
    ["ANALYTICS_RETITLE_NOTIFY", isRetitleNotifyEnabled() ? "true" : "false"],
    ["ANALYTICS_RETITLE_DRY_RUN", dryRun ? "true" : "false"],
  ];

  return (
    <section className="bg-gradient-to-br from-rose-500/10 to-orange-500/10 border-2 border-rose-500/40 rounded-2xl p-6 space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-rose-400 flex items-center gap-2">
            🩺 Auto-Title Doctor
            <span className="text-xs bg-rose-500/20 border border-rose-500/40 text-rose-300 px-2 py-0.5 rounded-full">
              Fitur Baru!
            </span>
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Bagian dari AI Analytics Loop. Setiap views dicek (tiap {getSyncIntervalMinutes()} menit), klip yang sudah tayang
            lebih dari {getRetitleMinAgeHours()} jam tapi views-nya {describeRetitleThreshold()} akan dibuatkan{" "}
            <b className="text-slate-200">Judul &amp; Hashtag baru</b> yang lebih clickbait oleh AI, lalu judul video di
            YouTube diperbarui otomatis lewat API <code className="text-slate-300">videos.update</code>.
          </p>
        </div>
        <span
          className={`text-xs px-2 py-1 rounded-full border ${
            enabled
              ? dryRun
                ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                : "bg-green-500/20 border-green-500/40 text-green-400"
              : "bg-slate-700/40 border-slate-600 text-slate-400"
          }`}
        >
          {enabled ? (dryRun ? "🧪 Aktif (simulasi)" : "✅ Aktif") : "⚪ Nonaktif"}
        </span>
      </div>

      {!enabled && (
        <div className="text-xs text-slate-300 bg-slate-900/60 border border-slate-700/50 rounded-lg p-3">
          Untuk menyalakan, set <code className="text-yellow-300">ANALYTICS_AUTO_RETITLE_LOW_VIEWS=true</code> di Railway
          Variables, lalu kirim <code className="text-yellow-300">/connect</code> di Telegram sekali lagi agar YouTube
          memberi izin edit video.
        </div>
      )}
      {enabled && !analyticsOn && (
        <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
          ⚠️ <code>ANALYTICS_ENABLED=false</code> — Auto-Title Doctor ikut berhenti karena bergantung pada worker analytics.
        </div>
      )}
      {!data.ok && (
        <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
          ⚠️ Riwayat belum bisa dimuat dari database. Tabel dibuat otomatis saat worker pertama kali berjalan.
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Judul Diperbaiki", value: data.counts.success, icon: "✅" },
          { label: "Simulasi", value: data.counts.dryRun, icon: "🧪" },
          { label: "Gagal", value: data.counts.failed, icon: "⚠️" },
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
          <h3 className="font-semibold text-slate-200">📝 Riwayat Penggantian Judul</h3>
          {data.history.length === 0 ? (
            <p className="text-sm text-slate-500">Belum ada klip yang perlu diperbaiki judulnya.</p>
          ) : (
            <ul className="space-y-3">
              {data.history.map((h) => (
                <li key={h.id} className="text-sm border-l-2 border-rose-500/50 pl-3">
                  <div className="text-xs text-slate-500 line-through truncate">{h.oldTitle}</div>
                  {h.newTitle ? (
                    <a
                      href={`https://youtu.be/${h.youtubeVideoId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-emerald-300 hover:text-emerald-200 block truncate"
                    >
                      {h.newTitle}
                    </a>
                  ) : (
                    <div className="text-amber-300 text-xs truncate">⚠️ {h.error || "gagal"}</div>
                  )}
                  <div className="text-xs text-slate-500 mt-0.5">
                    {h.createdAt.toLocaleDateString("id-ID", { timeZone: getAnalyticsTimezone() })} ·{" "}
                    {h.viewsAtRetitle.toLocaleString("id-ID")} views ·{" "}
                    {h.status === "success" ? "✅ diperbarui" : h.status === "dry_run" ? "🧪 simulasi" : "⚠️ gagal"}
                  </div>
                </li>
              ))}
            </ul>
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
            Semua parameter &amp; prompt AI: <code className="text-slate-300">src/lib/auto-title-doctor-config.ts</code>
          </p>
          <div className="text-xs text-slate-400 mt-3 space-y-1">
            <div>
              🤖 <code className="text-rose-300">/analytics retitle</code> — status &amp; riwayat
            </div>
            <div>
              🤖 <code className="text-rose-300">/analytics retitle run</code> — perbaiki sekarang
            </div>
            <div>
              ⏰ <code className="text-slate-300">GET /api/analytics/run?secret=…&amp;action=retitle&amp;dryRun=1</code>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
