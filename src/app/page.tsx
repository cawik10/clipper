import { db } from "@/db";
import { clipJobs, userSettings } from "@/db/schema";
import { sql, desc } from "drizzle-orm";
import type { ClipResult } from "@/db/schema";
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
  type AspectRatioMode,
  type ThumbnailMode,
  type WatermarkPosition,
  type ZoomEffectType,
} from "@/lib/video-config";

export const dynamic = "force-dynamic";

// ─── Descriptions ───────────────────────────────────────────────────────────

const modeDescriptions: Record<
  AspectRatioMode,
  { icon: string; label: string; desc: string; recommended?: boolean }
> = {
  blur: { icon: "🌀", label: "Blur Background", desc: "Video asli di tengah, sisi kiri/kanan diisi background blur. Tidak ada bagian hitam, sangat cocok untuk Shorts!", recommended: true },
  crop: { icon: "✂️", label: "Center Crop", desc: "Dipotong dari tengah agar memenuhi frame 9:16. Subjek harus di tengah video.", recommended: false },
  pad: { icon: "⬛", label: "Black Bars", desc: "Video asli dipertahankan, sisanya hitam. Klasik letterbox.", recommended: false },
  stretch: { icon: "↔️", label: "Stretch to Fill", desc: "Dipaksa mengisi seluruh frame. Bisa distorsi pada video landscape.", recommended: false },
  none: { icon: "📐", label: "Original Ratio", desc: "Tidak diubah, pertahankan rasio asli.", recommended: false },
};

const thumbnailModeDescriptions: Record<
  ThumbnailMode,
  { icon: string; label: string; desc: string; recommended?: boolean }
> = {
  middle: { icon: "🎯", label: "Middle Frame", desc: "Ambil frame di tengah klip. Stabil dan representatif.", recommended: true },
  best: { icon: "⭐", label: "Best Frame", desc: "Scan banyak frame, pilih yang paling representatif. Lebih lambat, hasil lebih bagus.", recommended: false },
  start: { icon: "🚀", label: "Start Frame", desc: "Frame di awal klip. Cocok sebagai hook/opening.", recommended: false },
  custom: { icon: "🎛️", label: "Custom Offset", desc: "Ambil frame di detik ke-N (set THUMBNAIL_OFFSET_SECONDS).", recommended: false },
};

const watermarkPositionDescriptions: Record<
  WatermarkPosition,
  { icon: string; label: string; recommended?: boolean }
> = {
  bottomright: { icon: "↘️", label: "Kanan Bawah", recommended: true },
  bottomleft: { icon: "↙️", label: "Kiri Bawah" },
  topright: { icon: "↗️", label: "Kanan Atas" },
  topleft: { icon: "↖️", label: "Kiri Atas" },
  center: { icon: "⊕", label: "Tengah" },
};

const zoomTypeDescriptions: Record<
  ZoomEffectType,
  { icon: string; label: string; desc: string; recommended?: boolean }
> = {
  in: { icon: "🔍+", label: "Zoom In", desc: "Kamera mendekati subjek secara halus di awal klip.", recommended: true },
  out: { icon: "🔭", label: "Zoom Out", desc: "Kamera menjauh dari subjek. Memberi kesan reveal.", recommended: false },
  "in-out": { icon: "↔️", label: "In → Out", desc: "Zoom masuk lalu keluar. Dramatis untuk momen puncak.", recommended: false },
  pulse: { icon: "💓", label: "Pulse", desc: "Zoom naik-turun seperti denyut. Cocok untuk momen beat drop.", recommended: false },
};

// ─── Stats ───────────────────────────────────────────────────────────────────

