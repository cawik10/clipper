import { db } from "@/db";
import { clipJobs, userSettings } from "@/db/schema";
import { sql, desc } from "drizzle-orm";
import {
  getAspectRatioMode,
  getModeLabel,
  getThumbnailConfig,
  getThumbnailModeLabel,
  getWatermarkConfig,
  getWatermarkPositionLabel,
  getIntroOutroConfig,
  getZoomEffectConfig,
  getZoomEffectLabel,
  getMaxClipsConfig,
  getDefaultClipDuration,
  CLIP_DURATION_OPTIONS,
  type AspectRatioMode,
  type ThumbnailMode,
  type WatermarkPosition,
  type ZoomEffectType,
} from "@/lib/video-config";
import type { ClipResult } from "@/db/schema";

export const dynamic = "force-dynamic";

// ═══════════════════════════════════════════════════════════
// DATA FETCHING
// ═══════════════════════════════════════════════════════════
async function getStats() {
  try {
    const totalJobsResult = await db.execute(sql`SELECT COUNT(*) as count FROM clip_jobs`);
    const doneJobsResult = await db.execute(sql`SELECT COUNT(*) as count FROM clip_jobs WHERE status = 'done'`);
    const totalUsersResult = await db.execute(sql`SELECT COUNT(DISTINCT telegram_user_id) as count FROM clip_jobs`);
    const totalJobs = Number((totalJobsResult as unknown as Array<{ count: string }>)[0]?.count ?? 0);
    const doneJobs = Number((doneJobsResult as unknown as Array<{ count: string }>)[0]?.count ?? 0);
    const totalUsers = Number((totalUsersResult as unknown as Array<{ count: string }>)[0]?.count ?? 0);

    const recentJobs = await db
      .select()
      .from(clipJobs)
      .orderBy(desc(clipJobs.createdAt))
      .limit(10);

    let totalClips = 0;
    let totalThumbnails = 0;
    recentJobs.forEach((job) => {
      const clips = (job.clips as ClipResult[] | null) || [];
      totalClips += clips.length;
      totalThumbnails += clips.filter((c) => c.thumbnailPath).length;
    });

    return {
      totalJobs,
      doneJobs,
      totalUsers,
      totalClips,
      totalThumbnails,
      recentJobs,
    };
  } catch {
    return { totalJobs: 0, doneJobs: 0, totalUsers: 0, totalClips: 0, totalThumbnails: 0, recentJobs: [] };
  }
}

// ═══════════════════════════════════════════════════════════
// DESCRIPTIONS
// ═══════════════════════════════════════════════════════════
const modeDescriptions: Record<
  AspectRatioMode,
  { icon: string; label: string; desc: string; recommended?: boolean }
> = {
  blur:    { icon: "🌀", label: "Blur Background", desc: "Background blur, tidak bolong (REKOMENDASI)", recommended: true },
  crop:    { icon: "✂️", label: "Center Crop",    desc: "Crop tengah, full layar" },
  pad:     { icon: "⬛", label: "Black Bars",     desc: "Letterbox / pillarbox" },
  stretch: { icon: "↔️", label: "Stretch",        desc: "Stretch paksa ke 9:16" },
  none:    { icon: "📐", label: "Original Ratio", desc: "Pertahankan rasio asli" },
};

const thumbnailModeDescriptions: Record<
  ThumbnailMode,
  { icon: string; label: string; desc: string; recommended?: boolean }
> = {
  middle: { icon: "🎯", label: "Middle Frame",  desc: "Ambil frame dari tengah klip", recommended: true },
  best:   { icon: "⭐", label: "Best Frame",    desc: "Scan & pilih frame terbaik (lebih lambat)" },
  start:  { icon: "▶️", label: "Start Frame",   desc: "Ambil frame dari awal klip" },
  custom: { icon: "🔢", label: "Custom Offset", desc: "Offset detik ke-N (pakai THUMBNAIL_OFFSET_SECONDS)" },
};

const watermarkPositionDescriptions: Record<
  WatermarkPosition,
  { icon: string; label: string; recommended?: boolean }
> = {
  bottomright: { icon: "↘️", label: "Kanan Bawah", recommended: true },
  bottomleft:  { icon: "↙️", label: "Kiri Bawah" },
  topright:    { icon: "↗️", label: "Kanan Atas" },
  topleft:     { icon: "↖️", label: "Kiri Atas" },
  center:      { icon: "🎯", label: "Tengah" },
};

const zoomTypeDescriptions: Record<
  ZoomEffectType,
  { icon: string; label: string; desc: string; recommended?: boolean }
> = {
  in:     { icon: "🔍", label: "Zoom In",    desc: "Mendekati subyek",       recommended: true },
  out:    { icon: "🔭", label: "Zoom Out",   desc: "Menjauh dari subyek" },
  "in-out": { icon: "↔️", label: "In-Out",  desc: "Zoom in lalu zoom out" },
  pulse:  { icon: "💓", label: "Pulse",      desc: "Denyut zoom berulang" },
};

const statusConfig: Record<string, { label: string; color: string }> = {
  queued:      { label: "⏳ Antre",       color: "text-gray-400" },
  downloading: { label: "⬇️ Download",    color: "text-blue-400" },
  analyzing:   { label: "🧠 Analisis",    color: "text-yellow-400" },
  clipping:    { label: "✂️ Clipping",    color: "text-orange-400" },
  uploading:   { label: "📤 Upload",      color: "text-purple-400" },
  done:        { label: "✅ Selesai",     color: "text-green-400" },
  error:       { label: "❌ Error",       color: "text-red-400" },
};

