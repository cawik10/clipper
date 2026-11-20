/**
 * 💬 AUTO-FIRST COMMENT — section dashboard (FITUR BARU!)
 * Server component terpisah supaya src/app/page.tsx tidak berubah banyak.
 * Konfigurasi: src/lib/auto-comment-config.ts · Logika: src/lib/auto-comment.ts
 */
import {
  AUTO_COMMENT_EXAMPLES,
  AUTO_COMMENT_STYLES,
  AUTO_COMMENT_STYLE_PRESETS,
  getAutoCommentAllowedPrivacy,
  getAutoCommentDelaySeconds,
  getAutoCommentMaxChars,
  getAutoCommentRetries,
  getAutoCommentStyle,
  getAutoCommentSuffix,
  isAutoCommentEnabled,
  isCommentFallbackEnabled,
  isCommentPinLinkEnabled,
} from "@/lib/auto-comment-config";

export default function AutoCommentSection() {
  const enabled = isAutoCommentEnabled();
  const style = getAutoCommentStyle();
  const suffix = getAutoCommentSuffix();

  return (
    <section className="bg-gradient-to-br from-sky-500/10 to-indigo-600/10 border-2 border-sky-500/40 rounded-2xl p-6 space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-sky-400 flex items-center gap-2">
            💬 Auto-First Comment (Pancingan Algoritma)
            <span className="text-xs bg-sky-500/20 border border-sky-500/40 text-sky-300 px-2 py-0.5 rounded-full">
              Fitur Baru!
            </span>
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Algoritma YouTube Shorts menyukai kolom komentar yang ramai. AI membuat 1 kalimat komentar pancingan/kontroversial
            yang relevan dengan isi klip, lalu setelah video terupload bot otomatis memostingnya lewat{" "}
            <code className="text-slate-300">commentThreads.insert</code>.
          </p>
        </div>
        <span
          className={`text-xs px-3 py-1.5 rounded-full border font-semibold ${
            enabled
              ? "bg-green-500/20 border-green-500/40 text-green-400"
              : "bg-slate-700/40 border-slate-600 text-slate-400"
          }`}
        >
          {enabled ? "✅ Aktif" : "⚪ Nonaktif"}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
        <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-700/50">
          <div className="text-xs text-slate-500">Gaya</div>
          <div className="text-sky-300 font-semibold mt-1">{AUTO_COMMENT_STYLE_PRESETS[style].label}</div>
        </div>
        <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-700/50">
          <div className="text-xs text-slate-500">Maks panjang</div>
          <div className="text-sky-300 font-semibold mt-1">{getAutoCommentMaxChars()} karakter</div>
        </div>
        <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-700/50">
          <div className="text-xs text-slate-500">Video target</div>
          <div className="text-sky-300 font-semibold mt-1">{getAutoCommentAllowedPrivacy().join(", ")}</div>
        </div>
        <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-700/50">
          <div className="text-xs text-slate-500">Percobaan / jeda</div>
          <div className="text-sky-300 font-semibold mt-1">
            {getAutoCommentRetries()}x / {getAutoCommentDelaySeconds()} dtk
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {AUTO_COMMENT_STYLES.map((st) => (
          <div
            key={st}
            className={`rounded-xl p-3 border ${
              st === style ? "border-sky-400/70 bg-sky-950/40" : "border-slate-700/50 bg-slate-900/50"
            }`}
          >
            <div className="text-xs text-slate-300 font-semibold">
              {AUTO_COMMENT_STYLE_PRESETS[st].label}{" "}
              {st === style && <span className="text-sky-400 text-[9px] ml-1">● AKTIF</span>}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">{AUTO_COMMENT_STYLE_PRESETS[st].description}</div>
          </div>
        ))}
      </div>

      <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700/50">
        <div className="text-sm font-semibold text-slate-300 mb-2">✨ Contoh komentar hasil AI:</div>
        <ul className="text-sm text-slate-400 space-y-1 list-disc list-inside">
          {AUTO_COMMENT_EXAMPLES.map((c) => (
            <li key={c}>&quot;{c}&quot;</li>
          ))}
        </ul>
        {suffix && (
          <div className="text-xs text-slate-500 mt-2">
            Suffix otomatis di akhir komentar: <span className="text-sky-300">&quot;{suffix}&quot;</span>
          </div>
        )}
      </div>

      <div className="bg-sky-950/30 border border-sky-500/20 rounded-xl p-4 space-y-3">
        <div className="text-sm font-semibold text-sky-300">🔧 Cara Atur di Railway Variables:</div>
        <div className="font-mono text-sm bg-slate-900/80 rounded-lg p-3 space-y-1">
          <div><span className="text-yellow-300">YOUTUBE_AUTO_COMMENT_ENABLED</span> = <span className="text-emerald-400">{String(enabled)}</span></div>
          <div><span className="text-yellow-300">YOUTUBE_AUTO_COMMENT_STYLE</span> = <span className="text-emerald-400">{style}</span> <span className="text-slate-600">← {AUTO_COMMENT_STYLES.join(" | ")}</span></div>
          <div><span className="text-yellow-300">YOUTUBE_AUTO_COMMENT_SUFFIX</span> = <span className="text-emerald-400">{suffix || "(kosong)"}</span> <span className="text-slate-600">← mis. Full video ada di channel @kamu</span></div>
          <div><span className="text-yellow-300">YOUTUBE_AUTO_COMMENT_MAX_CHARS</span> = <span className="text-emerald-400">{getAutoCommentMaxChars()}</span></div>
          <div><span className="text-yellow-300">YOUTUBE_AUTO_COMMENT_FALLBACK</span> = <span className="text-emerald-400">{String(isCommentFallbackEnabled())}</span></div>
          <div><span className="text-yellow-300">YOUTUBE_AUTO_COMMENT_PIN_LINK</span> = <span className="text-emerald-400">{String(isCommentPinLinkEnabled())}</span></div>
        </div>
        <div className="text-xs text-slate-400 space-y-1">
          <div>🧠 Komentar dibuat AI (GPT/Gemini) dalam prompt analisis yang sama — tanpa panggilan AI tambahan.</div>
          <div>🔑 Butuh izin <code className="text-slate-300">youtube.force-ssl</code>: setelah diaktifkan, kirim <code className="text-yellow-300">/connect</code> sekali lagi di Telegram.</div>
          <div>📌 YouTube API tidak menyediakan fitur pin — bot mengirim link komentar ke Telegram, tinggal ⋮ → Pin.</div>
          <div>🛡️ Kalau komentar gagal, upload video tetap sukses — tidak pernah gagal karena fitur ini.</div>
          <div>🎨 Gaya, prompt AI &amp; komentar cadangan bisa diubah di <code className="text-slate-300">src/lib/auto-comment-config.ts</code></div>
          <div>🤖 Telegram: <code className="text-yellow-300">/autocomment</code> untuk lihat konfigurasi</div>
        </div>
      </div>
    </section>
  );
}
