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
// 🎯 Custom Niche Prompt (BARU!) — import terpisah, tidak mengubah import di atas.
import { getDefaultNichePrompt, NICHE_PRESETS, MAX_NICHE_PROMPT_LENGTH } from "@/lib/niche-prompt";
import { isNull, not } from "drizzle-orm";
import { getDuplicateFilterConfig, getDuplicateFilterScopeLabel } from "@/lib/duplicate-filter-config";
import { getDuplicateFilterStats } from "@/lib/duplicate-filter";
// 📅 Scheduler / Queue Posting (BARU!) — import terpisah, tidak mengubah import di atas.
import { getSchedulerQueueStats } from "@/lib/scheduler";
import {
  getSchedulerTimezone,
  getSchedulerPollIntervalMs,
  isAiRecommendationEnabled,
  FALLBACK_NICHE_SLOTS,
  DEFAULT_SLOTS,
  formatSlotLabel,
} from "@/lib/scheduler-config";

export const dynamic = "force-dynamic";

// 🧹 Duplicate/Repetitive Clip Filter (BARU!) — statistik & konfigurasi ringan,
// terpisah dari getStats() yang sudah ada supaya tidak mengubah perilaku/bentuk
// data dashboard lama sama sekali.
async function getDupFilterData() {
  const config = getDuplicateFilterConfig();
  const stats = await getDuplicateFilterStats();
  return { config, stats };
}

// 🎯 Custom Niche Prompt (BARU!) — statistik ringan, terpisah dari getStats()
// yang sudah ada supaya tidak mengubah perilaku/bentuk data dashboard lama.
async function getNicheStats() {
  try {
    const rows = await db
      .select({ nichePrompt: userSettings.nichePrompt })
      .from(userSettings)
      .where(not(isNull(userSettings.nichePrompt)));
    return { usersWithNiche: rows.filter((r) => (r.nichePrompt || "").trim().length > 0).length };
  } catch {
    return { usersWithNiche: 0 };
  }
}

