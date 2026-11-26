/**
 * 🪝 AI HOOK OVERLAY — section dashboard (FITUR BARU!)
 * Server component terpisah supaya src/app/page.tsx tidak berubah banyak.
 * Konfigurasi & style: src/lib/hook-config.ts
 */
import {
  getHookConfig,
  HOOK_STYLES,
  HOOK_STYLE_PRESETS,
  hookColorToHex,
} from "@/lib/hook-config";

const HOOK_EXAMPLES = [
  "Kamu gak akan percaya apa yang terjadi selanjutnya...",
  "99% orang salah soal ini!",
  "Ini rahasia yang CEO gak mau kamu tahu",
];

export default function HookOverlaySection() {
  const hookCfg = getHookConfig();
  const hookTextHex = hookColorToHex(hookCfg.color);
  const hookBgHex = hookColorToHex(hookCfg.bgColor, "#FF0000");
  const hookExamples = HOOK_EXAMPLES;

  return (
    <section className="bg-gradient-to-br from-red-500/10 to-rose-600/10 border-2 border-red-500/40 rounded-2xl p-6 space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-red-400 flex items-center gap-2">
            🪝 AI Hook Overlay (Teks Pembuka)
            <span className="text-xs bg-red-500/20 border border-red-500/40 text-red-300 px-2 py-0.5 rounded-full">
              Fitur Baru!
            </span>
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            AI membuat teks hook yang muncul {hookCfg.duration} detik pertama klip — faktor utama retention di Shorts.
            Di-generate bersamaan dengan analisis momen, dirender via FFmpeg <code className="text-slate-300">drawtext</code>{" "}
            <code className="text-slate-300">enable=&apos;between(t,0,{hookCfg.duration})&apos;</code>.
          </p>
        </div>
        <span className={`text-xs px-3 py-1.5 rounded-full border font-semibold ${hookCfg.enabled ? "bg-green-500/20 border-green-500/40 text-green-400" : "bg-red-500/20 border-red-500/40 text-red-400"}`}>
          {hookCfg.enabled ? "✅ Aktif" : "❌ Nonaktif"}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
        <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-700/50">
          <div className="text-xs text-slate-500">Style</div>
          <div className="text-red-300 font-semibold mt-1">{hookCfg.style}</div>
        </div>
        <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-700/50">
          <div className="text-xs text-slate-500">Durasi</div>
          <div className="text-red-300 font-semibold mt-1">{hookCfg.duration} detik</div>
        </div>
        <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-700/50">
          <div className="text-xs text-slate-500">Font</div>
          <div className="text-red-300 font-semibold mt-1">{hookCfg.fontSize}px</div>
        </div>
        <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-700/50">
          <div className="text-xs text-slate-500">Warna teks / latar</div>
          <div className="flex items-center justify-center gap-2 mt-1.5">
            <span className="inline-block w-5 h-5 rounded border border-slate-600" style={{ background: hookTextHex }} />
            <span className="inline-block w-5 h-5 rounded border border-slate-600" style={{ background: hookBgHex }} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {HOOK_STYLES.map((st, idx) => {
          const preset = HOOK_STYLE_PRESETS[st];
          const active = st === hookCfg.style;
          const text = hookExamples[idx % hookExamples.length];
          const words = text.split(" ");
          const mid = Math.ceil(words.length / 2);
          const barBase = {
            background: hookBgHex,
            color: hookTextHex,
          } as const;
          return (
            <div
              key={st}
              className={`rounded-xl p-3 border ${active ? "border-red-400/70 bg-red-950/40" : "border-slate-700/50 bg-slate-900/50"}`}
            >
              <div className="text-xs text-slate-300 font-semibold">
                {preset.label} {active && <span className="text-red-400 text-[9px] ml-1">● AKTIF</span>}
              </div>
              <div className="text-[10px] text-slate-500 mb-2">{preset.description}</div>
              <div className="relative mx-auto bg-gradient-to-b from-slate-700 to-slate-900 rounded-lg overflow-hidden" style={{ width: 120, height: 213 }}>
                {st === "bold-center" && (
                  <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 px-2 text-center">
                    <span className="inline-block font-extrabold text-[10px] leading-snug px-1.5 py-0.5 rounded-sm" style={barBase}>
                      {text}
                    </span>
                  </div>
                )}
                {st === "top-bar" && (
                  <div className="absolute inset-x-0 text-center font-extrabold text-[10px] leading-snug px-2 py-1.5" style={{ ...barBase, top: "12%" }}>
                    {text}
                  </div>
                )}
                {st === "split" && (
                  <>
                    <div className="absolute inset-x-0 text-center font-extrabold text-[10px] leading-snug px-2 py-1.5" style={{ ...barBase, top: "14%" }}>
                      {words.slice(0, mid).join(" ")}
                    </div>
                    <div className="absolute inset-x-0 text-center font-extrabold text-[10px] leading-snug px-2 py-1.5" style={{ background: "rgba(0,0,0,0.85)", color: hookTextHex, top: "68%" }}>
                      {words.slice(mid).join(" ")}
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700/50">
        <div className="text-sm font-semibold text-slate-300 mb-2">✨ Contoh hook hasil AI:</div>
        <ul className="text-sm text-slate-400 space-y-1 list-disc list-inside">
          {hookExamples.map((h) => (
            <li key={h}>&quot;{h}&quot;</li>
          ))}
        </ul>
      </div>

      <div className="bg-red-950/30 border border-red-500/20 rounded-xl p-4 space-y-3">
        <div className="text-sm font-semibold text-red-300">🔧 Cara Atur di Railway Variables:</div>
        <div className="font-mono text-sm bg-slate-900/80 rounded-lg p-3 space-y-1">
          <div><span className="text-yellow-300">HOOK_ENABLED</span> = <span className="text-emerald-400">{String(hookCfg.enabled)}</span></div>
          <div><span className="text-yellow-300">HOOK_DURATION</span> = <span className="text-emerald-400">{hookCfg.duration}</span> <span className="text-slate-600">← detik (0.5 - 5)</span></div>
          <div><span className="text-yellow-300">HOOK_STYLE</span> = <span className="text-emerald-400">{hookCfg.style}</span> <span className="text-slate-600">← bold-center | top-bar | split</span></div>
          <div><span className="text-yellow-300">HOOK_FONT_SIZE</span> = <span className="text-emerald-400">{hookCfg.fontSize}</span></div>
          <div><span className="text-yellow-300">HOOK_COLOR</span> = <span className="text-emerald-400">{hookCfg.color}</span></div>
          <div><span className="text-yellow-300">HOOK_BG_COLOR</span> = <span className="text-emerald-400">{hookCfg.bgColor}</span></div>
        </div>
        <div className="text-xs text-slate-400 space-y-1">
          <div>🧠 Hook dibuat AI (GPT/Gemini) dalam prompt analisis yang sama — tanpa panggilan AI tambahan.</div>
          <div>🛡️ Kalau AI tidak memberi hook / FFmpeg gagal, klip tetap diproses normal — tidak pernah gagal karena fitur ini.</div>
          <div>🎨 Style bisa disetel di <code className="text-slate-300">HOOK_STYLE_PRESETS</code> (<code className="text-slate-300">src/lib/hook-config.ts</code>), prompt AI di <code className="text-slate-300">src/lib/ai-analyzer.ts</code>.</div>
          <div>🤖 Telegram: <code className="text-yellow-300">/hook</code> untuk lihat konfigurasi</div>
        </div>
      </div>
    </section>
  );
}
