/**
 * 🛡️ SOURCE CREDIT & COPYRIGHT GUARD — section dashboard (FITUR BARU!)
 * Server component terpisah supaya src/app/page.tsx tidak berubah banyak.
 * Konfigurasi: src/lib/source-guard-config.ts · Logika: src/lib/source-guard.ts
 */
import { getSourceGuardConfigSummary, type CopyrightGuardMode } from "@/lib/source-guard-config";
import { getSourceGuardStats } from "@/lib/source-guard";

const MODE_STYLE: Record<CopyrightGuardMode, { label: string; cls: string }> = {
  warn: { label: "⚠️ WARN — peringatan saja", cls: "bg-amber-500/20 border-amber-500/40 text-amber-300" },
  block: { label: "⛔ BLOCK — blokir pelanggaran", cls: "bg-red-500/20 border-red-500/40 text-red-300" },
  off: { label: "⚪ OFF — guard nonaktif", cls: "bg-slate-700/40 border-slate-600 text-slate-400" },
};

const DECISION_STYLE: Record<string, string> = {
  allowed: "text-green-400",
  warned: "text-amber-300",
  blocked: "text-red-400",
};

async function loadStats() {
  try {
    return await getSourceGuardStats();
  } catch {
    return null;
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

export default async function SourceGuardSection() {
  const cfg = getSourceGuardConfigSummary();
  const stats = await loadStats();
  const mode = MODE_STYLE[cfg.mode];

  return (
    <section className="bg-gradient-to-br from-emerald-500/10 to-teal-600/10 border-2 border-emerald-500/40 rounded-2xl p-6 space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-emerald-400 flex items-center gap-2 flex-wrap">
            🛡️ Source Credit &amp; Copyright Guard
            <span className="text-xs bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 px-2 py-0.5 rounded-full">
              Fitur Baru!
            </span>
          </h2>
          <p className="text-slate-400 text-sm mt-1 max-w-3xl">
            Auto-Monitor mengambil video channel lain secara otomatis — risikonya copyright strike atau penolakan
            monetisasi (reused content). Fitur ini menambah kredit sumber di deskripsi, whitelist channel, batas klip per
            video sumber per hari, dan skip video bertanda Content ID.
          </p>
        </div>
        <span className={`text-xs px-3 py-1.5 rounded-full border font-semibold ${mode.cls}`}>{mode.label}</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
        <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-700/50">
          <div className="text-xs text-slate-500">Kredit sumber</div>
          <div className={`font-semibold mt-1 ${cfg.creditEnabled ? "text-emerald-300" : "text-slate-500"}`}>
            {cfg.creditEnabled ? `✅ Aktif (${cfg.creditPosition})` : "⚪ Nonaktif"}
          </div>
        </div>
        <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-700/50">
          <div className="text-xs text-slate-500">Whitelist channel</div>
          <div className="text-emerald-300 font-semibold mt-1">
            {cfg.whitelist.length > 0 || cfg.whitelistRequired
              ? `✅ ${cfg.whitelist.length} channel${cfg.whitelistRequired ? " • wajib" : ""}`
              : "⚪ Kosong (tidak aktif)"}
          </div>
        </div>
        <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-700/50">
          <div className="text-xs text-slate-500">Batas klip / sumber / hari</div>
          <div className="text-emerald-300 font-semibold mt-1">
            {cfg.maxClipsPerSourcePerDay === 0 ? "Tanpa batas" : `${cfg.maxClipsPerSourcePerDay} klip`}
          </div>
        </div>
        <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-700/50">
          <div className="text-xs text-slate-500">Skip Content ID</div>
          <div className={`font-semibold mt-1 ${cfg.skipContentId ? "text-emerald-300" : "text-slate-500"}`}>
            {cfg.skipContentId ? "✅ Aktif" : "⚪ Nonaktif"}
          </div>
        </div>
      </div>

      <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700/50">
        <div className="text-sm font-semibold text-slate-300 mb-2">📝 Contoh baris kredit di deskripsi YouTube:</div>
        <code className="block text-sm text-emerald-300 bg-slate-900/80 rounded-lg p-3 break-words">
          {cfg.creditTemplate
            .replace("{title}", "Judul Video Sumber")
            .replace("{channel}", "Nama Channel")
            .replace("{url}", "https://www.youtube.com/watch?v=xxxx")}
        </code>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-700/50">
          <div className="text-xs text-slate-500">Lolos (24 jam)</div>
          <div className="text-green-400 font-bold text-xl mt-1">{stats?.last24h.allowed ?? "–"}</div>
        </div>
        <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-700/50">
          <div className="text-xs text-slate-500">Peringatan (24 jam)</div>
          <div className="text-amber-300 font-bold text-xl mt-1">{stats?.last24h.warned ?? "–"}</div>
        </div>
        <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-700/50">
          <div className="text-xs text-slate-500">Diblokir (24 jam)</div>
          <div className="text-red-400 font-bold text-xl mt-1">{stats?.last24h.blocked ?? "–"}</div>
        </div>
      </div>

      {stats && stats.recent.length > 0 && (
        <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700/50">
          <div className="text-sm font-semibold text-slate-300 mb-2">🕘 Pengecekan terbaru</div>
          <div className="space-y-2">
            {stats.recent.map((r) => {
              const violations = (Array.isArray(r.violations) ? r.violations : []) as Array<{ message?: string }>;
              return (
                <div key={r.id} className="text-xs border-b border-slate-800 pb-2 last:border-0 last:pb-0">
                  <div className="flex justify-between gap-2 flex-wrap">
                    <span className="text-slate-300 truncate max-w-[70%]">
                      {r.sourceTitle || r.sourceUrl} {r.channelName ? <span className="text-slate-500">— {r.channelName}</span> : null}
                    </span>
                    <span className={`font-semibold uppercase ${DECISION_STYLE[r.decision] || "text-slate-400"}`}>
                      {r.decision} · {r.clipsCount} klip
                    </span>
                  </div>
                  {violations.length > 0 && (
                    <div className="text-slate-500 mt-0.5">{violations.map((v) => v.message).join(" ")}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-emerald-950/30 border border-emerald-500/20 rounded-xl p-4 space-y-3">
        <div className="text-sm font-semibold text-emerald-300">🔧 Cara Atur di Railway Variables:</div>
        <div className="font-mono text-sm bg-slate-900/80 rounded-lg p-3 space-y-1 overflow-x-auto">
          <Row k="SOURCE_CREDIT_ENABLED" v={String(cfg.creditEnabled)} />
          <Row k="SOURCE_CREDIT_TEMPLATE" v={`"${cfg.creditTemplate}"`} hint="{title} {channel} {url}" />
          <Row k="SOURCE_CREDIT_POSITION" v={cfg.creditPosition} hint="top | bottom" />
          <Row k="COPYRIGHT_GUARD_MODE" v={cfg.mode} hint="warn | block | off" />
          <Row k="COPYRIGHT_GUARD_SCOPE" v={cfg.scope} hint="all | monitor" />
          <Row
            k="COPYRIGHT_WHITELIST_CHANNELS"
            v={cfg.whitelist.length ? cfg.whitelist.join(",") : "(kosong)"}
            hint="UCxxx,@handle,nama channel"
          />
          <Row k="COPYRIGHT_WHITELIST_REQUIRED" v={String(cfg.whitelistRequired)} />
          <Row k="COPYRIGHT_ALLOW_OWN_CHANNEL" v={String(cfg.allowOwnChannel)} hint="channel hasil /connect otomatis lolos" />
          <Row k="COPYRIGHT_MAX_CLIPS_PER_SOURCE_PER_DAY" v={String(cfg.maxClipsPerSourcePerDay)} hint="0 = tanpa batas" />
          <Row k="COPYRIGHT_DAY_TIMEZONE" v={cfg.timezone} />
          <Row k="COPYRIGHT_SKIP_CONTENT_ID" v={String(cfg.skipContentId)} />
          <Row k="COPYRIGHT_CONTENT_ID_MUSIC_SIGNAL" v={String(cfg.musicSignal)} hint="metadata musik = tanda Content ID" />
          <Row
            k="COPYRIGHT_CONTENT_ID_KEYWORDS"
            v={cfg.extraKeywords.length ? cfg.extraKeywords.join(",") : "(kosong)"}
            hint="kata kunci tambahan"
          />
        </div>
        <div className="text-xs text-slate-400 space-y-1">
          <div>
            ⚠️ Mode <code className="text-yellow-300">warn</code> hanya memberi peringatan (aman untuk dicoba). Ganti ke{" "}
            <code className="text-yellow-300">block</code> agar video yang melanggar benar-benar di-skip & batas klip dipaksa.
          </div>
          <div>
            🔎 Deteksi Content ID berbasis sinyal (musik berlisensi, penanda deskripsi, pesan blokir hak cipta) — YouTube
            tidak menyediakan API klaim publik, jadi whitelist tetap pengaman terkuat.
          </div>
          <div>
            🤖 Telegram: <code className="text-yellow-300">/sourceguard</code> (status) ·{" "}
            <code className="text-yellow-300">/whitelist add @channel</code> (izinkan channel)
          </div>
          <div>
            🎨 Penanda Content ID bawaan &amp; format kredit bisa diubah di{" "}
            <code className="text-slate-300">src/lib/source-guard-config.ts</code>
          </div>
        </div>
      </div>
    </section>
  );
}