// 📅 Scheduler / Queue Posting (BARU!) — statistik ringan, terpisah dari
// getStats() yang sudah ada supaya tidak mengubah perilaku/bentuk data
// dashboard lama sama sekali.
async function getSchedulerData() {
  try {
    const stats = await getSchedulerQueueStats();
    return {
      stats,
      timezone: getSchedulerTimezone(),
      pollSeconds: Math.round(getSchedulerPollIntervalMs() / 1000),
      aiEnabled: isAiRecommendationEnabled(),
    };
  } catch {
    return {
      stats: { total: 0, byStatus: {}, recent: [] as Awaited<ReturnType<typeof getSchedulerQueueStats>>["recent"] },
      timezone: getSchedulerTimezone(),
      pollSeconds: Math.round(getSchedulerPollIntervalMs() / 1000),
      aiEnabled: isAiRecommendationEnabled(),
    };
  }
}

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
  // 🎯 Custom Niche Prompt (BARU!) — data terpisah, tidak mengubah variabel di atas.
  const nicheStats = await getNicheStats();
  // 🧹 Duplicate/Repetitive Clip Filter (BARU!) — data terpisah, tidak mengubah variabel di atas.
  const dupFilter = await getDupFilterData();
  const defaultNichePrompt = getDefaultNichePrompt();
  // 📅 Scheduler / Queue Posting (BARU!) — data terpisah, tidak mengubah variabel di atas.
  const scheduler = await getSchedulerData();

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
            🎯 CUSTOM NICHE PROMPT SECTION (FITUR BARU!)
            Tidak mengubah section lain — murni tambahan di dashboard.
        ══════════════════════════════════════════════════════════ */}
        <section className="bg-gradient-to-br from-fuchsia-500/10 to-indigo-500/10 border border-fuchsia-500/30 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">🎯 Custom Niche Prompt</h2>
                <span className="text-[10px] uppercase tracking-wide bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/40 px-2 py-0.5 rounded-full">
                  ✨ Fitur Baru!
                </span>
              </div>
              <p className="text-slate-400 text-sm mt-1 max-w-xl">
                User bisa mengatur prompt khusus untuk mengarahkan AI Analysis saat memilih momen viral —
                misal <span className="text-slate-300">&quot;fokus ke momen lucu&quot;</span> atau{" "}
                <span className="text-slate-300">&quot;fokus ke insight bisnis&quot;</span>.
              </p>
            </div>
            <div className="text-right">
              <span className={`text-xs px-2 py-1 rounded-full border ${defaultNichePrompt ? "bg-green-500/20 border-green-500/40 text-green-400" : "bg-slate-700/40 border-slate-600 text-slate-400"}`}>
                {defaultNichePrompt ? "✅ Default aktif" : "⚪ Belum ada default global"}
              </span>
              <div className="text-xs text-slate-500 mt-1">{nicheStats.usersWithNiche} user sudah atur niche sendiri</div>
            </div>
          </div>

          {/* Preset examples */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {NICHE_PRESETS.map((preset) => (
              <div
                key={preset.label}
                className="rounded-xl p-3 text-center text-xs border bg-slate-800 border-slate-700 text-slate-300"
              >
                <div className="text-lg">{preset.emoji}</div>
                <div className="font-medium mt-1">{preset.label}</div>
                <div className="text-[9px] opacity-60 mt-0.5 line-clamp-2">{preset.prompt}</div>
              </div>
            ))}
          </div>

          {/* Current config */}
          <div className="bg-slate-800/60 rounded-xl p-4">
            <div className="text-xs text-slate-500 mb-2">📋 Konfigurasi Aktif</div>
            <div className="font-mono text-xs space-y-1 text-slate-400">
              <div>
                <span className="text-yellow-300">DEFAULT_NICHE_PROMPT</span> ={" "}
                <span className="text-emerald-400">{defaultNichePrompt ? `"${defaultNichePrompt}"` : "(kosong)"}</span>
                {!defaultNichePrompt && <span className="text-slate-500"> (opsional)</span>}
              </div>
              <div>
                <span className="text-yellow-300">Batas panjang</span> ={" "}
                <span className="text-emerald-400">{MAX_NICHE_PROMPT_LENGTH} karakter</span>
              </div>
            </div>
          </div>

          {/* How to change */}
          <div className="bg-slate-800/60 rounded-xl p-4 space-y-2">
            <div className="text-xs text-slate-500">🔧 Cara Mengatur (mudah diganti kapan saja):</div>
            <div className="font-mono text-xs space-y-1 text-slate-400">
              <div><span className="text-blue-300">/niche fokus ke momen lucu</span>  <span className="text-slate-500">← set via Telegram</span></div>
              <div><span className="text-blue-300">/niche fokus ke insight bisnis</span></div>
              <div><span className="text-blue-300">/niche reset</span>  <span className="text-slate-500">← kembali ke default</span></div>
            </div>
            <div className="text-xs text-slate-500 space-y-1 pt-1">
              <div>💡 Telegram command: <code className="text-blue-300">/niche</code> untuk info + preset tombol cepat</div>
              <div>⚙️ Juga tersedia tombol &quot;🎯 Niche Prompt&quot; di menu <code className="text-blue-300">/settings</code></div>
              <div>🔌 API: <code className="text-blue-300">PATCH /api/settings</code> body <code className="text-blue-300">{"{ telegramUserId, nichePrompt }"}</code></div>
              <div>🌐 Default global (semua user baru): set <code className="text-blue-300">DEFAULT_NICHE_PROMPT</code> di Railway Variables — tidak perlu redeploy</div>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════
            🧹 DUPLICATE / REPETITIVE CLIP FILTER SECTION (BARU!)
            Fitur tambahan — tidak mengubah section/kartu lain di atas.
        ══════════════════════════════════════════════════════════ */}
        <section className="bg-gradient-to-br from-amber-500/10 to-rose-500/10 border border-amber-500/30 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">🧹 Duplicate/Repetitive Clip Filter</h2>
                <span className="text-[10px] uppercase tracking-wide bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-full">
                  ✨ Fitur Baru!
                </span>
              </div>
              <p className="text-slate-400 text-sm mt-1 max-w-xl">
                Mencegah AutoClip membuat klip dengan konten mirip/berulang ketika source video yang
                sama diproses berkali-kali — klip baru dibandingkan dengan sidik jari (judul,
                deskripsi, alasan AI, dan rentang waktu) klip-klip yang sudah pernah dibuat.
              </p>
            </div>
            <span className={`text-xs px-2 py-1 rounded-full border ${dupFilter.config.enabled ? "bg-green-500/20 border-green-500/40 text-green-400" : "bg-slate-700/40 border-slate-600 text-slate-400"}`}>
              {dupFilter.config.enabled ? "✅ Aktif" : "❌ Nonaktif"}
            </span>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-800/60 rounded-xl p-3 text-center">
              <div className="text-xl font-bold text-amber-400">{dupFilter.stats.totalSkipped}</div>
              <div className="text-[10px] text-slate-500 mt-1">Klip Disaring</div>
            </div>
            <div className="bg-slate-800/60 rounded-xl p-3 text-center">
              <div className="text-xl font-bold text-emerald-400">{dupFilter.stats.totalFingerprints}</div>
              <div className="text-[10px] text-slate-500 mt-1">Sidik Jari Klip</div>
            </div>
            <div className="bg-slate-800/60 rounded-xl p-3 text-center">
              <div className="text-xl font-bold text-sky-400">{Math.round(dupFilter.config.textThreshold * 100)}%</div>
              <div className="text-[10px] text-slate-500 mt-1">Ambang Teks</div>
            </div>
            <div className="bg-slate-800/60 rounded-xl p-3 text-center">
              <div className="text-xl font-bold text-fuchsia-400">{Math.round(dupFilter.config.timeOverlapThreshold * 100)}%</div>
              <div className="text-[10px] text-slate-500 mt-1">Ambang Overlap Waktu</div>
            </div>
          </div>

          {/* Current config */}
          <div className="bg-slate-800/60 rounded-xl p-4">
            <div className="text-xs text-slate-500 mb-2">📋 Konfigurasi Aktif</div>
            <div className="font-mono text-xs space-y-1 text-slate-400">
              <div>
                <span className="text-yellow-300">DUPLICATE_FILTER_ENABLED</span> ={" "}
                <span className="text-emerald-400">{String(dupFilter.config.enabled)}</span>
              </div>
              <div>
                <span className="text-yellow-300">DUPLICATE_FILTER_SCOPE</span> ={" "}
                <span className="text-emerald-400">{dupFilter.config.scope}</span>{" "}
                <span className="text-slate-500">({getDuplicateFilterScopeLabel(dupFilter.config.scope)})</span>
              </div>
              <div>
                <span className="text-yellow-300">DUPLICATE_FILTER_LOOKBACK_DAYS</span> ={" "}
                <span className="text-emerald-400">{dupFilter.config.lookbackDays === 0 ? "tanpa batas" : dupFilter.config.lookbackDays}</span>
              </div>
            </div>
          </div>

          {/* How to change */}
          <div className="bg-slate-800/60 rounded-xl p-4 space-y-2">
            <div className="text-xs text-slate-500">🔧 Cara Ubah (Railway Variables — mudah diganti, tanpa redeploy):</div>
            <div className="font-mono text-xs space-y-1 text-slate-400">
              <div><span className="text-blue-300">DUPLICATE_FILTER_ENABLED</span> = <span className="text-slate-500">true | false (default: true)</span></div>
              <div><span className="text-blue-300">DUPLICATE_FILTER_SCOPE</span> = <span className="text-slate-500">source | user | global (default: source)</span></div>
              <div><span className="text-blue-300">DUPLICATE_FILTER_TEXT_THRESHOLD</span> = <span className="text-slate-500">0.0 - 1.0 (default: 0.72)</span></div>
              <div><span className="text-blue-300">DUPLICATE_FILTER_TIME_OVERLAP_THRESHOLD</span> = <span className="text-slate-500">0.0 - 1.0 (default: 0.6)</span></div>
              <div><span className="text-blue-300">DUPLICATE_FILTER_LOOKBACK_DAYS</span> = <span className="text-slate-500">jumlah hari, 0 = tanpa batas (default: 30)</span></div>
            </div>
            <div className="text-xs text-slate-500 space-y-1 pt-1">
              <div>🤖 Telegram command: <code className="text-blue-300">/dupfilter</code> untuk melihat status & statistik</div>
              <div>🧠 Logika filter: <code className="text-blue-300">src/lib/duplicate-filter.ts</code> — kemiripan teks (Jaccard shingling) + overlap rentang waktu</div>
              <div>⚙️ Konfigurasi: <code className="text-blue-300">src/lib/duplicate-filter-config.ts</code> — semua ambang batas di satu tempat, mudah diubah</div>
            </div>
          </div>

          {dupFilter.stats.recentSkips.length > 0 && (
            <div className="bg-slate-800/60 rounded-xl p-4">
              <div className="text-xs text-slate-500 mb-2">🧾 Klip Duplikat Terbaru yang Disaring</div>
              <div className="space-y-2">
                {dupFilter.stats.recentSkips.map((skip) => (
                  <div key={skip.id} className="text-xs border border-slate-700/60 rounded-lg p-2">
                    <div className="text-slate-300 truncate">{skip.candidateTitle}</div>
                    {skip.matchedTitle && (
                      <div className="text-slate-500 truncate">↳ mirip dengan: {skip.matchedTitle}</div>
                    )}
                    <div className="flex items-center justify-between mt-1 text-[10px] text-slate-500">
                      <span className="truncate max-w-[70%]">{skip.sourceUrl}</span>
                      {skip.combinedScore !== null && (
                        <span className="text-amber-400">{skip.combinedScore}% mirip</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
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
              { step: "3b", icon: "🧹", title: "Dedup Filter", desc: dupFilter.config.enabled ? dupFilter.config.scope : "nonaktif" },
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
              { cmd: "/niche",      desc: "Atur Custom Niche Prompt untuk AI Analysis ← BARU!", isNew: true },
              { cmd: "/dupfilter",  desc: "Info Duplicate/Repetitive Clip Filter ← BARU!", isNew: true },
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
              { section: "# === 🎯 CUSTOM NICHE PROMPT (BARU!) ===" },
              { key: "DEFAULT_NICHE_PROMPT", desc: "Default niche untuk user baru, mis. 'fokus ke insight bisnis' (opsional) ← BARU!", isNew: true },
              { section: "# === 🧹 DUPLICATE/REPETITIVE CLIP FILTER (BARU!) ===" },
              { key: "DUPLICATE_FILTER_ENABLED", desc: "true | false — saklar utama fitur (default: true) ← BARU!", isNew: true },
              { key: "DUPLICATE_FILTER_SCOPE", desc: "source | user | global (default: source) ← BARU!", isNew: true },
              { key: "DUPLICATE_FILTER_TEXT_THRESHOLD", desc: "0.0-1.0 kemiripan teks judul/deskripsi (default: 0.72) ← BARU!", isNew: true },
              { key: "DUPLICATE_FILTER_TIME_OVERLAP_THRESHOLD", desc: "0.0-1.0 overlap rentang waktu (default: 0.6) ← BARU!", isNew: true },
              { key: "DUPLICATE_FILTER_LOOKBACK_DAYS", desc: "jumlah hari, 0 = tanpa batas (default: 30) ← BARU!", isNew: true },
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
            📅 SCHEDULER / QUEUE POSTING (FITUR BARU!)
        ══════════════════════════════════════════════════════════ */}
        <section className="bg-gradient-to-br from-indigo-500/10 to-fuchsia-600/10 border-2 border-indigo-500/40 rounded-2xl p-6 space-y-5">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-xl font-bold text-indigo-300 flex items-center gap-2">
                📅 Scheduler / Queue Posting
                <span className="text-xs bg-indigo-500/20 border border-indigo-500/40 text-indigo-200 px-2 py-0.5 rounded-full">
                  Fitur Baru!
                </span>
              </h2>
              <p className="text-slate-400 text-sm mt-1">
                Jadwalkan klip untuk diposting di jam-jam optimal — manual atau rekomendasi AI berdasarkan niche.
                Dikontrol lewat Telegram: <code className="text-indigo-300">/schedule</code>,{" "}
                <code className="text-indigo-300">/queue</code>,{" "}
                <code className="text-indigo-300">/besttime &lt;niche&gt;</code>.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-4xl font-black text-indigo-300">{scheduler.stats.total}</span>
              <span className="text-slate-400 text-sm">total<br/>antrean</span>
            </div>
          </div>

          {/* Queue status breakdown */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { key: "pending", label: "Menunggu", icon: "⏳", color: "text-yellow-300" },
              { key: "processing", label: "Diproses", icon: "🚀", color: "text-blue-300" },
              { key: "posted", label: "Terposting", icon: "✅", color: "text-green-300" },
              { key: "failed", label: "Gagal", icon: "❌", color: "text-red-300" },
              { key: "cancelled", label: "Dibatalkan", icon: "🚫", color: "text-slate-400" },
            ].map((s) => (
              <div key={s.key} className="bg-slate-900/60 border border-slate-700/50 rounded-xl p-3 text-center">
                <div className="text-xl">{s.icon}</div>
                <div className={`text-xl font-bold ${s.color}`}>{scheduler.stats.byStatus[s.key] || 0}</div>
                <div className="text-[11px] text-slate-500">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Worker config */}
          <div className="bg-slate-900/60 rounded-xl p-4 space-y-2">
            <div className="text-sm font-semibold text-slate-300 mb-2">⚙️ Konfigurasi Worker Aktif</div>
            <div className="grid sm:grid-cols-3 gap-3 text-sm font-mono">
              <div><span className="text-slate-500">ENV:</span> <span className="text-yellow-300">SCHEDULER_TIMEZONE</span> = <span className="text-indigo-300 font-bold">{scheduler.timezone}</span></div>
              <div><span className="text-slate-500">ENV:</span> <span className="text-yellow-300">SCHEDULER_POLL_INTERVAL_MS</span> = <span className="text-indigo-300 font-bold">{scheduler.pollSeconds}s</span></div>
              <div><span className="text-slate-500">ENV:</span> <span className="text-yellow-300">SCHEDULER_AI_RECOMMEND_ENABLED</span> = <span className="text-indigo-300 font-bold">{scheduler.aiEnabled ? "true" : "false"}</span></div>
            </div>
            <p className="text-xs text-slate-500 pt-1">
              Worker berjalan otomatis di background proses server (lihat <code>src/instrumentation.ts</code> →{" "}
              <code>src/lib/scheduler-worker.ts</code>), tanpa perlu Railway Cron tambahan. Endpoint{" "}
              <code>/api/schedule/run</code> tersedia sebagai pengaman manual/eksternal.
            </p>
          </div>

          {/* Upcoming queue preview */}
          {scheduler.stats.recent.length > 0 && (
            <div className="bg-slate-900/60 rounded-xl p-4">
              <div className="text-sm font-semibold text-slate-300 mb-3">🗂 Aktivitas Antrean Terbaru</div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-slate-500 text-xs border-b border-slate-800">
                      <th className="text-left py-2 pr-4">Klip</th>
                      <th className="text-left py-2 pr-4">Platform</th>
                      <th className="text-left py-2 pr-4">Jadwal</th>
                      <th className="text-left py-2 pr-4">Sumber</th>
                      <th className="text-left py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {scheduler.stats.recent.map((row) => (
                      <tr key={row.id} className="text-slate-400">
                        <td className="py-2 pr-4 text-xs text-white">{(row.title || "Klip").slice(0, 40)}</td>
                        <td className="py-2 pr-4 text-xs">{row.platform === "youtube" ? "📺" : "🎵"} {row.platform}</td>
                        <td className="py-2 pr-4 text-xs">
                          {new Date(row.scheduledAt).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })}
                        </td>
                        <td className="py-2 pr-4 text-xs">{row.source === "ai" ? "🧠 AI" : row.source}</td>
                        <td className="py-2 text-xs">
                          {row.status === "pending" && <span className="text-yellow-400">⏳ Menunggu</span>}
                          {row.status === "processing" && <span className="text-blue-400">🚀 Diproses</span>}
                          {row.status === "posted" && <span className="text-green-400">✅ Terposting</span>}
                          {row.status === "failed" && <span className="text-red-400">❌ Gagal</span>}
                          {row.status === "cancelled" && <span className="text-slate-500">🚫 Dibatalkan</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Niche optimal hours reference table — easy to edit */}
          <div className="bg-indigo-950/40 border border-indigo-500/20 rounded-xl p-4 space-y-3">
            <div className="text-sm font-semibold text-indigo-200">
              🧠 Tabel Jam Optimal per Niche (fallback kalau AI tidak tersedia)
            </div>
            <p className="text-xs text-slate-400">
              Mudah diubah di <code className="text-indigo-300">src/lib/scheduler-config.ts</code> → array{" "}
              <code className="text-indigo-300">FALLBACK_NICHE_SLOTS</code>. Kalau <code>OPENAI_API_KEY</code> tersedia,
              bot akan memakai rekomendasi AI secara dinamis terlebih dahulu.
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              {[...FALLBACK_NICHE_SLOTS.slice(0, 6), { keywords: [], label: "Umum (default)", slots: DEFAULT_SLOTS }].map((group) => (
                <div key={group.label} className="bg-slate-900/60 rounded-lg p-3">
                  <div className="text-xs font-semibold text-indigo-300 mb-1">{group.label}</div>
                  <ul className="space-y-0.5">
                    {group.slots.map((slot, i) => (
                      <li key={i} className="text-[11px] text-slate-400">• {formatSlotLabel(slot)}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          {/* How it works */}
          <div className="bg-indigo-950/40 border border-indigo-500/20 rounded-xl p-4 space-y-2">
            <div className="text-sm font-semibold text-indigo-200">🔧 Cara Pakai (Telegram)</div>
            <div className="font-mono text-xs bg-slate-900/80 rounded-lg p-3 space-y-1 text-slate-300">
              <div><span className="text-indigo-300">/schedule</span> → pilih video selesai → pilih klip → pilih jam (AI/manual)</div>
              <div><span className="text-indigo-300">/queue</span> → lihat & batalkan antrean kamu</div>
              <div><span className="text-indigo-300">/besttime bisnis</span> → cek rekomendasi jam untuk niche "bisnis"</div>
            </div>
          </div>
        </section>

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