const platformConfig: Record<string, { emoji: string }> = {
  youtube:  { emoji: "📺" },
  facebook: { emoji: "📘" },
  tiktok:   { emoji: "🎵" },
  instagram:{ emoji: "📸" },
  unknown:  { emoji: "🌐" },
};

// ═══════════════════════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════════════════════
export default async function HomePage() {
  const stats = await getStats();
  const currentMode = getAspectRatioMode();
  const thumbConfig = getThumbnailConfig();
  const wmConfig = getWatermarkConfig();
  const ioCfg = getIntroOutroConfig();
  const zoomCfg = getZoomEffectConfig();
  const maxClips = getMaxClipsConfig();
  const clipDuration = getDefaultClipDuration();

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 px-4 py-10">
      <div className="max-w-5xl mx-auto space-y-8">

        {/* ── Header ── */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold text-white">🤖 AutoClip Bot</h1>
          <p className="text-slate-400 text-lg">AI YouTube Shorts Generator — Dashboard</p>
        </div>

        {/* ── Stats ── */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: "Total Jobs",   value: stats.totalJobs,      icon: "🎬", color: "from-blue-500/20 to-blue-600/20 border-blue-500/30" },
            { label: "Selesai",      value: stats.doneJobs,       icon: "✅", color: "from-green-500/20 to-green-600/20 border-green-500/30" },
            { label: "Pengguna",     value: stats.totalUsers,     icon: "👥", color: "from-purple-500/20 to-purple-600/20 border-purple-500/30" },
            { label: "Klip Dibuat", value: stats.totalClips,     icon: "✂️", color: "from-orange-500/20 to-orange-600/20 border-orange-500/30" },
            { label: "Thumbnail",    value: stats.totalThumbnails,icon: "🖼", color: "from-pink-500/20 to-pink-600/20 border-pink-500/30" },
          ].map((stat) => (
            <div key={stat.label} className={`bg-gradient-to-br ${stat.color} border rounded-2xl p-4 text-center`}>
              <div className="text-2xl">{stat.icon}</div>
              <div className="text-2xl font-bold">{stat.value}</div>
              <div className="text-xs text-slate-400">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* ══════════════════════════════════════════════════════════
            ✂️ MAX CLIPS SECTION (FITUR UTAMA — BARU!)
        ══════════════════════════════════════════════════════════ */}
        <section className="bg-gradient-to-br from-emerald-500/10 to-teal-600/10 border-2 border-emerald-500/40 rounded-2xl p-6 space-y-5">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-xl font-bold text-emerald-400 flex items-center gap-2">
                ✂️ Jumlah Klip AutoClip
                <span className="text-xs bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 px-2 py-0.5 rounded-full">
                  Fitur Diperbarui!
                </span>
              </h2>
              <p className="text-slate-400 text-sm mt-1">
                Sebelumnya hardcoded 3 klip — sekarang mudah diubah via Railway Variables.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-4xl font-black text-emerald-400">{maxClips}</span>
              <span className="text-slate-400 text-sm">klip<br/>aktif</span>
            </div>
          </div>

          {/* Visual selector */}
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <div
                key={n}
                className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center text-sm font-bold transition-all
                  ${n === maxClips
                    ? "bg-emerald-500 text-white scale-110 shadow-lg shadow-emerald-500/40"
                    : n === 5
                    ? "bg-emerald-500/20 border-2 border-emerald-500/50 text-emerald-400"
                    : "bg-slate-800 border border-slate-700 text-slate-400"
                  }`}
              >
                {n}
                {n === 5 && <span className="text-[8px] leading-none">default</span>}
              </div>
            ))}
          </div>

          {/* Current config */}
          <div className="bg-slate-900/60 rounded-xl p-4 space-y-2">
            <div className="text-sm font-semibold text-slate-300 mb-2">📋 Konfigurasi Aktif</div>
            <div className="flex items-center gap-2 text-sm font-mono">
              <span className="text-slate-500">ENV:</span>
              <span className="text-yellow-300">MAX_CLIPS</span>
              <span className="text-slate-500">=</span>
              <span className="text-emerald-400 font-bold">{maxClips}</span>
              {maxClips === 5 && <span className="text-xs text-slate-500">(default)</span>}
            </div>
          </div>

          {/* How to change */}
          <div className="bg-emerald-950/40 border border-emerald-500/20 rounded-xl p-4 space-y-3">
            <div className="text-sm font-semibold text-emerald-300">🔧 Cara Ubah di Railway Variables:</div>
            <div className="font-mono text-sm bg-slate-900/80 rounded-lg p-3 space-y-1">
              <div>
                <span className="text-yellow-300">MAX_CLIPS</span>
                <span className="text-slate-500"> = </span>
                <span className="text-emerald-400">5</span>
                <span className="text-slate-600">  ← default baru (sebelumnya 3)</span>
              </div>
              <div className="text-slate-500 text-xs mt-2">
                # Rentang valid: 1 sampai 10
              </div>
              <div className="text-slate-500 text-xs">
                # Contoh lain:
              </div>
              <div>
                <span className="text-yellow-300">MAX_CLIPS</span>
                <span className="text-slate-500"> = </span>
                <span className="text-blue-400">3</span>
                <span className="text-slate-600">  ← lebih cepat, 3 klip</span>
              </div>
              <div>
                <span className="text-yellow-300">MAX_CLIPS</span>
                <span className="text-slate-500"> = </span>
                <span className="text-purple-400">10</span>
                <span className="text-slate-600"> ← maksimal</span>
              </div>
            </div>
            <div className="text-xs text-slate-400 space-y-1">
              <div>💡 <strong>Tidak perlu redeploy</strong> — perubahan Railway Variables langsung berlaku saat restart.</div>
              <div>🤖 Telegram command: <code className="text-emerald-300">/clips</code> untuk info + ubah per-akun</div>
              <div>⚙️ Telegram command: <code className="text-slate-300">/settings</code> untuk ubah via tombol (1–5 klip)</div>
            </div>
          </div>

          {/* Comparison table */}
          <div className="grid grid-cols-3 gap-3 text-center text-sm">
            {[
              { n: 3, label: "Sebelumnya", badge: "lama", color: "border-slate-600 text-slate-400" },
              { n: 5, label: "Default Baru", badge: "sekarang", color: "border-emerald-500/60 text-emerald-400" },
              { n: maxClips, label: "Aktif Sekarang", badge: "env", color: "border-yellow-500/60 text-yellow-400" },
            ].map((item) => (
              <div key={item.label} className={`border rounded-xl p-3 ${item.color}`}>
                <div className="text-3xl font-black">{item.n}</div>
                <div className="text-xs opacity-70">{item.label}</div>
                <div className="text-[10px] opacity-50 mt-1">{item.badge}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════
            ⏱ CLIP DURATION SECTION (FITUR BARU!)
        ══════════════════════════════════════════════════════════ */}
        <section className="bg-gradient-to-br from-sky-500/10 to-indigo-600/10 border-2 border-sky-500/40 rounded-2xl p-6 space-y-5">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-xl font-bold text-sky-400 flex items-center gap-2">
                ⏱ Durasi Klip
                <span className="text-xs bg-sky-500/20 border border-sky-500/40 text-sky-300 px-2 py-0.5 rounded-full">
                  Fitur Baru!
                </span>
              </h2>
              <p className="text-slate-400 text-sm mt-1">
                Sebelumnya otomatis 15-40 detik — sekarang pilih durasi tetap, mudah diubah lewat Railway Variables atau bot Telegram.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-4xl font-black text-sky-400">{clipDuration}s</span>
              <span className="text-slate-400 text-sm">durasi<br/>aktif</span>
            </div>
          </div>

          {/* Visual selector */}
          <div className="flex flex-wrap gap-2">
            {CLIP_DURATION_OPTIONS.map((d) => (
              <div
                key={d}
                className={`min-w-14 h-12 px-3 rounded-xl flex flex-col items-center justify-center text-sm font-bold transition-all
                  ${d === clipDuration
                    ? "bg-sky-500 text-white scale-110 shadow-lg shadow-sky-500/40"
                    : d === 30
                    ? "bg-sky-500/20 border-2 border-sky-500/50 text-sky-400"
                    : "bg-slate-800 border border-slate-700 text-slate-400"
                  }`}
              >
                {d}s
                {d === 30 && <span className="text-[8px] leading-none">default</span>}
              </div>
            ))}
          </div>

          {/* Current config */}
          <div className="bg-slate-900/60 rounded-xl p-4 space-y-2">
            <div className="text-sm font-semibold text-slate-300 mb-2">📋 Konfigurasi Aktif</div>
            <div className="flex items-center gap-2 text-sm font-mono">
              <span className="text-slate-500">ENV:</span>
              <span className="text-yellow-300">CLIP_DURATION</span>
              <span className="text-slate-500">=</span>
              <span className="text-sky-400 font-bold">{clipDuration}</span>
              {clipDuration === 30 && <span className="text-xs text-slate-500">(default)</span>}
            </div>
          </div>

          {/* How to change */}
          <div className="bg-sky-950/40 border border-sky-500/20 rounded-xl p-4 space-y-3">
            <div className="text-sm font-semibold text-sky-300">🔧 Cara Ubah di Railway Variables:</div>
            <div className="font-mono text-sm bg-slate-900/80 rounded-lg p-3 space-y-1">
              <div>
                <span className="text-yellow-300">CLIP_DURATION</span>
                <span className="text-slate-500"> = </span>
                <span className="text-sky-400">30</span>
                <span className="text-slate-600">  ← default</span>
              </div>
              <div className="text-slate-500 text-xs mt-2">
                # Nilai valid: {CLIP_DURATION_OPTIONS.join(", ")}
              </div>
              <div className="text-slate-500 text-xs">
                # Contoh lain:
              </div>
              <div>
                <span className="text-yellow-300">CLIP_DURATION</span>
                <span className="text-slate-500"> = </span>
                <span className="text-blue-400">15</span>
                <span className="text-slate-600">  ← klip pendek & padat</span>
              </div>
              <div>
                <span className="text-yellow-300">CLIP_DURATION</span>
                <span className="text-slate-500"> = </span>
                <span className="text-purple-400">60</span>
                <span className="text-slate-600"> ← klip paling panjang</span>
              </div>
            </div>
            <div className="text-xs text-slate-400 space-y-1">
              <div>💡 <strong>Tidak perlu redeploy</strong> — perubahan Railway Variables langsung berlaku saat restart.</div>
              <div>🤖 Telegram command: <code className="text-sky-300">/duration</code> untuk info + ubah per-akun</div>
              <div>⚙️ Telegram command: <code className="text-slate-300">/settings</code> untuk ubah via tombol (15/20/30/40/60 detik)</div>
            </div>
          </div>

          {/* Options table */}
          <div className="grid grid-cols-5 gap-2 text-center text-sm">
            {CLIP_DURATION_OPTIONS.map((d) => (
              <div
                key={d}
                className={`border rounded-xl p-3 ${
                  d === clipDuration
                    ? "border-yellow-500/60 text-yellow-400"
                    : d === 30
                    ? "border-sky-500/60 text-sky-400"
                    : "border-slate-600 text-slate-400"
                }`}
              >
                <div className="text-2xl font-black">{d}s</div>
                <div className="text-[10px] opacity-50 mt-1">{d === clipDuration ? "aktif" : d === 30 ? "default" : "pilihan"}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════
            WATERMARK SECTION
        ══════════════════════════════════════════════════════════ */}
        <section className="bg-slate-900/60 border border-slate-700/50 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">💧 Watermark Custom</h2>
              <p className="text-slate-400 text-sm">Teks atau logo pada setiap klip via FFmpeg.</p>
            </div>
            <div className="text-right">
              <span className={`text-xs px-2 py-1 rounded-full border ${wmConfig.enabled ? "bg-green-500/20 border-green-500/40 text-green-400" : "bg-red-500/20 border-red-500/40 text-red-400"}`}>
                {wmConfig.enabled ? "✅ Aktif" : "❌ Nonaktif"}
              </span>
              <div className="text-xs text-slate-500 mt-1">teks: {wmConfig.text}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {(Object.entries(watermarkPositionDescriptions) as [WatermarkPosition, typeof watermarkPositionDescriptions[WatermarkPosition]][]).map(([pos, info]) => (
              <div
                key={pos}
                className={`rounded-xl p-3 text-center text-xs border transition-all ${
                  wmConfig.position === pos
                    ? "bg-blue-500/20 border-blue-500/50 text-blue-300"
                    : "bg-slate-800 border-slate-700 text-slate-400"
                }`}
              >
                {wmConfig.position === pos && <div className="text-[9px] text-blue-400 mb-1">● AKTIF</div>}
                {info.recommended && <div className="text-[9px] text-yellow-400 mb-1">⭐</div>}
                <div className="text-lg">{info.icon}</div>
                <div className="font-medium mt-1">{info.label}</div>
                <div className="text-[9px] opacity-60 mt-0.5">{pos}</div>
              </div>
            ))}
          </div>

          <div className="bg-slate-800/60 rounded-xl p-4">
            <div className="text-sm font-semibold text-slate-300 mb-2">🔧 Railway Variables:</div>
            <div className="font-mono text-xs space-y-1 text-slate-400">
              <div><span className="text-yellow-300">WATERMARK_ENABLED</span> = <span className="text-emerald-400">{String(wmConfig.enabled)}</span></div>
              <div><span className="text-yellow-300">WATERMARK_TEXT</span> = <span className="text-emerald-400">{wmConfig.text}</span>  <span className="text-slate-600">← ubah ini!</span></div>
              <div><span className="text-yellow-300">WATERMARK_POSITION</span> = <span className="text-emerald-400">{wmConfig.position}</span></div>
              <div><span className="text-yellow-300">WATERMARK_FONT_SIZE</span> = <span className="text-emerald-400">{wmConfig.fontSize}</span></div>
              <div><span className="text-yellow-300">WATERMARK_OPACITY</span> = <span className="text-emerald-400">{wmConfig.opacity}</span></div>
            </div>
            <div className="text-xs text-slate-500 mt-2">💡 Telegram: <code className="text-blue-300">/watermark</code></div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════
            ZOOM EFFECT SECTION
        ══════════════════════════════════════════════════════════ */}
        <section className="bg-slate-900/60 border border-slate-700/50 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">🔍 Zoom Effect</h2>
              <p className="text-slate-400 text-sm">Auto zoom pada momen dengan viral score tinggi.</p>
            </div>
            <div className="text-right">
              <span className={`text-xs px-2 py-1 rounded-full border ${zoomCfg.enabled ? "bg-green-500/20 border-green-500/40 text-green-400" : "bg-red-500/20 border-red-500/40 text-red-400"}`}>
                {zoomCfg.enabled ? "✅ Aktif" : "❌ Nonaktif"}
              </span>
              <div className="text-xs text-slate-500 mt-1">mode: {zoomCfg.mode} | score≥{zoomCfg.minScore}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(Object.entries(zoomTypeDescriptions) as [ZoomEffectType, typeof zoomTypeDescriptions[ZoomEffectType]][]).map(([type, info]) => (
              <div
                key={type}
                className={`rounded-xl p-3 text-center text-xs border ${
                  zoomCfg.type === type
                    ? "bg-purple-500/20 border-purple-500/50 text-purple-300"
                    : "bg-slate-800 border-slate-700 text-slate-400"
                }`}
              >
                {zoomCfg.type === type && <div className="text-[9px] text-purple-400 mb-1">● AKTIF</div>}
                {info.recommended && <div className="text-[9px] text-yellow-400 mb-1">⭐</div>}
                <div className="text-lg">{info.icon}</div>
                <div className="font-medium mt-1">{info.label}</div>
                <div className="text-[9px] opacity-60 mt-0.5">{info.desc}</div>
              </div>
            ))}
          </div>

          <div className="bg-slate-800/60 rounded-xl p-4">
            <div className="font-mono text-xs space-y-1 text-slate-400">
              <div><span className="text-yellow-300">ZOOM_EFFECT_ENABLED</span> = <span className="text-emerald-400">{String(zoomCfg.enabled)}</span></div>
              <div><span className="text-yellow-300">ZOOM_EFFECT_MODE</span> = <span className="text-emerald-400">{zoomCfg.mode}</span></div>
              <div><span className="text-yellow-300">ZOOM_EFFECT_TYPE</span> = <span className="text-emerald-400">{zoomCfg.type}</span></div>
              <div><span className="text-yellow-300">ZOOM_EFFECT_INTENSITY</span> = <span className="text-emerald-400">{zoomCfg.intensity}×</span></div>
              <div><span className="text-yellow-300">ZOOM_EFFECT_MIN_SCORE</span> = <span className="text-emerald-400">{zoomCfg.minScore}/10</span></div>
            </div>
            <div className="text-xs text-slate-500 mt-2">💡 Telegram: <code className="text-blue-300">/zoom</code></div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════
            INTRO / OUTRO SECTION
        ══════════════════════════════════════════════════════════ */}
        <section className="bg-slate-900/60 border border-slate-700/50 rounded-2xl p-6 space-y-4">
          <h2 className="text-lg font-bold text-white">🎬 Intro / Outro Otomatis</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              {
                label: "🎬 INTRO",
                enabled: ioCfg.introEnabled,
                videoPath: ioCfg.introVideoPath,
                duration: ioCfg.introDuration,
                text: ioCfg.introText,
                color: ioCfg.introColor,
                vars: [
                  `INTRO_ENABLED = ${ioCfg.introEnabled}`,
                  `INTRO_TEXT = ${ioCfg.introText}`,
                  `INTRO_DURATION = ${ioCfg.introDuration}`,
                ],
              },
              {
                label: "🎭 OUTRO",
                enabled: ioCfg.outroEnabled,
                videoPath: ioCfg.outroVideoPath,
                duration: ioCfg.outroDuration,
                text: ioCfg.outroText,
                color: ioCfg.outroColor,
                vars: [
                  `OUTRO_ENABLED = ${ioCfg.outroEnabled}`,
                  `OUTRO_TEXT = ${ioCfg.outroText}`,
                  `OUTRO_DURATION = ${ioCfg.outroDuration}`,
                ],
              },
            ].map((item) => (
              <div key={item.label} className="bg-slate-800/60 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm">{item.label}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${item.enabled ? "bg-green-500/20 border-green-500/40 text-green-400" : "bg-red-500/20 border-red-500/40 text-red-400"}`}>
                    {item.enabled ? "✅ Aktif" : "❌ Nonaktif"}
                  </span>
                </div>
                <div className="text-xs text-slate-400 space-y-0.5">
                  <div>Mode: {item.videoPath ? "📁 File Custom" : "✨ Auto-generate"}</div>
                  <div>Durasi: {item.duration}s</div>
                  <div>Teks: {item.text}</div>
                </div>
                <div className="font-mono text-xs text-slate-500">
                  {item.vars.map((v, i) => <div key={i}>{v}</div>)}
                </div>
              </div>
            ))}
          </div>

          <div className="text-xs text-slate-500">💡 Telegram: <code className="text-blue-300">/introoutro</code></div>
        </section>

        {/* ══════════════════════════════════════════════════════════
            THUMBNAIL SECTION
        ══════════════════════════════════════════════════════════ */}
        <section className="bg-slate-900/60 border border-slate-700/50 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">🖼 Thumbnail Auto-Generate</h2>
              <p className="text-slate-400 text-sm">Generate thumbnail dari setiap klip via FFmpeg.</p>
            </div>
            <div className="text-right">
              <span className={`text-xs px-2 py-1 rounded-full border ${thumbConfig.enabled ? "bg-green-500/20 border-green-500/40 text-green-400" : "bg-red-500/20 border-red-500/40 text-red-400"}`}>
                {thumbConfig.enabled ? "✅ Aktif" : "❌ Nonaktif"}
              </span>
              <div className="text-xs text-slate-500 mt-1">{thumbConfig.mode}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(Object.entries(thumbnailModeDescriptions) as [ThumbnailMode, typeof thumbnailModeDescriptions[ThumbnailMode]][]).map(([mode, info]) => (
              <div
                key={mode}
                className={`rounded-xl p-3 text-center text-xs border ${
                  thumbConfig.mode === mode
                    ? "bg-yellow-500/20 border-yellow-500/50 text-yellow-300"
                    : "bg-slate-800 border-slate-700 text-slate-400"
                }`}
              >
                {thumbConfig.mode === mode && <div className="text-[9px] text-yellow-400 mb-1">● AKTIF</div>}
                <div className="text-lg">{info.icon}</div>
                <div className="font-medium mt-1">{info.label}</div>
                <div className="text-[9px] opacity-60 mt-0.5">{info.desc}</div>
              </div>
            ))}
          </div>

          <div className="font-mono text-xs text-slate-400 bg-slate-800/60 rounded-xl p-3 space-y-1">
            <div><span className="text-yellow-300">THUMBNAIL_ENABLED</span> = <span className="text-emerald-400">{String(thumbConfig.enabled)}</span></div>
            <div><span className="text-yellow-300">THUMBNAIL_MODE</span> = <span className="text-emerald-400">{thumbConfig.mode}</span></div>
            <div><span className="text-yellow-300">THUMBNAIL_QUALITY</span> = <span className="text-emerald-400">{thumbConfig.quality}</span> <span className="text-slate-600">(1=best, 31=worst)</span></div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════
            ASPECT RATIO SECTION
        ══════════════════════════════════════════════════════════ */}
        <section className="bg-slate-900/60 border border-slate-700/50 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">📐 Aspect Ratio 9:16</h2>
            <span className="text-sm font-mono bg-slate-800 px-3 py-1 rounded-lg text-slate-300">{currentMode}</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {(Object.entries(modeDescriptions) as [AspectRatioMode, typeof modeDescriptions[AspectRatioMode]][]).map(([mode, info]) => (
              <div
                key={mode}
                className={`rounded-xl p-3 text-center text-xs border ${
                  currentMode === mode
                    ? "bg-blue-500/20 border-blue-500/50 text-blue-300"
                    : "bg-slate-800 border-slate-700 text-slate-400"
                }`}
              >
                {currentMode === mode && <div className="text-[9px] text-blue-400 mb-1">● AKTIF</div>}
                {info.recommended && <div className="text-[9px] text-yellow-400 mb-1">⭐</div>}
                <div className="text-lg">{info.icon}</div>
                <div className="font-medium mt-1">{info.label}</div>
                <div className="text-[9px] opacity-60 mt-0.5">{mode}</div>
              </div>
            ))}
          </div>

          <div className="font-mono text-xs text-slate-400 bg-slate-800/60 rounded-xl p-3">
            <span className="text-yellow-300">ASPECT_RATIO_MODE</span> = <span className="text-emerald-400">blur</span>  <span className="text-slate-600">← 🌀 REKOMENDASI</span>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════
            PIPELINE FLOW
        ══════════════════════════════════════════════════════════ */}
        <section className="bg-slate-900/60 border border-slate-700/50 rounded-2xl p-6">
          <h2 className="text-lg font-bold text-white mb-4">🔄 Alur Proses Lengkap</h2>
          <div className="flex flex-wrap items-center gap-1 text-xs">
            {[
              { step: "1", icon: "⬇️", title: "Download",   desc: "yt-dlp" },
              { arrow: true },
              { step: "2", icon: "🎙️", title: "Transkripsi",desc: "Whisper" },
              { arrow: true },
              { step: "3", icon: "🧠", title: "AI Analisis", desc: "GPT/Gemini" },
              { arrow: true },
              { step: "4", icon: "✂️", title: `AutoClip ×${maxClips}`, desc: "AI picks moments" },
              { arrow: true },
              { step: "5", icon: "📐", title: "Cut 9:16",   desc: `FFmpeg (${currentMode})` },
            ].map((item, i) =>
              "arrow" in item ? (
                <span key={i} className="text-slate-600 text-base">→</span>
              ) : (
                <div key={i} className="bg-slate-800 rounded-lg p-2 text-center min-w-[60px]">
                  <div className="text-base">{item.icon}</div>
                  <div className="font-medium text-white">{item.title}</div>
                  <div className="text-slate-500">{item.desc}</div>
                </div>
              )
            )}
          </div>
          <div className="text-slate-600 text-xs my-1 ml-1">↓ (lanjut)</div>
          <div className="flex flex-wrap items-center gap-1 text-xs">
            {[
              { step: "6", icon: "🔍", title: "Zoom Effect", desc: `${zoomCfg.enabled ? zoomCfg.type : "skip"}` },
              { arrow: true },
              { step: "7", icon: "💧", title: "Watermark",  desc: `${wmConfig.enabled ? wmConfig.text : "skip"}` },
              { arrow: true },
              { step: "8", icon: "🎬", title: "Intro/Outro",desc: `${ioCfg.introEnabled || ioCfg.outroEnabled ? "aktif" : "skip"}` },
              { arrow: true },
              { step: "9", icon: "🖼", title: "Thumbnail",  desc: `${thumbConfig.enabled ? thumbConfig.mode : "skip"}` },
              { arrow: true },
              { step: "10", icon: "📤", title: "Upload YT", desc: "Draft" },
              { arrow: true },
              { step: "11", icon: "📱", title: "Kirim TG",  desc: "Telegram" },
            ].map((item, i) =>
              "arrow" in item ? (
                <span key={i} className="text-slate-600 text-base">→</span>
              ) : (
                <div key={i} className="bg-slate-800 rounded-lg p-2 text-center min-w-[60px]">
                  <div className="text-base">{item.icon}</div>
                  <div className="font-medium text-white">{item.title}</div>
                  <div className="text-slate-500">{item.desc}</div>
                </div>
              )
            )}
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════
            TELEGRAM COMMANDS
        ══════════════════════════════════════════════════════════ */}
        <section className="bg-slate-900/60 border border-slate-700/50 rounded-2xl p-6">
          <h2 className="text-lg font-bold text-white mb-4">🤖 Perintah Bot Telegram</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              { cmd: "/start",      desc: "Menu utama",                           isNew: false },
              { cmd: "/help",       desc: "Panduan lengkap",                       isNew: false },
              { cmd: "/connect",    desc: "Hubungkan YouTube Studio",              isNew: false },
              { cmd: "/settings",   desc: "Pengaturan bot (klip, privacy)",        isNew: false },
              { cmd: "/clips",      desc: "Info & cara ubah jumlah klip ← BARU!", isNew: true },
              { cmd: "/duration",   desc: "Info & cara ubah durasi klip (15/20/30/40/60s) ← BARU!", isNew: true },
              { cmd: "/status",     desc: "Status job terbaru",                    isNew: false },
              { cmd: "/history",    desc: "Riwayat semua job",                     isNew: false },
              { cmd: "/mode",       desc: "Info & ubah ASPECT_RATIO_MODE",         isNew: false },
              { cmd: "/thumbnail",  desc: "Info & ubah thumbnail config",          isNew: false },
              { cmd: "/watermark",  desc: "Info & ubah watermark config",          isNew: false },
              { cmd: "/zoom",       desc: "Info & ubah zoom effect config",        isNew: false },
              { cmd: "/introoutro", desc: "Info & ubah intro/outro config",        isNew: false },
              { cmd: "/disconnect", desc: "Putuskan koneksi YouTube",              isNew: false },
              { cmd: "/drive",       desc: "Google Drive: status, hubungkan, ganti akun",   isNew: true },
              { cmd: "/drivefolder", desc: "Ganti folder tujuan Drive (link / reset)",      isNew: true },
              { cmd: "/driveon",     desc: "Nyalakan auto-upload ke Google Drive",          isNew: true },
              { cmd: "/driveoff",    desc: "Matikan auto-upload ke Google Drive",           isNew: true },
              { cmd: "/drivedisconnect", desc: "Putuskan akun Google Drive",                isNew: true },
            ].map((item) => (
              <div key={item.cmd} className="flex items-start gap-2 bg-slate-800/60 rounded-lg px-3 py-2 text-sm">
                <code className={`font-mono font-bold shrink-0 ${item.isNew ? "text-emerald-400" : "text-blue-400"}`}>
                  {item.cmd}
                </code>
                <span className="text-slate-400 text-xs">{item.desc}</span>
                {item.isNew && (
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-1.5 rounded-full shrink-0">
                    ✨ Baru
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════
            ENV VARS REFERENCE
        ══════════════════════════════════════════════════════════ */}
        <section className="bg-slate-900/60 border border-slate-700/50 rounded-2xl p-6">
          <h2 className="text-lg font-bold text-white mb-4">📋 Environment Variables Lengkap</h2>
          <div className="font-mono text-xs space-y-1 bg-slate-950 rounded-xl p-4 overflow-x-auto">
            {[
              { section: "# === WAJIB ===" },
              { key: "TELEGRAM_BOT_TOKEN", desc: "Token dari @BotFather", req: true },
              { key: "DATABASE_URL",        desc: "PostgreSQL connection string", req: true },
              { section: "# === YOUTUBE UPLOAD ===" },
              { key: "GOOGLE_CLIENT_ID",     desc: "Google OAuth Client ID" },
              { key: "GOOGLE_CLIENT_SECRET", desc: "Google OAuth Client Secret" },
              { key: "GOOGLE_REDIRECT_URI",  desc: "https://yourapp.railway.app/api/youtube/callback" },
              { section: "# === ☁️ GOOGLE DRIVE AUTO-UPLOAD (semua opsional) ===" },
              { key: "GOOGLE_DRIVE_ENABLED",        desc: "true | false — saklar fitur Drive (default: true)", isNew: true },
              { key: "GOOGLE_DRIVE_FOLDER_ID",      desc: "ID / link folder tujuan default", isNew: true },
              { key: "GOOGLE_DRIVE_FOLDER_NAME",    desc: "nama folder otomatis (default: AutoClip Shorts)", isNew: true },
              { key: "GOOGLE_DRIVE_SUBFOLDER",      desc: "true = subfolder per video sumber (default: false)", isNew: true },
              { key: "GOOGLE_DRIVE_UPLOAD_THUMBNAIL", desc: "true | false (default: true)", isNew: true },
              { key: "GOOGLE_DRIVE_SHARE",          desc: "none | anyone — siapa saja yang punya link (default: none)", isNew: true },
              { key: "GOOGLE_DRIVE_SCOPE",          desc: "drive | drive.file (default: drive)", isNew: true },
              { key: "GOOGLE_DRIVE_REDIRECT_URI",   desc: "opsional, default = GOOGLE_REDIRECT_URI", isNew: true },
              { section: "# === AI / TRANSKRIPSI ===" },
              { key: "OPENAI_API_KEY",  desc: "GPT-4o + Whisper transcription" },
              { key: "GEMINI_API_KEY",  desc: "Google Gemini (alternatif OpenAI)" },
              { key: "GROQ_API_KEY",    desc: "Groq Whisper (gratis, cepat)" },
              { section: "# === ✂️ AUTOCLIP (DIPERBARUI!) ===" },
              { key: "MAX_CLIPS",       desc: "Jumlah klip per video — 1 s/d 10 (default: 5) ← BARU!", isNew: true },
              { key: "CLIP_DURATION",   desc: "Durasi klip tetap — 15 | 20 | 30 | 40 | 60 detik (default: 30) ← BARU!", isNew: true },
              { section: "# === ASPECT RATIO ===" },
              { key: "ASPECT_RATIO_MODE", desc: "blur | crop | pad | stretch | none (default: blur)" },
              { section: "# === THUMBNAIL ===" },
              { key: "THUMBNAIL_ENABLED", desc: "true | false (default: true)" },
              { key: "THUMBNAIL_MODE",    desc: "middle | best | start | custom (default: middle)" },
              { key: "THUMBNAIL_QUALITY", desc: "1-31 (default: 5)" },
              { key: "THUMBNAIL_WIDTH",   desc: "lebar (default: 1280)" },
              { key: "THUMBNAIL_HEIGHT",  desc: "tinggi (default: 720)" },
              { section: "# === 💧 WATERMARK ===" },
              { key: "WATERMARK_ENABLED",    desc: "true | false (default: true)" },
              { key: "WATERMARK_TEXT",       desc: "@NamaChannel ← UBAH INI!" },
              { key: "WATERMARK_POSITION",   desc: "bottomright | bottomleft | topright | topleft | center" },
              { key: "WATERMARK_FONT_SIZE",  desc: "ukuran font (default: 32)" },
              { key: "WATERMARK_COLOR",      desc: "white | yellow | #FF0000 (default: white)" },
              { key: "WATERMARK_OPACITY",    desc: "0.0-1.0 (default: 0.85)" },
              { key: "WATERMARK_BOX",        desc: "true | false — kotak background (default: true)" },
              { key: "WATERMARK_IMAGE_PATH", desc: "path ke file logo PNG (opsional)" },
              { section: "# === 🔍 ZOOM EFFECT ===" },
              { key: "ZOOM_EFFECT_ENABLED",   desc: "true | false (default: true)" },
              { key: "ZOOM_EFFECT_MODE",      desc: "auto | always | never (default: auto)" },
              { key: "ZOOM_EFFECT_TYPE",      desc: "in | out | in-out | pulse (default: in)" },
              { key: "ZOOM_EFFECT_INTENSITY", desc: "1.0-1.3 (default: 1.05 = subtle)" },
              { key: "ZOOM_EFFECT_MIN_SCORE", desc: "min viral score 1-10 untuk auto (default: 7)" },
              { section: "# === 🎬 INTRO/OUTRO ===" },
              { key: "INTRO_ENABLED",    desc: "true | false (default: false)" },
              { key: "INTRO_VIDEO_PATH", desc: "path file intro.mp4 (kosong = auto-generate)" },
              { key: "INTRO_TEXT",       desc: "teks intro otomatis (default: AutoClip Bot)" },
              { key: "OUTRO_ENABLED",    desc: "true | false (default: false)" },
              { key: "OUTRO_VIDEO_PATH", desc: "path file outro.mp4 (kosong = auto-generate)" },
              { key: "OUTRO_TEXT",       desc: "teks outro (default: Subscribe! 🔔)" },
              { section: "# === LAINNYA ===" },
              { key: "NEXT_PUBLIC_APP_URL", desc: "URL aplikasi Anda di Railway" },
              { key: "SETUP_SECRET",        desc: "Secret untuk endpoint /api/webhook/setup" },
            ].map((item, i) => {
              if ("section" in item) {
                return (
                  <div key={i} className="text-slate-500 pt-3 first:pt-0">
                    {item.section}
                  </div>
                );
              }
              return (
                <div key={i} className={`flex items-start gap-2 ${(item as {isNew?: boolean}).isNew ? "bg-emerald-500/10 rounded px-1" : ""}`}>
                  <span className={`shrink-0 text-[9px] px-1 rounded ${(item as {req?: boolean}).req ? "bg-red-500/30 text-red-400" : "bg-slate-700 text-slate-500"}`}>
                    {(item as {req?: boolean}).req ? "REQ" : "OPT"}
                  </span>
                  <span className="text-yellow-300 shrink-0">{(item as {key: string}).key}</span>
                  <span className="text-slate-500 break-all"># {(item as {desc: string}).desc}</span>
                  {(item as {isNew?: boolean}).isNew && (
                    <span className="text-emerald-400 shrink-0">← ✨</span>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════
            RECENT JOBS
        ══════════════════════════════════════════════════════════ */}
        {stats.recentJobs.length > 0 && (
          <section className="bg-slate-900/60 border border-slate-700/50 rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white mb-4">📊 Job Terbaru</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-500 text-xs border-b border-slate-800">
                    <th className="text-left py-2 pr-4">Video</th>
                    <th className="text-left py-2 pr-4">Platform</th>
                    <th className="text-left py-2 pr-4">Status</th>
                    <th className="text-left py-2 pr-4">Klip</th>
                    <th className="text-left py-2">Waktu</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {stats.recentJobs.map((job) => {
                    const status = statusConfig[job.status] || statusConfig.queued;
                    const platform = platformConfig[job.platform] || platformConfig.unknown;
                    const clips = (job.clips as ClipResult[] | null) || [];
                    return (
                      <tr key={job.id} className="text-slate-400">
                        <td className="py-2 pr-4">
                          <div className="text-white text-xs">{job.videoTitle || "Memproses..."}</div>
                          <div className="text-[10px] text-slate-600">{job.sourceUrl.slice(0, 40)}...</div>
                        </td>
                        <td className="py-2 pr-4 text-xs">{platform.emoji} {job.platform}</td>
                        <td className={`py-2 pr-4 text-xs ${status.color}`}>{status.label}</td>
                        <td className="py-2 pr-4 text-xs">
                          {clips.length > 0 ? (
                            <span>
                              {clips.length}
                              {clips.some((c) => c.youtubeUrl) && (
                                <span className="text-purple-400 ml-1">
                                  ({clips.filter((c) => c.youtubeUrl).length}📺)
                                </span>
                              )}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="py-2 text-xs text-slate-500">
                          {new Date(job.createdAt).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ══════════════════════════════════════════════════════════
            DOCKERFILE
        ══════════════════════════════════════════════════════════ */}
        <section className="bg-slate-900/60 border border-slate-700/50 rounded-2xl p-6">
          <h2 className="text-lg font-bold text-white mb-2">🐳 Dockerfile untuk Railway</h2>
          <p className="text-slate-400 text-sm mb-4">Include FFmpeg, Python, dan yt-dlp untuk semua fitur.</p>
          <pre className="font-mono text-xs bg-slate-950 rounded-xl p-4 overflow-x-auto text-slate-300 whitespace-pre">{`FROM node:20-alpine AS base
RUN apk add --no-cache ffmpeg python3 py3-pip curl ca-certificates
RUN pip3 install yt-dlp --break-system-packages || pip3 install yt-dlp

FROM base AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM base AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
RUN mkdir -p /tmp/autoclip
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \\
    CMD curl -f http://localhost:3000/api/health || exit 1
CMD ["node", "server.js"]`}</pre>
        </section>

        {/* Footer */}
        <footer className="text-center text-slate-600 text-sm py-4">
          AutoClip Bot — Made with ❤️ using Next.js, Grammy.js, FFmpeg & OpenAI
        </footer>
      </div>
    </main>
  );
}