async function getStats() {
  try {
    const [totalJobsRes, doneJobsRes, totalUsersRes, recentJobsRes] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(clipJobs),
      db.select({ count: sql<number>`count(*)::int` }).from(clipJobs).where(sql`status = 'done'`),
      db.select({ count: sql<number>`count(*)::int` }).from(userSettings),
      db.select().from(clipJobs).orderBy(desc(clipJobs.createdAt)).limit(8),
    ]);

    const allDone = await db
      .select({ clips: clipJobs.clips })
      .from(clipJobs)
      .where(sql`status = 'done' and clips is not null`);

    let totalClips = 0;
    let totalThumbnails = 0;
    for (const row of allDone) {
      const clips = (row.clips as ClipResult[] | null) || [];
      totalClips += clips.length;
      totalThumbnails += clips.filter((c) => c.thumbnailPath).length;
    }

    return {
      totalJobs: totalJobsRes[0]?.count ?? 0,
      doneJobs: doneJobsRes[0]?.count ?? 0,
      totalUsers: totalUsersRes[0]?.count ?? 0,
      totalClips,
      totalThumbnails,
      recentJobs: recentJobsRes,
    };
  } catch {
    return { totalJobs: 0, doneJobs: 0, totalUsers: 0, totalClips: 0, totalThumbnails: 0, recentJobs: [] };
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function HomePage() {
  const stats = await getStats();
  const currentMode = getAspectRatioMode();
  const currentModeLabel = getModeLabel(currentMode);
  const thumbConfig = getThumbnailConfig();
  const thumbModeLabel = getThumbnailModeLabel(thumbConfig.mode);
  const wmConfig = getWatermarkConfig();
  const ioCfg = getIntroOutroConfig();
  const zoomCfg = getZoomEffectConfig();

  const statusConfig: Record<string, { label: string; color: string }> = {
    queued: { label: "⏳ Antri", color: "bg-slate-700 text-slate-200" },
    downloading: { label: "⬇️ Download", color: "bg-blue-900/60 text-blue-200" },
    analyzing: { label: "🧠 Analisis", color: "bg-purple-900/60 text-purple-200" },
    clipping: { label: "✂️ Clipping", color: "bg-yellow-900/60 text-yellow-200" },
    uploading: { label: "📤 Upload", color: "bg-orange-900/60 text-orange-200" },
    done: { label: "✅ Selesai", color: "bg-green-900/60 text-green-200" },
    error: { label: "❌ Error", color: "bg-red-900/60 text-red-200" },
  };
  const platformConfig: Record<string, { emoji: string }> = {
    youtube: { emoji: "📺" }, facebook: { emoji: "📘" },
    tiktok: { emoji: "🎵" }, instagram: { emoji: "📸" }, unknown: { emoji: "🌐" },
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">

      {/* ── HERO ── */}
      <div className="relative overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-20"
          style={{ backgroundImage: "url(/images/hero-bg.jpg)" }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/60 via-slate-950/40 to-slate-950" />
        <div className="relative max-w-6xl mx-auto px-4 py-20 text-center">
          <div className="inline-flex items-center gap-2 bg-purple-500/20 border border-purple-500/30 rounded-full px-4 py-1.5 text-purple-300 text-sm mb-6">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            Bot Aktif — Deploy di Railway
          </div>
          <h1 className="text-5xl md:text-6xl font-black mb-4 bg-gradient-to-r from-white via-purple-200 to-purple-400 bg-clip-text text-transparent">
            🤖 AutoClip Bot
          </h1>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-8">
            AI YouTube Shorts Generator — Potong video viral otomatis + Watermark + Intro/Outro + Zoom Effect
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {[
              { icon: "💧", label: `Watermark: ${wmConfig.enabled ? wmConfig.text : "Nonaktif"}`, color: "bg-cyan-500/20 border-cyan-500/30 text-cyan-300" },
              { icon: "🔍", label: `Zoom: ${zoomCfg.enabled ? `${zoomCfg.mode} (${zoomCfg.type})` : "Nonaktif"}`, color: "bg-yellow-500/20 border-yellow-500/30 text-yellow-300" },
              { icon: "🎬", label: `Intro: ${ioCfg.introEnabled ? "✅" : "❌"} | Outro: ${ioCfg.outroEnabled ? "✅" : "❌"}`, color: "bg-pink-500/20 border-pink-500/30 text-pink-300" },
              { icon: "🖼", label: `Thumbnail: ${thumbConfig.enabled ? thumbConfig.mode : "Off"}`, color: "bg-orange-500/20 border-orange-500/30 text-orange-300" },
              { icon: "📐", label: `Mode: ${currentMode}`, color: "bg-purple-500/20 border-purple-500/30 text-purple-300" },
            ].map((b) => (
              <span key={b.label} className={`flex items-center gap-1.5 border rounded-full px-3 py-1 text-sm font-medium ${b.color}`}>
                {b.icon} {b.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 pb-20 space-y-8">

        {/* ── Stats ── */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: "Total Jobs", value: stats.totalJobs, icon: "🎬", color: "from-blue-500/20 to-blue-600/20 border-blue-500/30" },
            { label: "Selesai", value: stats.doneJobs, icon: "✅", color: "from-green-500/20 to-green-600/20 border-green-500/30" },
            { label: "Pengguna", value: stats.totalUsers, icon: "👥", color: "from-purple-500/20 to-purple-600/20 border-purple-500/30" },
            { label: "Klip Dibuat", value: stats.totalClips, icon: "✂️", color: "from-orange-500/20 to-orange-600/20 border-orange-500/30" },
            { label: "Thumbnail", value: stats.totalThumbnails, icon: "🖼", color: "from-pink-500/20 to-pink-600/20 border-pink-500/30" },
          ].map((stat) => (
            <div key={stat.label} className={`bg-gradient-to-br ${stat.color} border rounded-2xl p-5 text-center`}>
              <div className="text-3xl mb-1">{stat.icon}</div>
              <div className="text-3xl font-bold">{stat.value}</div>
              <div className="text-xs text-slate-400 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* ══════════════════════════════════════════════════════════
            WATERMARK SECTION (NEW)
        ══════════════════════════════════════════════════════════ */}
        <section className="bg-slate-900 border border-cyan-500/20 rounded-3xl p-6 space-y-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">💧 Watermark Custom</h2>
              <p className="text-slate-400 text-sm mt-1">Tambahkan watermark teks/logo ke setiap klip secara otomatis via FFmpeg drawtext/overlay.</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${wmConfig.enabled ? "bg-green-500/20 text-green-300" : "bg-red-500/20 text-red-300"}`}>
                {wmConfig.enabled ? "✅ Aktif" : "❌ Nonaktif"}
              </span>
              <span className="text-xs text-slate-500">teks: {wmConfig.text}</span>
            </div>
          </div>

          {/* Position Cards */}
          <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
            {(Object.entries(watermarkPositionDescriptions) as [WatermarkPosition, typeof watermarkPositionDescriptions[WatermarkPosition]][]).map(([pos, info]) => (
              <div key={pos} className={`relative rounded-xl border p-3 text-center transition-all ${wmConfig.position === pos ? "border-cyan-400 bg-cyan-500/10" : "border-slate-700 bg-slate-800/50"}`}>
                {wmConfig.position === pos && <div className="absolute top-1 right-1 text-xs font-bold text-cyan-400">● AKTIF</div>}
                {info.recommended && <div className="absolute top-1 left-1 text-xs text-yellow-400">⭐</div>}
                <div className="text-2xl mb-1">{info.icon}</div>
                <div className="text-xs text-slate-300">{info.label}</div>
                <code className="text-xs text-slate-500">{pos}</code>
              </div>
            ))}
          </div>

          {/* Current Config */}
          <div className="bg-slate-800/50 rounded-xl p-4 space-y-2 text-sm font-mono">
            <div className="text-slate-400 text-xs mb-3 font-sans font-semibold">📋 Konfigurasi Aktif</div>
            {[
              { key: "WATERMARK_ENABLED", value: String(wmConfig.enabled) },
              { key: "WATERMARK_TEXT", value: wmConfig.text },
              { key: "WATERMARK_POSITION", value: wmConfig.position },
              { key: "WATERMARK_FONT_SIZE", value: String(wmConfig.fontSize) },
              { key: "WATERMARK_COLOR", value: wmConfig.color },
              { key: "WATERMARK_OPACITY", value: String(wmConfig.opacity) },
              { key: "WATERMARK_BOX", value: String(wmConfig.box) },
              { key: "WATERMARK_IMAGE_PATH", value: wmConfig.imagePath || "(tidak diset)" },
            ].map((item) => (
              <div key={item.key} className="flex items-center gap-2 flex-wrap">
                <span className="text-cyan-400">{item.key}</span>
                <span className="text-slate-500">=</span>
                <span className="text-green-400">{item.value}</span>
              </div>
            ))}
          </div>

          {/* How to Change */}
          <div className="bg-slate-800/30 rounded-xl p-4 text-sm text-slate-300 space-y-2">
            <div className="font-semibold text-slate-200 mb-2">🔧 Cara Ubah di Railway Variables:</div>
            <div className="font-mono text-xs space-y-1 text-slate-400">
              <div><span className="text-cyan-400">WATERMARK_ENABLED</span> = <span className="text-green-400">true</span>  ← aktifkan watermark</div>
              <div><span className="text-cyan-400">WATERMARK_TEXT</span> = <span className="text-green-400">@NamaChannelku</span>  ← isi teks Anda</div>
              <div><span className="text-cyan-400">WATERMARK_POSITION</span> = <span className="text-green-400">bottomright</span>  ← posisi</div>
              <div><span className="text-cyan-400">WATERMARK_FONT_SIZE</span> = <span className="text-green-400">36</span>  ← ukuran font</div>
              <div><span className="text-cyan-400">WATERMARK_COLOR</span> = <span className="text-green-400">white</span>  ← warna teks</div>
              <div><span className="text-cyan-400">WATERMARK_OPACITY</span> = <span className="text-green-400">0.85</span>  ← transparansi</div>
              <div><span className="text-cyan-400">WATERMARK_IMAGE_PATH</span> = <span className="text-green-400">/app/logo.png</span>  ← (opsional, pakai gambar)</div>
            </div>
            <div className="text-xs text-slate-500 mt-2">💡 Telegram command: /watermark untuk info lengkap</div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════
            ZOOM EFFECT SECTION (NEW)
        ══════════════════════════════════════════════════════════ */}
        <section className="bg-slate-900 border border-yellow-500/20 rounded-3xl p-6 space-y-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">🔍 Zoom Effect pada Highlight Moment</h2>
              <p className="text-slate-400 text-sm mt-1">
                Efek zoom otomatis diterapkan pada klip dengan viral score tinggi. Menggunakan FFmpeg zoompan filter untuk animasi smooth.
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${zoomCfg.enabled ? "bg-green-500/20 text-green-300" : "bg-red-500/20 text-red-300"}`}>
                {zoomCfg.enabled ? "✅ Aktif" : "❌ Nonaktif"}
              </span>
              <span className="text-xs text-slate-500">mode: {zoomCfg.mode} | score≥{zoomCfg.minScore}</span>
            </div>
          </div>

          {/* Zoom Type Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(Object.entries(zoomTypeDescriptions) as [ZoomEffectType, typeof zoomTypeDescriptions[ZoomEffectType]][]).map(([type, info]) => (
              <div key={type} className={`relative rounded-xl border p-4 transition-all ${zoomCfg.type === type ? "border-yellow-400 bg-yellow-500/10" : "border-slate-700 bg-slate-800/50"}`}>
                {zoomCfg.type === type && <div className="absolute top-1 right-1 text-xs font-bold text-yellow-400">● AKTIF</div>}
                {info.recommended && <div className="absolute top-1 left-1 text-xs text-yellow-400">⭐</div>}
                <div className="text-2xl mb-2">{info.icon}</div>
                <div className="font-semibold text-sm text-slate-200">{info.label}</div>
                <code className="text-xs text-slate-500 block mt-0.5">{type}</code>
                <p className="text-xs text-slate-400 mt-2">{info.desc}</p>
              </div>
            ))}
          </div>

          {/* Config Summary */}
          <div className="bg-slate-800/50 rounded-xl p-4 font-mono text-sm space-y-2">
            <div className="text-slate-400 text-xs mb-3 font-sans font-semibold">📋 Konfigurasi Aktif</div>
            {[
              { key: "ZOOM_EFFECT_ENABLED", value: String(zoomCfg.enabled) },
              { key: "ZOOM_EFFECT_MODE", value: zoomCfg.mode },
              { key: "ZOOM_EFFECT_TYPE", value: zoomCfg.type },
              { key: "ZOOM_EFFECT_INTENSITY", value: `${zoomCfg.intensity}× (${zoomCfg.intensity <= 1.05 ? "subtle" : zoomCfg.intensity <= 1.15 ? "medium" : "strong"})` },
              { key: "ZOOM_EFFECT_DURATION", value: `${zoomCfg.duration}s` },
              { key: "ZOOM_EFFECT_MIN_SCORE", value: `${zoomCfg.minScore}/10 (mode auto)` },
            ].map((item) => (
              <div key={item.key} className="flex items-center gap-2 flex-wrap">
                <span className="text-yellow-400">{item.key}</span>
                <span className="text-slate-500">=</span>
                <span className="text-green-400">{item.value}</span>
              </div>
            ))}
          </div>

          <div className="bg-slate-800/30 rounded-xl p-4 text-sm text-slate-300 space-y-2">
            <div className="font-semibold text-slate-200 mb-2">🔧 Cara Ubah di Railway Variables:</div>
            <div className="font-mono text-xs space-y-1 text-slate-400">
              <div><span className="text-yellow-400">ZOOM_EFFECT_ENABLED</span> = <span className="text-green-400">true</span></div>
              <div><span className="text-yellow-400">ZOOM_EFFECT_MODE</span> = <span className="text-green-400">auto</span>  ← auto(score based) | always | never</div>
              <div><span className="text-yellow-400">ZOOM_EFFECT_TYPE</span> = <span className="text-green-400">in</span>  ← in | out | in-out | pulse</div>
              <div><span className="text-yellow-400">ZOOM_EFFECT_INTENSITY</span> = <span className="text-green-400">1.05</span>  ← 1.0(none) → 1.3(strong)</div>
              <div><span className="text-yellow-400">ZOOM_EFFECT_MIN_SCORE</span> = <span className="text-green-400">7</span>  ← min viral score untuk auto</div>
            </div>
            <div className="text-xs text-slate-500 mt-2">💡 Telegram command: /zoom untuk info lengkap</div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════
            INTRO / OUTRO SECTION (NEW)
        ══════════════════════════════════════════════════════════ */}
        <section className="bg-slate-900 border border-pink-500/20 rounded-3xl p-6 space-y-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">🎬 Intro / Outro Otomatis</h2>
              <p className="text-slate-400 text-sm mt-1">
                Tambahkan intro dan outro ke setiap klip. Bisa gunakan file video kustom atau generate otomatis via FFmpeg lavfi (teks + fade).
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {/* Intro */}
            <div className={`rounded-xl border p-5 ${ioCfg.introEnabled ? "border-pink-500/40 bg-pink-500/5" : "border-slate-700 bg-slate-800/30"}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="font-bold text-lg">🎬 INTRO</div>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${ioCfg.introEnabled ? "bg-green-500/20 text-green-300" : "bg-red-500/20 text-red-300"}`}>
                  {ioCfg.introEnabled ? "✅ Aktif" : "❌ Nonaktif"}
                </span>
              </div>
              <div className="text-sm text-slate-400 space-y-1">
                <div>Mode: {ioCfg.introVideoPath ? "📁 File Custom" : "✨ Auto-generate"}</div>
                {ioCfg.introVideoPath && <div>File: <code className="text-xs text-slate-300">{ioCfg.introVideoPath}</code></div>}
                <div>Durasi: {ioCfg.introDuration}s</div>
                <div>Teks: <span className="text-slate-200">{ioCfg.introText}</span></div>
                <div>Warna BG: <span className="font-mono text-slate-200">{ioCfg.introColor}</span></div>
              </div>
              <div className="mt-3 font-mono text-xs text-slate-500 space-y-0.5 bg-slate-900/50 rounded-lg p-3">
                <div><span className="text-pink-400">INTRO_ENABLED</span> = <span className="text-green-400">{String(ioCfg.introEnabled)}</span></div>
                <div><span className="text-pink-400">INTRO_TEXT</span> = <span className="text-green-400">{ioCfg.introText}</span></div>
                <div><span className="text-pink-400">INTRO_DURATION</span> = <span className="text-green-400">{ioCfg.introDuration}</span></div>
                <div><span className="text-pink-400">INTRO_COLOR</span> = <span className="text-green-400">{ioCfg.introColor}</span></div>
                <div><span className="text-pink-400">INTRO_VIDEO_PATH</span> = <span className="text-green-400">{ioCfg.introVideoPath || "(auto-generate)"}</span></div>
              </div>
            </div>

            {/* Outro */}
            <div className={`rounded-xl border p-5 ${ioCfg.outroEnabled ? "border-pink-500/40 bg-pink-500/5" : "border-slate-700 bg-slate-800/30"}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="font-bold text-lg">🎭 OUTRO</div>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${ioCfg.outroEnabled ? "bg-green-500/20 text-green-300" : "bg-red-500/20 text-red-300"}`}>
                  {ioCfg.outroEnabled ? "✅ Aktif" : "❌ Nonaktif"}
                </span>
              </div>
              <div className="text-sm text-slate-400 space-y-1">
                <div>Mode: {ioCfg.outroVideoPath ? "📁 File Custom" : "✨ Auto-generate"}</div>
                {ioCfg.outroVideoPath && <div>File: <code className="text-xs text-slate-300">{ioCfg.outroVideoPath}</code></div>}
                <div>Durasi: {ioCfg.outroDuration}s</div>
                <div>Teks: <span className="text-slate-200">{ioCfg.outroText}</span></div>
                <div>Warna BG: <span className="font-mono text-slate-200">{ioCfg.outroColor}</span></div>
              </div>
              <div className="mt-3 font-mono text-xs text-slate-500 space-y-0.5 bg-slate-900/50 rounded-lg p-3">
                <div><span className="text-pink-400">OUTRO_ENABLED</span> = <span className="text-green-400">{String(ioCfg.outroEnabled)}</span></div>
                <div><span className="text-pink-400">OUTRO_TEXT</span> = <span className="text-green-400">{ioCfg.outroText}</span></div>
                <div><span className="text-pink-400">OUTRO_DURATION</span> = <span className="text-green-400">{ioCfg.outroDuration}</span></div>
                <div><span className="text-pink-400">OUTRO_COLOR</span> = <span className="text-green-400">{ioCfg.outroColor}</span></div>
                <div><span className="text-pink-400">OUTRO_VIDEO_PATH</span> = <span className="text-green-400">{ioCfg.outroVideoPath || "(auto-generate)"}</span></div>
              </div>
            </div>
          </div>

          <div className="bg-slate-800/30 rounded-xl p-4 text-sm">
            <div className="font-semibold text-slate-200 mb-2">💡 Tips Penggunaan:</div>
            <ul className="text-slate-400 text-sm space-y-1 list-disc list-inside">
              <li>Jika tidak ada file video, intro/outro di-generate otomatis dengan teks + fade effect</li>
              <li>File intro harus berformat MP4, resolusi minimal 1080×1920 (vertikal)</li>
              <li>Semua segmen dinormalisasi ke resolusi target sebelum digabungkan</li>
              <li>Telegram command: <code className="text-pink-400">/introoutro</code> untuk info lengkap</li>
            </ul>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════
            THUMBNAIL SECTION
        ══════════════════════════════════════════════════════════ */}
        <section className="bg-slate-900 border border-orange-500/20 rounded-3xl p-6 space-y-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">🖼 Thumbnail Auto-Generate</h2>
              <p className="text-slate-400 text-sm mt-1">Generate thumbnail otomatis dari setiap klip menggunakan FFmpeg.</p>
            </div>
            <div className="flex gap-2">
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${thumbConfig.enabled ? "bg-green-500/20 text-green-300" : "bg-red-500/20 text-red-300"}`}>
                {thumbConfig.enabled ? "✅ Aktif" : "❌ Nonaktif"}
              </span>
              <span className="text-xs px-2.5 py-1 rounded-full bg-slate-700 text-slate-300">{thumbConfig.mode}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(Object.entries(thumbnailModeDescriptions) as [ThumbnailMode, typeof thumbnailModeDescriptions[ThumbnailMode]][]).map(([mode, info]) => (
              <div key={mode} className={`relative rounded-xl border p-4 ${thumbConfig.mode === mode ? "border-orange-400 bg-orange-500/10" : "border-slate-700 bg-slate-800/50"}`}>
                {thumbConfig.mode === mode && <div className="absolute top-1 right-1 text-xs font-bold text-orange-400">● AKTIF</div>}
                {info.recommended && <div className="absolute top-1 left-1 text-xs text-yellow-400">⭐</div>}
                <div className="text-2xl mb-2">{info.icon}</div>
                <div className="font-semibold text-sm">{info.label}</div>
                <code className="text-xs text-slate-500 block mt-0.5">{mode}</code>
                <p className="text-xs text-slate-400 mt-2">{info.desc}</p>
              </div>
            ))}
          </div>

          <div className="bg-slate-800/30 rounded-xl p-4 font-mono text-xs text-slate-400 space-y-1">
            <div className="font-sans font-semibold text-slate-200 mb-2">🔧 Railway Variables:</div>
            <div><span className="text-orange-400">THUMBNAIL_ENABLED</span> = <span className="text-green-400">{String(thumbConfig.enabled)}</span></div>
            <div><span className="text-orange-400">THUMBNAIL_MODE</span> = <span className="text-green-400">{thumbConfig.mode}</span></div>
            <div><span className="text-orange-400">THUMBNAIL_QUALITY</span> = <span className="text-green-400">{thumbConfig.quality}</span> (1=best, 31=worst)</div>
            <div><span className="text-orange-400">THUMBNAIL_WIDTH</span> = <span className="text-green-400">{thumbConfig.width}</span></div>
            <div><span className="text-orange-400">THUMBNAIL_HEIGHT</span> = <span className="text-green-400">{thumbConfig.height === 0 ? "0 (auto)" : thumbConfig.height}</span></div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════
            ASPECT RATIO SECTION
        ══════════════════════════════════════════════════════════ */}
        <section className="bg-slate-900 border border-purple-500/20 rounded-3xl p-6 space-y-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">📐 Aspect Ratio 9:16</h2>
              <p className="text-slate-400 text-sm mt-1">Kontrol konversi video ke format vertikal 9:16 (1080×1920) untuk YouTube Shorts.</p>
            </div>
            <code className="text-sm bg-slate-800 px-3 py-1 rounded-full text-purple-300">{currentMode}</code>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {(Object.entries(modeDescriptions) as [AspectRatioMode, typeof modeDescriptions[AspectRatioMode]][]).map(([mode, info]) => (
              <div key={mode} className={`relative rounded-xl border p-4 ${currentMode === mode ? "border-purple-400 bg-purple-500/10" : "border-slate-700 bg-slate-800/50"}`}>
                {currentMode === mode && <div className="absolute top-1 right-1 text-xs font-bold text-purple-400">● AKTIF</div>}
                {info.recommended && <div className="absolute top-1 left-1 text-xs text-yellow-400">⭐</div>}
                <div className="text-2xl mb-2">{info.icon}</div>
                <div className="font-semibold text-sm">{info.label}</div>
                <code className="text-xs text-slate-500 block mt-0.5">{mode}</code>
                <p className="text-xs text-slate-400 mt-2">{info.desc}</p>
              </div>
            ))}
          </div>

          <div className="bg-slate-800/30 rounded-xl p-4 font-mono text-xs text-slate-400">
            <span className="text-purple-400">ASPECT_RATIO_MODE</span> = <span className="text-green-400">blur</span>  ← 🌀 REKOMENDASI
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════
            PIPELINE FLOW
        ══════════════════════════════════════════════════════════ */}
        <section className="bg-slate-900 border border-slate-700 rounded-3xl p-6">
          <h2 className="text-2xl font-bold mb-6">🔄 Alur Proses Lengkap</h2>
          <div className="grid grid-cols-2 md:grid-cols-9 gap-2 items-center">
            {[
              { step: "1", icon: "⬇️", title: "Download", desc: "yt-dlp" },
              { icon: "→", title: "" },
              { step: "2", icon: "🎙️", title: "Transkripsi", desc: "Whisper" },
              { icon: "→", title: "" },
              { step: "3", icon: "🧠", title: "AI Analisis", desc: "GPT/Gemini" },
              { icon: "→", title: "" },
              { step: "4", icon: "✂️", title: "Cut 9:16", desc: `FFmpeg (${currentMode})` },
              { icon: "→", title: "" },
              { step: "5", icon: "🔍", title: "Zoom Effect", desc: `${zoomCfg.enabled ? zoomCfg.type : "skip"}` },
            ].map((item, i) =>
              item.icon === "→" ? (
                <div key={i} className="text-slate-600 text-center hidden md:block">→</div>
              ) : (
                <div key={i} className="bg-slate-800 rounded-xl p-3 text-center">
                  <div className="text-xl mb-1">{item.icon}</div>
                  <div className="text-xs font-bold text-slate-300">{item.title}</div>
                  <div className="text-xs text-slate-500">{item.desc}</div>
                </div>
              )
            )}
          </div>
          <div className="flex items-center gap-2 mt-2 text-slate-600 text-sm justify-center">↓ (lanjut)</div>
          <div className="grid grid-cols-2 md:grid-cols-9 gap-2 items-center mt-2">
            {[
              { step: "6", icon: "💧", title: "Watermark", desc: `${wmConfig.enabled ? wmConfig.text : "skip"}` },
              { icon: "→", title: "" },
              { step: "7", icon: "🎬", title: "Intro/Outro", desc: `${ioCfg.introEnabled || ioCfg.outroEnabled ? "aktif" : "skip"}` },
              { icon: "→", title: "" },
              { step: "8", icon: "🖼", title: "Thumbnail", desc: `${thumbConfig.enabled ? thumbConfig.mode : "skip"}` },
              { icon: "→", title: "" },
              { step: "9", icon: "📤", title: "Upload YT", desc: "Draft" },
              { icon: "→", title: "" },
              { step: "10", icon: "📱", title: "Kirim TG", desc: "Telegram" },
            ].map((item, i) =>
              item.icon === "→" ? (
                <div key={i} className="text-slate-600 text-center hidden md:block">→</div>
              ) : (
                <div key={i} className="bg-slate-800 rounded-xl p-3 text-center">
                  <div className="text-xl mb-1">{item.icon}</div>
                  <div className="text-xs font-bold text-slate-300">{item.title}</div>
                  <div className="text-xs text-slate-500 truncate">{item.desc}</div>
                </div>
              )
            )}
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════
            TELEGRAM COMMANDS
        ══════════════════════════════════════════════════════════ */}
        <section className="bg-slate-900 border border-slate-700 rounded-3xl p-6">
          <h2 className="text-2xl font-bold mb-4">🤖 Perintah Bot Telegram</h2>
          <div className="grid md:grid-cols-2 gap-2">
            {[
              { cmd: "/start", desc: "Menu utama", new: false },
              { cmd: "/help", desc: "Panduan lengkap", new: false },
              { cmd: "/connect", desc: "Hubungkan YouTube Studio", new: false },
              { cmd: "/settings", desc: "Pengaturan bot (klip, privacy)", new: false },
              { cmd: "/status", desc: "Status job terbaru", new: false },
              { cmd: "/history", desc: "Riwayat semua job", new: false },
              { cmd: "/mode", desc: "Info & cara ubah ASPECT_RATIO_MODE", new: false },
              { cmd: "/thumbnail", desc: "Info & cara ubah thumbnail config", new: false },
              { cmd: "/watermark", desc: "Info & cara ubah watermark config", new: true },
              { cmd: "/zoom", desc: "Info & cara ubah zoom effect config", new: true },
              { cmd: "/introoutro", desc: "Info & cara ubah intro/outro config", new: true },
              { cmd: "/disconnect", desc: "Putuskan koneksi YouTube", new: false },
            ].map((item) => (
              <div key={item.cmd} className={`flex items-center gap-3 rounded-xl p-3 ${item.new ? "bg-purple-500/10 border border-purple-500/20" : "bg-slate-800"}`}>
                <code className="text-purple-400 font-mono text-sm shrink-0">{item.cmd}</code>
                <span className="text-slate-400 text-sm">{item.desc}</span>
                {item.new && <span className="ml-auto text-xs bg-purple-500/30 text-purple-300 px-2 py-0.5 rounded-full shrink-0">✨ Baru</span>}
              </div>
            ))}
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════
            ENV VARS REFERENCE
        ══════════════════════════════════════════════════════════ */}
        <section className="bg-slate-900 border border-slate-700 rounded-3xl p-6">
          <h2 className="text-2xl font-bold mb-4">📋 Environment Variables Lengkap</h2>
          <div className="bg-slate-950 rounded-xl p-4 font-mono text-xs space-y-3 overflow-x-auto">
            {[
              { section: "# === WAJIB ===", vars: [] },
              { key: "TELEGRAM_BOT_TOKEN", desc: "Token dari @BotFather", req: true },
              { key: "DATABASE_URL", desc: "PostgreSQL connection string", req: true },
              { section: "# === YOUTUBE UPLOAD ===", vars: [] },
              { key: "GOOGLE_CLIENT_ID", desc: "Google OAuth Client ID", req: false },
              { key: "GOOGLE_CLIENT_SECRET", desc: "Google OAuth Client Secret", req: false },
              { key: "GOOGLE_REDIRECT_URI", desc: "https://yourapp.railway.app/api/youtube/callback", req: false },
              { section: "# === AI / TRANSKRIPSI ===", vars: [] },
              { key: "OPENAI_API_KEY", desc: "GPT-4o + Whisper transcription", req: false },
              { key: "GEMINI_API_KEY", desc: "Google Gemini (alternatif OpenAI)", req: false },
              { key: "GROQ_API_KEY", desc: "Groq Whisper (gratis, cepat)", req: false },
              { section: "# === ASPECT RATIO ===", vars: [] },
              { key: "ASPECT_RATIO_MODE", desc: "blur | crop | pad | stretch | none (default: blur)", req: false, highlight: true },
              { section: "# === THUMBNAIL ===", vars: [] },
              { key: "THUMBNAIL_ENABLED", desc: "true | false (default: true)", req: false, highlight: true },
              { key: "THUMBNAIL_MODE", desc: "middle | best | start | custom (default: middle)", req: false, highlight: true },
              { key: "THUMBNAIL_QUALITY", desc: "1-31 (default: 5)", req: false, highlight: true },
              { key: "THUMBNAIL_WIDTH", desc: "lebar (default: 1280)", req: false, highlight: true },
              { key: "THUMBNAIL_HEIGHT", desc: "tinggi (default: 720)", req: false, highlight: true },
              { section: "# === 💧 WATERMARK (BARU!) ===", vars: [] },
              { key: "WATERMARK_ENABLED", desc: "true | false (default: true)", req: false, highlight: true, new: true },
              { key: "WATERMARK_TEXT", desc: "@NamaChannel ← UBAH INI!", req: false, highlight: true, new: true },
              { key: "WATERMARK_POSITION", desc: "bottomright | bottomleft | topright | topleft | center", req: false, highlight: true, new: true },
              { key: "WATERMARK_FONT_SIZE", desc: "ukuran font (default: 32)", req: false, highlight: true, new: true },
              { key: "WATERMARK_COLOR", desc: "white | yellow | #FF0000 (default: white)", req: false, highlight: true, new: true },
              { key: "WATERMARK_OPACITY", desc: "0.0-1.0 (default: 0.85)", req: false, highlight: true, new: true },
              { key: "WATERMARK_BOX", desc: "true | false — kotak background (default: true)", req: false, highlight: true, new: true },
              { key: "WATERMARK_IMAGE_PATH", desc: "path ke file logo PNG (opsional, override teks)", req: false, highlight: true, new: true },
              { section: "# === 🔍 ZOOM EFFECT (BARU!) ===", vars: [] },
              { key: "ZOOM_EFFECT_ENABLED", desc: "true | false (default: true)", req: false, highlight: true, new: true },
              { key: "ZOOM_EFFECT_MODE", desc: "auto | always | never (default: auto)", req: false, highlight: true, new: true },
              { key: "ZOOM_EFFECT_TYPE", desc: "in | out | in-out | pulse (default: in)", req: false, highlight: true, new: true },
              { key: "ZOOM_EFFECT_INTENSITY", desc: "1.0-1.3 (default: 1.05 = subtle)", req: false, highlight: true, new: true },
              { key: "ZOOM_EFFECT_DURATION", desc: "durasi zoom dalam detik (default: 2.0)", req: false, highlight: true, new: true },
              { key: "ZOOM_EFFECT_MIN_SCORE", desc: "min viral score 1-10 untuk auto (default: 7)", req: false, highlight: true, new: true },
              { section: "# === 🎬 INTRO/OUTRO (BARU!) ===", vars: [] },
              { key: "INTRO_ENABLED", desc: "true | false (default: false)", req: false, highlight: true, new: true },
              { key: "INTRO_VIDEO_PATH", desc: "path file intro.mp4 (kosong = auto-generate)", req: false, highlight: true, new: true },
              { key: "INTRO_DURATION", desc: "durasi intro otomatis dalam detik (default: 3)", req: false, highlight: true, new: true },
              { key: "INTRO_TEXT", desc: "teks intro otomatis (default: AutoClip Bot)", req: false, highlight: true, new: true },
              { key: "INTRO_COLOR", desc: "warna BG intro #000000 (default: hitam)", req: false, highlight: true, new: true },
              { key: "OUTRO_ENABLED", desc: "true | false (default: false)", req: false, highlight: true, new: true },
              { key: "OUTRO_VIDEO_PATH", desc: "path file outro.mp4 (kosong = auto-generate)", req: false, highlight: true, new: true },
              { key: "OUTRO_DURATION", desc: "durasi outro otomatis dalam detik (default: 3)", req: false, highlight: true, new: true },
              { key: "OUTRO_TEXT", desc: "teks outro (default: Subscribe! 🔔)", req: false, highlight: true, new: true },
              { key: "OUTRO_COLOR", desc: "warna BG outro (default: #000000)", req: false, highlight: true, new: true },
              { section: "# === LAINNYA ===", vars: [] },
              { key: "NEXT_PUBLIC_APP_URL", desc: "URL aplikasi Anda di Railway", req: false },
              { key: "SETUP_SECRET", desc: "Secret untuk endpoint /api/webhook/setup", req: false },
            ].map((item, i) => {
              if ("section" in item) {
                return <div key={i} className="text-slate-500 pt-2">{item.section}</div>;
              }
              return (
                <div key={i} className={`flex items-start gap-2 ${item.new ? "text-purple-300" : ""}`}>
                  <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded ${item.req ? "bg-red-900/50 text-red-400" : "bg-slate-800 text-slate-500"}`}>
                    {item.req ? "REQ" : "OPT"}
                  </span>
                  <span className={item.highlight ? (item.new ? "text-purple-400" : "text-yellow-400") : "text-slate-300"}>{(item as {key: string}).key}</span>
                  <span className="text-slate-600"># {(item as {desc: string}).desc}</span>
                  {item.new && <span className="ml-1 text-purple-400 shrink-0">← ✨ Baru!</span>}
                </div>
              );
            })}
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════
            RECENT JOBS
        ══════════════════════════════════════════════════════════ */}
        {stats.recentJobs.length > 0 && (
          <section className="bg-slate-900 border border-slate-700 rounded-3xl p-6">
            <h2 className="text-2xl font-bold mb-4">📊 Job Terbaru</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-800">
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
                      <tr key={job.id} className="text-slate-300">
                        <td className="py-2 pr-4">
                          <div className="font-medium truncate max-w-[200px]">{job.videoTitle || "Memproses..."}</div>
                          <div className="text-xs text-slate-500 truncate max-w-[200px]">{job.sourceUrl.slice(0, 40)}...</div>
                        </td>
                        <td className="py-2 pr-4">
                          <span className="text-sm">{platform.emoji} {job.platform}</span>
                        </td>
                        <td className="py-2 pr-4">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${status.color}`}>{status.label}</span>
                        </td>
                        <td className="py-2 pr-4 text-slate-400">
                          {clips.length > 0 ? (
                            <span className="flex items-center gap-1">
                              {clips.length}
                              {clips.some((c) => c.youtubeUrl) && <span className="text-xs text-green-400">({clips.filter((c) => c.youtubeUrl).length}📺)</span>}
                              {clips.some((c) => c.thumbnailPath) && <span className="text-xs text-orange-400">🖼</span>}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="py-2 text-slate-500 text-xs">
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
        <section className="bg-slate-900 border border-slate-700 rounded-3xl p-6">
          <h2 className="text-2xl font-bold mb-2">🐳 Dockerfile untuk Railway</h2>
          <p className="text-slate-400 text-sm mb-4">Sudah include FFmpeg, Python, dan yt-dlp yang dibutuhkan untuk semua fitur.</p>
          <pre className="bg-slate-950 rounded-xl p-4 text-xs text-slate-300 overflow-x-auto whitespace-pre">{`FROM node:20-alpine AS base
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
          <div>🤖 AutoClip Bot • Made with Next.js, Grammy.js, FFmpeg & OpenAI</div>
          <div className="mt-1 flex flex-wrap justify-center gap-3 text-xs text-slate-700">
            <span>Aspect: <span className="text-slate-500">{currentMode}</span></span>
            <span>Thumbnail: <span className="text-slate-500">{thumbConfig.enabled ? thumbConfig.mode : "disabled"}</span></span>
            <span>Watermark: <span className="text-slate-500">{wmConfig.enabled ? wmConfig.text : "off"}</span></span>
            <span>Zoom: <span className="text-slate-500">{zoomCfg.enabled ? `${zoomCfg.mode}/${zoomCfg.type}` : "off"}</span></span>
            <span>Intro: <span className="text-slate-500">{ioCfg.introEnabled ? "on" : "off"}</span></span>
            <span>Outro: <span className="text-slate-500">{ioCfg.outroEnabled ? "on" : "off"}</span></span>
          </div>
        </footer>

      </div>
    </div>
  );
}
