/**
 * 🚨 POST-UPLOAD CLAIM MONITOR — section dashboard (FITUR BARU!)
 * Server component terpisah (pola sama dengan SourceGuardSection / AutoPruneSection)
 * supaya src/app/page.tsx tidak berubah selain satu baris pemasangan.
 * Konfigurasi: src/lib/claim-monitor-config.ts · Logika: src/lib/claim-monitor.ts
 * Keputusan (hapus / private / abaikan) diambil lewat tombol di Telegram.
 */
import {
  describeBlacklistRule,
  getClaimMonitorConfigSummary,
} from "@/lib/claim-monitor-config";
import { getChannelClaimStats, getClaimCounts, getClaimHistory, getPendingClaims } from "@/lib/claim-monitor";

async function loadData() {
  try {
    const [counts, stats, pending, history] = await Promise.all([
      getClaimCounts(null),
      getChannelClaimStats(null),
      getPendingClaims(null, 5),
      getClaimHistory(null, 4),
    ]);
    return { ok: true as const, counts, stats, pending, history };
  } catch (err) {
    console.warn("[claim-monitor] dashboard fallback:", err instanceof Error ? err.message : err);
    return {
      ok: false as const,
      counts: { tracked: 0, checked: 0, claimed: 0, pending: 0, ignored: 0, privated: 0, deleted: 0, lastCheckedAt: null as Date | null },
      stats: [],
      pending: [],
      history: [],
    };
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

const ACTION_LABEL: Record<string, string> = {
  private: "🔒 private",
  unlisted: "🔗 unlisted",
  deleted: "🗑 dihapus",
  ignored: "🙈 diabaikan",
};

export default async function ClaimMonitorSection() {
  const cfg = getClaimMonitorConfigSummary();
  const data = await loadData();
  const { counts, stats } = data;

  return (
    <section className="bg-gradient-to-br from-rose-500/10 to-orange-600/10 border-2 border-rose-500/40 rounded-2xl p-6 space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-rose-400 flex items-center gap-2 flex-wrap">
            🚨 Post-Upload Claim Monitor
            <span className="text-xs bg-rose-500/20 border border-rose-500/40 text-rose-300 px-2 py-0.5 rounded-full">
              Fitur Baru!
            </span>
          </h2>
          <p className="text-slate-400 text-sm mt-1 max-w-3xl">
            Karena bot mengambil video channel lain, Copyright Guard sebelum upload belum cukup. Monitor ini mengecek
            status video yang sudah tayang lewat <code className="text-slate-300">videos.list</code> (rejectionReason,
            licensedContent, regionRestriction), mengirim alert Telegram dengan tombol Hapus / Private / Abaikan, lalu
            menghitung rasio klaim per source channel dan auto-blacklist channel yang sering menimbulkan klaim.
          </p>
        </div>
        <span
          className={`text-xs px-3 py-1.5 rounded-full border font-semibold ${
            cfg.enabled
              ? "bg-green-500/20 border-green-500/40 text-green-300"
              : "bg-slate-700/40 border-slate-600 text-slate-400"
          }`}
        >
          {cfg.enabled ? `✅ AKTIF — cek tiap ${cfg.intervalMinutes} menit` : "⚪ NONAKTIF"}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-center">
        <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-700/50">
          <div className="text-xs text-slate-500">Video dipantau</div>
          <div className="text-slate-200 font-bold text-xl mt-1">{data.ok ? counts.tracked : "–"}</div>
        </div>
        <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-700/50">
          <div className="text-xs text-slate-500">Sudah dicek</div>
          <div className="text-slate-200 font-bold text-xl mt-1">{data.ok ? counts.checked : "–"}</div>
        </div>
        <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-700/50">
          <div className="text-xs text-slate-500">Kena klaim / batasan</div>
          <div className="text-red-400 font-bold text-xl mt-1">{data.ok ? counts.claimed : "–"}</div>
        </div>
        <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-700/50">
          <div className="text-xs text-slate-500">Menunggu keputusan</div>
          <div className="text-amber-300 font-bold text-xl mt-1">{data.ok ? counts.pending : "–"}</div>
        </div>
        <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-700/50">
          <div className="text-xs text-slate-500">Cek terakhir</div>
          <div className="text-slate-300 font-semibold text-sm mt-2">
            {counts.lastCheckedAt ? counts.lastCheckedAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) : "belum"}
          </div>
        </div>
      </div>

      <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700/50">
        <div className="text-sm font-semibold text-slate-300 mb-1">📊 Rasio klaim per source channel</div>
        <div className="text-xs text-slate-500 mb-3">
          Auto-blacklist: {cfg.autoBlacklist ? describeBlacklistRule() : "nonaktif"} · mode:{" "}
          <code className="text-yellow-300">{cfg.enforce}</code>
        </div>
        {stats.length === 0 ? (
          <div className="text-xs text-slate-500">
            Belum ada data — rasio muncul setelah klip dari source channel dicek (butuh /connect + izin baca YouTube).
          </div>
        ) : (
          <div className="space-y-2">
            {stats.slice(0, 8).map((s) => (
              <div key={s.channelKey} className="text-xs">
                <div className="flex justify-between gap-2">
                  <span className="text-slate-300 truncate max-w-[65%]">
                    {s.blacklisted ? "⛔ " : ""}
                    {s.channelName}
                  </span>
                  <span
                    className={`font-semibold ${
                      s.blacklisted ? "text-red-400" : s.ratioPercent >= cfg.ratioPercent ? "text-orange-400" : "text-slate-400"
                    }`}
                  >
                    {s.claims}/{s.clips} klip · {s.ratioPercent}%
                  </span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full mt-1 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${s.blacklisted ? "bg-red-500" : s.ratioPercent >= cfg.ratioPercent ? "bg-orange-500" : "bg-emerald-500"}`}
                    style={{ width: `${Math.min(100, s.ratioPercent)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {(data.pending.length > 0 || data.history.length > 0) && (
        <div className="grid md:grid-cols-2 gap-3">
          {data.pending.length > 0 && (
            <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700/50">
              <div className="text-sm font-semibold text-amber-300 mb-2">⏳ Menunggu keputusan (Telegram)</div>
              <div className="space-y-1.5">
                {data.pending.map((r) => (
                  <div key={r.id} className="text-xs text-slate-400 truncate">
                    🎬{" "}
                    <a href={`https://youtu.be/${r.youtubeVideoId}`} target="_blank" rel="noreferrer" className="text-slate-300 hover:underline">
                      {r.title}
                    </a>
                    {r.channelName ? <span className="text-slate-600"> — {r.channelName}</span> : null}
                  </div>
                ))}
              </div>
            </div>
          )}
          {data.history.length > 0 && (
            <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700/50">
              <div className="text-sm font-semibold text-slate-300 mb-2">🕘 Keputusan terakhir</div>
              <div className="space-y-1.5">
                {data.history.map((r) => (
                  <div key={r.id} className="text-xs text-slate-400 truncate">
                    {ACTION_LABEL[r.actionStatus] || r.actionStatus} · {r.title}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="bg-rose-950/30 border border-rose-500/20 rounded-xl p-4 space-y-3">
        <div className="text-sm font-semibold text-rose-300">🔧 Cara Atur di Railway Variables:</div>
        <div className="font-mono text-sm bg-slate-900/80 rounded-lg p-3 space-y-1 overflow-x-auto">
          <Row k="CLAIM_MONITOR_ENABLED" v={String(cfg.enabled)} hint="saklar utama" />
          <Row k="CLAIM_MONITOR_INTERVAL_MINUTES" v={String(cfg.intervalMinutes)} hint="seberapa sering cek" />
          <Row k="CLAIM_MONITOR_TRACK_DAYS" v={String(cfg.trackDays)} hint="cek video ≤ N hari" />
          <Row k="CLAIM_MONITOR_SIGNALS" v={cfg.signals.join(",")} hint="rejected | licensed | region | age" />
          <Row k="CLAIM_MONITOR_NOTIFY" v={String(cfg.notify)} />
          <Row k="CLAIM_MONITOR_ACTIONS" v={cfg.actions.join(",")} hint="delete | private" />
          <Row k="CLAIM_MONITOR_HIDE_TO" v={cfg.hideTo} hint="private | unlisted" />
          <Row k="CLAIM_MONITOR_DELETE_CONFIRM" v={String(cfg.deleteConfirm)} />
          <Row k="CLAIM_AUTO_BLACKLIST" v={String(cfg.autoBlacklist)} />
          <Row k="CLAIM_BLACKLIST_MIN_CLIPS" v={String(cfg.minClips)} />
          <Row k="CLAIM_BLACKLIST_MIN_CLAIMS" v={String(cfg.minClaims)} />
          <Row k="CLAIM_BLACKLIST_RATIO_PERCENT" v={String(cfg.ratioPercent)} />
          <Row k="CLAIM_BLACKLIST_ENFORCE" v={cfg.enforce} hint="block | warn | off" />
          <Row k="CLAIM_BLACKLIST_PAUSE_MONITORS" v={String(cfg.pauseMonitors)} />
          <Row
            k="CLAIM_BLACKLIST_CHANNELS"
            v={cfg.envBlacklist.length ? cfg.envBlacklist.join(",") : "(kosong)"}
            hint="blacklist global: UCxxx,@handle,nama"
          />
        </div>
        <div className="text-xs text-slate-400 space-y-1">
          <div>
            🤖 Telegram: <code className="text-yellow-300">/claims</code> (status &amp; rasio) ·{" "}
            <code className="text-yellow-300">/claims list</code> · <code className="text-yellow-300">/claims run</code> ·{" "}
            <code className="text-yellow-300">/blacklist</code> · <code className="text-yellow-300">/blacklist add @channel</code>
          </div>
          <div>
            🔑 Tombol Hapus / Private butuh izin <code className="text-slate-300">youtube.force-ssl</code> — kirim{" "}
            <code className="text-yellow-300">/connect</code> sekali lagi setelah fitur ini aktif.
          </div>
          <div>
            🔎 Content ID tidak punya API klaim publik; yang dibaca adalah sinyal dari <code className="text-slate-300">videos.list</code>{" "}
            (klaim parsial pada audio sering <i>tidak</i> muncul). Channel whitelist / milik sendiri tidak pernah di-auto-blacklist.
          </div>
          <div>
            🎨 Teks pesan, label alasan penolakan &amp; default bisa diubah di{" "}
            <code className="text-slate-300">src/lib/claim-monitor-config.ts</code>
          </div>
        </div>
      </div>
    </section>
  );
}
