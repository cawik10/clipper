/**
 * 🎞️ FORMAT TRANSFORMATIF — section dashboard (FITUR BARU!)
 * Server component terpisah supaya src/app/page.tsx tidak berubah banyak.
 * Konfigurasi & style: src/lib/transform-config.ts
 */
import {
  getTransformConfig,
  getFrameLabel,
  getCommentaryHeader,
  describeSplitVisual,
  resolveCommentaryStart,
  transformColorToHex,
  TRANSFORM_MODES,
  TRANSFORM_MODE_INFO,
  COMMENTARY_STYLES,
  COMMENTARY_STYLE_PRESETS,
} from "@/lib/transform-config";

export default function TransformSection() {
  const cfg = getTransformConfig();
  const accent = transformColorToHex(cfg.accentColor, "#FFC107");
  const textHex = transformColorToHex(cfg.textColor, "#FFFFFF");
  const cardBg = transformColorToHex(cfg.cardBg, "#000000");
  const preset = COMMENTARY_STYLE_PRESETS[cfg.commentary.style];
  const label = getFrameLabel(cfg);
  const header = getCommentaryHeader(cfg);
  const start = resolveCommentaryStart(cfg);
  const splitPct = Math.round(cfg.split.ratio * 100);

  const activeMap: Record<(typeof TRANSFORM_MODES)[number], boolean> = {
    "split-screen": cfg.splitActive,
    commentary: cfg.commentaryActive,
    frame: cfg.frameActive,
  };

  // Mockup ponsel 9:16 (120x213) — mengikuti warna/label dari config.
  const Phone = ({ children, highlight }: { children: React.ReactNode; highlight?: boolean }) => (
    <div
      className="relative mx-auto bg-gradient-to-b from-slate-700 to-slate-900 rounded-lg overflow-hidden"
      style={{ width: 120, height: 213, outline: highlight ? `2px solid ${accent}` : undefined }}
    >
      {children}
    </div>
  );
  const FakeClip = () => (
    <div className="absolute inset-0 flex items-center justify-center text-[9px] text-slate-400">klip sumber</div>
  );
  const Card = ({ top }: { top: string }) => (
    <div
      className="absolute left-[6%] right-[6%] rounded-sm overflow-hidden flex"
      style={{ top, background: cardBg + "CC" }}
    >
      <span className="w-[3px] shrink-0" style={{ background: accent }} />
      <div className="px-1.5 py-1">
        <div className="text-[6px] font-extrabold tracking-wide" style={{ color: accent }}>
          {header}
        </div>
        <div className="text-[7px] leading-tight font-bold" style={{ color: textHex }}>
          {preset.example}
        </div>
      </div>
    </div>
  );
  const Badge = ({ top }: { top: string }) => (
    <div className="absolute inset-x-0 flex justify-center" style={{ top }}>
      <span className="text-[7px] font-extrabold px-1.5 py-0.5 rounded-sm" style={{ background: accent, color: "#111" }}>
        {label}
      </span>
    </div>
  );

  return (
    <section className="bg-gradient-to-br from-cyan-500/10 to-teal-600/10 border-2 border-cyan-500/40 rounded-2xl p-6 space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-cyan-400 flex items-center gap-2">
            🎞️ Format Transformatif (Split-Screen / Commentary)
            <span className="text-xs bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 px-2 py-0.5 rounded-full">
              Fitur Baru!
            </span>
          </h2>
          <p className="text-slate-400 text-sm mt-1 max-w-3xl">
            Klip yang hanya dipotong dari channel lain berisiko kena <em>reused content</em> saat monetisasi. Fitur ini
            menambah lapisan orisinal: layout <b className="text-slate-300">split-screen</b>, kartu{" "}
            <b className="text-slate-300">komentar/konteks AI</b>, dan <b className="text-slate-300">frame “Reaksi” / “Rangkuman”</b>.
            Komentar dibuat AI dalam prompt analisis yang sama (tanpa panggilan AI tambahan) dan ikut masuk deskripsi video.
          </p>
        </div>
        <span
          className={`text-xs px-3 py-1.5 rounded-full border font-semibold ${cfg.enabled ? "bg-green-500/20 border-green-500/40 text-green-400" : "bg-slate-500/20 border-slate-500/40 text-slate-300"}`}
        >
          {cfg.enabled ? "✅ Aktif" : "⏸ Nonaktif — set TRANSFORM_ENABLED=true"}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
        <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-700/50">
          <div className="text-xs text-slate-500">Mode</div>
          <div className="text-cyan-300 font-semibold mt-1 text-sm">{cfg.modes.join(" + ")}</div>
        </div>
        <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-700/50">
          <div className="text-xs text-slate-500">Split (klip / visual)</div>
          <div className="text-cyan-300 font-semibold mt-1 text-sm">
            {splitPct}% / {100 - splitPct}%
          </div>
        </div>
        <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-700/50">
          <div className="text-xs text-slate-500">Style komentar</div>
          <div className="text-cyan-300 font-semibold mt-1 text-sm">{preset.label}</div>
        </div>
        <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-700/50">
          <div className="text-xs text-slate-500">Label / aksen</div>
          <div className="flex items-center justify-center gap-2 mt-1.5">
            <span className="text-cyan-300 font-semibold text-sm">{label}</span>
            <span className="inline-block w-5 h-5 rounded border border-slate-600" style={{ background: accent }} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {TRANSFORM_MODES.map((m) => {
          const active = activeMap[m];
          return (
            <div
              key={m}
              className={`rounded-xl p-3 border ${active ? "border-cyan-400/70 bg-cyan-950/40" : "border-slate-700/50 bg-slate-900/50"}`}
            >
              <div className="text-xs text-slate-300 font-semibold">
                {TRANSFORM_MODE_INFO[m].label}{" "}
                {active && <span className="text-cyan-400 text-[9px] ml-1">● AKTIF</span>}
              </div>
              <div className="text-[10px] text-slate-500 mb-2">{TRANSFORM_MODE_INFO[m].description}</div>

              {m === "split-screen" && (
                <Phone highlight={active}>
                  <div
                    className="absolute inset-x-0 bg-slate-600/60 flex items-center justify-center text-[9px] text-slate-300"
                    style={{ [cfg.split.clipPosition === "top" ? "top" : "bottom"]: 0, height: `${splitPct}%` }}
                  >
                    klip sumber
                  </div>
                  <div
                    className="absolute inset-x-0 flex items-center justify-center text-[9px] text-slate-200"
                    style={{
                      [cfg.split.clipPosition === "top" ? "bottom" : "top"]: 0,
                      height: `${100 - splitPct}%`,
                      background: `linear-gradient(135deg, #0B0B1A, ${accent}55, #1B1035)`,
                    }}
                  >
                    visual loop
                  </div>
                  {cfg.split.divider > 0 && (
                    <div
                      className="absolute inset-x-0"
                      style={{
                        top: `${cfg.split.clipPosition === "top" ? splitPct : 100 - splitPct}%`,
                        height: 2,
                        background: accent,
                      }}
                    />
                  )}
                </Phone>
              )}
              {m === "commentary" && (
                <Phone highlight={active}>
                  <FakeClip />
                  <Card top="62%" />
                </Phone>
              )}
              {m === "frame" && (
                <Phone highlight={active}>
                  <FakeClip />
                  <div className="absolute inset-0" style={{ boxShadow: `inset 0 0 0 ${Math.max(1, Math.round(cfg.frame.border / 5))}px ${accent}` }} />
                  <Badge top="7%" />
                </Phone>
              )}
            </div>
          );
        })}
      </div>

      <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700/50">
        <div className="text-sm font-semibold text-slate-300 mb-2">
          ✨ Style komentar AI <span className="text-slate-500 font-normal">(TRANSFORM_COMMENTARY_STYLE)</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {COMMENTARY_STYLES.map((s) => {
            const p = COMMENTARY_STYLE_PRESETS[s];
            const active = s === cfg.commentary.style;
            return (
              <div
                key={s}
                className={`rounded-lg p-2.5 border text-sm ${active ? "border-cyan-400/60 bg-cyan-950/30" : "border-slate-700/50"}`}
              >
                <div className="text-slate-200 font-semibold">
                  <code className="text-yellow-300">{s}</code> — {p.label}
                  {active && <span className="text-cyan-400 text-[9px] ml-2">● AKTIF</span>}
                </div>
                <div className="text-xs text-slate-500">
                  {p.description} • label bingkai “{p.frameLabel}”
                </div>
                <div className="text-xs text-slate-400 mt-1 italic">“{p.example}”</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-cyan-950/30 border border-cyan-500/20 rounded-xl p-4 space-y-3">
        <div className="text-sm font-semibold text-cyan-300">🔧 Cara Atur di Railway Variables:</div>
        <div className="font-mono text-sm bg-slate-900/80 rounded-lg p-3 space-y-1">
          <div><span className="text-yellow-300">TRANSFORM_ENABLED</span> = <span className="text-emerald-400">{String(cfg.enabled)}</span> <span className="text-slate-600">← saklar utama (default: false)</span></div>
          <div><span className="text-yellow-300">TRANSFORM_MODE</span> = <span className="text-emerald-400">{cfg.modes.join(",")}</span> <span className="text-slate-600">← split-screen | commentary | frame | all</span></div>
          <div><span className="text-yellow-300">TRANSFORM_COMMENTARY_STYLE</span> = <span className="text-emerald-400">{cfg.commentary.style}</span> <span className="text-slate-600">← context | reaction | summary | insight</span></div>
          <div><span className="text-yellow-300">TRANSFORM_FRAME_LABEL</span> = <span className="text-emerald-400">{cfg.frame.label}</span> <span className="text-slate-600">← auto | reaksi | rangkuman | teks bebas</span></div>
          <div><span className="text-yellow-300">TRANSFORM_SPLIT_VISUAL</span> = <span className="text-emerald-400">{cfg.split.visual.kind === "sources" ? "(URL/path loop)" : cfg.split.visual.kind}</span> <span className="text-slate-600">← gradient | blur | URL .mp4 (pisah koma)</span></div>
          <div><span className="text-yellow-300">TRANSFORM_SPLIT_RATIO</span> = <span className="text-emerald-400">{cfg.split.ratio}</span> <span className="text-slate-600">← porsi klip 0.4 - 0.7</span></div>
          <div><span className="text-yellow-300">TRANSFORM_COMMENTARY_DURATION</span> = <span className="text-emerald-400">{cfg.commentary.duration}</span> <span className="text-slate-600">← detik (mulai di detik {start})</span></div>
          <div><span className="text-yellow-300">TRANSFORM_ACCENT_COLOR</span> = <span className="text-emerald-400">{cfg.accentColor}</span></div>
        </div>
        <div className="text-xs text-slate-400 space-y-1">
          <div>🎮 Visual bawah saat ini: <b className="text-slate-300">{describeSplitVisual(cfg.split.visual)}</b>. Untuk gameplay/satisfying loop sendiri, isi <code className="text-slate-300">TRANSFORM_SPLIT_VISUAL</code> dengan link langsung .mp4 (diunduh sekali lalu di-cache) atau link YouTube (via yt-dlp). Pakai video yang kamu punya hak pakainya.</div>
          <div>🧠 Komentar dibuat AI dalam prompt analisis yang sama — tanpa panggilan AI tambahan, dan ikut ditambahkan ke deskripsi (<code className="text-slate-300">TRANSFORM_DESCRIPTION</code>).</div>
          <div>🛡️ Kalau AI tidak memberi komentar / FFmpeg gagal / sumber visual tidak bisa diunduh, klip tetap diproses normal — tidak pernah gagal karena fitur ini.</div>
          <div>🎨 Ganti teks arahan AI, judul kartu, atau label di <code className="text-slate-300">COMMENTARY_STYLE_PRESETS</code> (<code className="text-slate-300">src/lib/transform-config.ts</code>); layout di <code className="text-slate-300">src/lib/transform-format.ts</code>.</div>
          <div>⚠️ Membantu mengurangi risiko <em>reused content</em>, bukan jaminan monetisasi — pastikan komentar benar-benar menambah nilai.</div>
          <div>🤖 Telegram: <code className="text-yellow-300">/transform</code> untuk lihat konfigurasi</div>
        </div>
      </div>
    </section>
  );
}
