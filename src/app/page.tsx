import { db } from "@/db";
import { clipJobs, userSettings, youtubeTokens } from "@/db/schema";
import { sql, desc } from "drizzle-orm";
import { ClipResult } from "@/db/schema";
import {
  getAspectRatioMode,
  getModeLabel,
  getThumbnailConfig,
  getThumbnailModeLabel,
  type AspectRatioMode,
  type ThumbnailMode,
} from "@/lib/video-config";

async function getStats() {
  try {
    const [totalJobsResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(clipJobs);
    const [doneJobsResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(clipJobs)
      .where(sql`status = 'done'`);
    const [totalUsersResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(userSettings);
    const [totalYTResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(youtubeTokens);

    const recentJobs = await db
      .select()
      .from(clipJobs)
      .orderBy(desc(clipJobs.createdAt))
      .limit(8);

    // Calculate total clips
    const allJobs = await db
      .select({ clips: clipJobs.clips })
      .from(clipJobs)
      .where(sql`status = 'done'`);
    let totalClips = 0;
    let totalYoutubeUploads = 0;
    let totalThumbnails = 0;
    for (const job of allJobs) {
      if (job.clips) {
        const clips = job.clips as ClipResult[];
        totalClips += clips.length;
        totalYoutubeUploads += clips.filter((c) => c.youtubeUrl).length;
        totalThumbnails += clips.filter((c) => c.thumbnailPath).length;
      }
    }

    return {
      totalJobs: Number(totalJobsResult?.count || 0),
      doneJobs: Number(doneJobsResult?.count || 0),
      totalUsers: Number(totalUsersResult?.count || 0),
      ytTokens: Number(totalYTResult?.count || 0),
      totalClips,
      totalYoutubeUploads,
      totalThumbnails,
      recentJobs,
    };
  } catch {
    return {
      totalJobs: 0,
      doneJobs: 0,
      totalUsers: 0,
      ytTokens: 0,
      totalClips: 0,
      totalYoutubeUploads: 0,
      totalThumbnails: 0,
      recentJobs: [],
    };
  }
}

const statusConfig: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  queued: { label: "Antrian", color: "text-yellow-400", bg: "bg-yellow-400/10" },
  downloading: { label: "Downloading", color: "text-blue-400", bg: "bg-blue-400/10" },
  analyzing: { label: "Analisis AI", color: "text-purple-400", bg: "bg-purple-400/10" },
  clipping: { label: "Cutting", color: "text-orange-400", bg: "bg-orange-400/10" },
  uploading: { label: "Uploading", color: "text-cyan-400", bg: "bg-cyan-400/10" },
  done: { label: "Selesai", color: "text-green-400", bg: "bg-green-400/10" },
  error: { label: "Error", color: "text-red-400", bg: "bg-red-400/10" },
};

const platformConfig: Record<string, { emoji: string; color: string }> = {
  youtube: { emoji: "📺", color: "text-red-400" },
  facebook: { emoji: "📘", color: "text-blue-400" },
  tiktok: { emoji: "🎵", color: "text-pink-400" },
  instagram: { emoji: "📸", color: "text-purple-400" },
  unknown: { emoji: "🌐", color: "text-gray-400" },
};

const modeDescriptions: Record<
  AspectRatioMode,
  { icon: string; label: string; desc: string; recommended?: boolean }
> = {
  blur: {
    icon: "🌀",
    label: "Blur Background",
    desc: "Video di tengah, sisi kosong diisi background blur. Tidak bolong, tidak crop, tidak distorsi.",
    recommended: true,
  },
  crop: {
    icon: "✂️",
    label: "Center Crop",
    desc: "Zoom & crop tengah video. Full layar tapi sisi bisa terpotong.",
  },
  pad: {
    icon: "⬛",
    label: "Black Bars",
    desc: "Video asli dengan black bars di sisi. Aman tapi ada ruang hitam.",
  },
  stretch: {
    icon: "↔️",
    label: "Stretch to Fill",
    desc: "Paksa stretch ke 9:16. Cepat tapi bisa distorsi.",
  },
  none: {
    icon: "📐",
    label: "Original Ratio",
    desc: "Tidak ada konversi. Dimensi genap saja.",
  },
};

const thumbnailModeDescriptions: Record<
  ThumbnailMode,
  { icon: string; label: string; desc: string; recommended?: boolean }
> = {
  middle: {
    icon: "⏱️",
    label: "Middle Frame",
    desc: "Ambil frame tepat di tengah durasi klip. Stabil dan cepat. Cocok untuk sebagian besar konten.",
    recommended: true,
  },
  best: {
    icon: "🏆",
    label: "Best Frame",
    desc: "Scan banyak frame dan pilih yang paling representatif. Kualitas terbaik tapi lebih lambat.",
  },
  start: {
    icon: "▶️",
    label: "Start Frame",
    desc: "Ambil frame di awal klip. Cocok untuk hook / opening yang kuat.",
  },
  custom: {
    icon: "🎯",
    label: "Custom Offset",
    desc: "Ambil frame di detik ke-N dari awal klip. Set THUMBNAIL_OFFSET_SECONDS untuk mengontrolnya.",
  },
};

export default async function Home() {
  const stats = await getStats();
  const currentMode = getAspectRatioMode();
  const currentModeLabel = getModeLabel(currentMode);
  const thumbConfig = getThumbnailConfig();
  const thumbModeLabel = getThumbnailModeLabel(thumbConfig.mode);

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      {/* Hero */}
      <div className="bg-gradient-to-br from-gray-900 via-gray-950 to-black border-b border-gray-800">
        <div className="max-w-6xl mx-auto px-6 py-16 text-center">
          <div className="text-6xl mb-4">🤖</div>
          <h1 className="text-4xl font-bold mb-3 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            AutoClip Bot
          </h1>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            AI YouTube Shorts Generator — Bot Telegram yang otomatis memotong
            video panjang menjadi klip viral 20-40 detik + auto-generate thumbnail
          </p>
          <div className="flex gap-3 justify-center mt-6 flex-wrap">
            <span className="bg-blue-500/20 text-blue-300 border border-blue-500/30 px-3 py-1 rounded-full text-sm">
              📐 Mode: {currentMode}
            </span>
            <span className="bg-green-500/20 text-green-300 border border-green-500/30 px-3 py-1 rounded-full text-sm">
              🖼 Thumbnail: {thumbConfig.enabled ? thumbConfig.mode : "off"}
            </span>
            <span className="bg-purple-500/20 text-purple-300 border border-purple-500/30 px-3 py-1 rounded-full text-sm">
              Railway Ready 🚂
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-10 space-y-10">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: "Total Jobs", value: stats.totalJobs, icon: "🎬", color: "from-blue-500/20 to-blue-600/20 border-blue-500/30" },
            { label: "Selesai", value: stats.doneJobs, icon: "✅", color: "from-green-500/20 to-green-600/20 border-green-500/30" },
            { label: "Pengguna", value: stats.totalUsers, icon: "👥", color: "from-purple-500/20 to-purple-600/20 border-purple-500/30" },
            { label: "Klip Dibuat", value: stats.totalClips, icon: "✂️", color: "from-orange-500/20 to-orange-600/20 border-orange-500/30" },
            { label: "Thumbnail", value: stats.totalThumbnails, icon: "🖼", color: "from-pink-500/20 to-pink-600/20 border-pink-500/30" },
          ].map((stat) => (
            <div
              key={stat.label}
              className={`bg-gradient-to-br ${stat.color} border rounded-xl p-4 text-center`}
            >
              <div className="text-2xl mb-1">{stat.icon}</div>
              <div className="text-2xl font-bold">{stat.value}</div>
              <div className="text-xs text-gray-400 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* =================== THUMBNAIL AUTO-GENERATE SECTION =================== */}
        <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                🖼 Thumbnail Auto-Generate
              </h2>
              <p className="text-gray-400 text-sm mt-1">
                Generate thumbnail otomatis dari setiap klip menggunakan FFmpeg.
                Mudah dikonfigurasi via Railway Variables.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`px-3 py-1 rounded-full text-sm font-semibold border ${
                  thumbConfig.enabled
                    ? "bg-green-500/20 text-green-300 border-green-500/40"
                    : "bg-red-500/20 text-red-300 border-red-500/40"
                }`}
              >
                {thumbConfig.enabled ? "✅ Aktif" : "❌ Nonaktif"}
              </span>
              <span className="bg-blue-500/20 text-blue-300 border border-blue-500/30 px-3 py-1 rounded-full text-sm">
                {thumbConfig.mode}
              </span>
            </div>
          </div>

          {/* Thumbnail Mode Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {(
              Object.entries(thumbnailModeDescriptions) as [
                ThumbnailMode,
                (typeof thumbnailModeDescriptions)[ThumbnailMode]
              ][]
            ).map(([mode, info]) => (
              <div
                key={mode}
                className={`relative border rounded-xl p-4 transition-all ${
                  thumbConfig.mode === mode
                    ? "border-green-500/60 bg-green-500/10"
                    : "border-gray-700 bg-gray-800/50"
                }`}
              >
                {thumbConfig.mode === mode && (
                  <div className="absolute top-2 right-2">
                    <span className="bg-green-500 text-white text-xs px-2 py-0.5 rounded-full font-bold">
                      ● AKTIF
                    </span>
                  </div>
                )}
                {info.recommended && (
                  <div className="absolute top-2 left-2">
                    <span className="bg-yellow-500/80 text-black text-xs px-2 py-0.5 rounded-full font-bold">
                      ⭐ Rekomendasi
                    </span>
                  </div>
                )}
                <div className="text-3xl mb-2 mt-4">{info.icon}</div>
                <div className="font-semibold text-sm">{info.label}</div>
                <div className="text-xs text-gray-500 font-mono mt-0.5 mb-2">
                  {mode}
                </div>
                <div className="text-xs text-gray-400">{info.desc}</div>
              </div>
            ))}
          </div>

          {/* Current Thumbnail Config Summary */}
          <div className="bg-gray-800/60 rounded-xl p-4 mb-6">
            <h3 className="font-semibold text-sm text-gray-300 mb-3">
              📋 Konfigurasi Aktif
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
              {[
                { key: "THUMBNAIL_ENABLED", value: String(thumbConfig.enabled) },
                { key: "THUMBNAIL_MODE", value: thumbConfig.mode },
                { key: "THUMBNAIL_QUALITY", value: String(thumbConfig.quality) },
                { key: "THUMBNAIL_WIDTH", value: String(thumbConfig.width) },
                {
                  key: "THUMBNAIL_HEIGHT",
                  value: thumbConfig.height === 0 ? "0 (auto)" : String(thumbConfig.height),
                },
                {
                  key: "THUMBNAIL_OFFSET_SECONDS",
                  value:
                    thumbConfig.mode === "custom"
                      ? String(thumbConfig.offsetSeconds)
                      : "N/A",
                },
              ].map((item) => (
                <div
                  key={item.key}
                  className="bg-gray-900 rounded-lg p-3 border border-gray-700"
                >
                  <div className="text-gray-500 text-xs font-mono">{item.key}</div>
                  <div className="text-green-400 font-mono font-bold mt-1">
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* How to Change */}
          <div className="bg-gray-800/40 rounded-xl p-5 border border-gray-700">
            <h3 className="font-semibold text-gray-200 mb-4 flex items-center gap-2">
              🔧 Cara Mengubah Thumbnail Config (Railway)
            </h3>
            <div className="space-y-2 text-sm text-gray-400 mb-4">
              <p>1. Buka <strong className="text-white">Railway Dashboard</strong> → Project Anda → <strong className="text-white">Variables</strong></p>
              <p>2. Tambah atau edit variable berikut:</p>
            </div>
            <div className="bg-gray-950 rounded-lg p-4 font-mono text-xs space-y-1 border border-gray-800 overflow-x-auto">
              <div>
                <span className="text-gray-500"># Aktifkan/matikan thumbnail:</span>
              </div>
              <div>
                <span className="text-blue-400">THUMBNAIL_ENABLED</span>
                <span className="text-gray-500"> = </span>
                <span className="text-green-400">true</span>
                <span className="text-gray-500"> ← aktif | false ← matikan</span>
              </div>
              <div className="pt-2">
                <span className="text-gray-500"># Mode pengambilan frame:</span>
              </div>
              <div>
                <span className="text-blue-400">THUMBNAIL_MODE</span>
                <span className="text-gray-500"> = </span>
                <span className="text-green-400">middle</span>
                <span className="text-gray-500"> ← frame tengah klip (REKOMENDASI)</span>
              </div>
              <div>
                <span className="text-blue-400">THUMBNAIL_MODE</span>
                <span className="text-gray-500"> = </span>
                <span className="text-yellow-400">best</span>
                <span className="text-gray-500"> ← scan banyak frame, pilih terbaik</span>
              </div>
              <div>
                <span className="text-blue-400">THUMBNAIL_MODE</span>
                <span className="text-gray-500"> = </span>
                <span className="text-yellow-400">start</span>
                <span className="text-gray-500"> ← frame awal (opening hook)</span>
              </div>
              <div>
                <span className="text-blue-400">THUMBNAIL_MODE</span>
                <span className="text-gray-500"> = </span>
                <span className="text-yellow-400">custom</span>
                <span className="text-gray-500"> ← offset custom (set THUMBNAIL_OFFSET_SECONDS)</span>
              </div>
              <div className="pt-2">
                <span className="text-gray-500"># Kualitas output (1=terbaik, 31=terburuk):</span>
              </div>
              <div>
                <span className="text-blue-400">THUMBNAIL_QUALITY</span>
                <span className="text-gray-500"> = </span>
                <span className="text-green-400">5</span>
                <span className="text-gray-500"> ← default, kualitas tinggi</span>
              </div>
              <div className="pt-2">
                <span className="text-gray-500"># Resolusi thumbnail:</span>
              </div>
              <div>
                <span className="text-blue-400">THUMBNAIL_WIDTH</span>
                <span className="text-gray-500"> = </span>
                <span className="text-green-400">1280</span>
                <span className="text-gray-500"> ← lebar (YouTube: 1280)</span>
              </div>
              <div>
                <span className="text-blue-400">THUMBNAIL_HEIGHT</span>
                <span className="text-gray-500"> = </span>
                <span className="text-green-400">720</span>
                <span className="text-gray-500"> ← tinggi (0 = auto)</span>
              </div>
              <div className="pt-2">
                <span className="text-gray-500"># Offset untuk mode custom:</span>
              </div>
              <div>
                <span className="text-blue-400">THUMBNAIL_OFFSET_SECONDS</span>
                <span className="text-gray-500"> = </span>
                <span className="text-green-400">5</span>
                <span className="text-gray-500"> ← ambil frame di detik ke-5</span>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-3">
              3. Klik <strong className="text-white">Save</strong> → Railway akan auto-redeploy → Thumbnail config baru aktif langsung!
            </p>
          </div>
        </div>
        {/* =================== END THUMBNAIL SECTION =================== */}

        {/* =================== ASPECT RATIO MODE SECTION =================== */}
        <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                📐 Konfigurasi Aspek Rasio 9:16
              </h2>
              <p className="text-gray-400 text-sm mt-1">
                Kontrol bagaimana video dikonversi ke format vertikal 9:16 (1080×1920) untuk YouTube Shorts
              </p>
            </div>
            <span className="bg-blue-500/20 text-blue-300 border border-blue-500/30 px-3 py-1 rounded-full text-sm font-mono">
              {currentMode}
            </span>
          </div>

          {/* Mode Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            {(
              Object.entries(modeDescriptions) as [
                AspectRatioMode,
                (typeof modeDescriptions)[AspectRatioMode]
              ][]
            ).map(([mode, info]) => (
              <div
                key={mode}
                className={`relative border rounded-xl p-4 transition-all ${
                  currentMode === mode
                    ? "border-blue-500/60 bg-blue-500/10"
                    : "border-gray-700 bg-gray-800/50"
                }`}
              >
                {currentMode === mode && (
                  <div className="absolute top-2 right-2">
                    <span className="bg-blue-500 text-white text-xs px-2 py-0.5 rounded-full font-bold">
                      ● AKTIF
                    </span>
                  </div>
                )}
                {info.recommended && (
                  <div className="absolute top-2 left-2">
                    <span className="bg-yellow-500/80 text-black text-xs px-2 py-0.5 rounded-full font-bold">
                      ⭐
                    </span>
                  </div>
                )}
                <div className="text-3xl mb-2 mt-3">{info.icon}</div>
                <div className="font-semibold text-sm">{info.label}</div>
                <div className="text-xs text-gray-500 font-mono mt-0.5 mb-2">
                  {mode}
                </div>
                <div className="text-xs text-gray-400">{info.desc}</div>
              </div>
            ))}
          </div>

          {/* How to Change */}
          <div className="bg-gray-800/40 rounded-xl p-5 border border-gray-700">
            <h3 className="font-semibold text-gray-200 mb-3 flex items-center gap-2">
              🔧 Cara Mengubah Mode (Railway)
            </h3>
            <div className="bg-gray-950 rounded-lg p-4 font-mono text-xs space-y-1 border border-gray-800">
              <div><span className="text-gray-500"># Variable name:</span></div>
              <div>
                <span className="text-blue-400">ASPECT_RATIO_MODE</span>
                <span className="text-gray-500"> = </span>
                <span className="text-green-400">blur</span>
                <span className="text-gray-600">     ← 🌀 Background blur (REKOMENDASI)</span>
              </div>
              <div>
                <span className="text-blue-400">ASPECT_RATIO_MODE</span>
                <span className="text-gray-500"> = </span>
                <span className="text-yellow-400">crop</span>
                <span className="text-gray-600">     ← ✂️ Center crop</span>
              </div>
              <div>
                <span className="text-blue-400">ASPECT_RATIO_MODE</span>
                <span className="text-gray-500"> = </span>
                <span className="text-yellow-400">pad</span>
                <span className="text-gray-600">      ← ⬛ Black bars</span>
              </div>
              <div>
                <span className="text-blue-400">ASPECT_RATIO_MODE</span>
                <span className="text-gray-500"> = </span>
                <span className="text-yellow-400">stretch</span>
                <span className="text-gray-600">  ← ↔️ Stretch paksa</span>
              </div>
              <div>
                <span className="text-blue-400">ASPECT_RATIO_MODE</span>
                <span className="text-gray-500"> = </span>
                <span className="text-yellow-400">none</span>
                <span className="text-gray-600">     ← 📐 Original</span>
              </div>
            </div>
          </div>
        </div>
        {/* =================== END ASPECT RATIO SECTION =================== */}

        {/* Features */}
        <div>
          <h2 className="text-xl font-bold mb-4">🚀 Fitur Lengkap</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                icon: "🧠",
                title: "AI-Powered Analysis",
                desc: "Menggunakan GPT-4o atau Gemini untuk mengidentifikasi momen viral terbaik dari video panjang",
                tags: ["OpenAI", "Gemini", "Whisper"],
              },
              {
                icon: "✂️",
                title: "Auto Video Clipper",
                desc: `Memotong video 20-40 detik dalam format vertikal 9:16 (1080×1920). Mode aktif: ${currentModeLabel}`,
                tags: ["FFmpeg", "9:16", "1080x1920"],
              },
              {
                icon: "🖼",
                title: "Auto Thumbnail Generator",
                desc: `Generate thumbnail otomatis untuk setiap klip menggunakan FFmpeg. Mode: ${thumbModeLabel}. Mudah dikonfigurasi via env var.`,
                tags: ["FFmpeg", "JPEG", "Auto", thumbConfig.mode],
                highlight: true,
              },
              {
                icon: "📤",
                title: "YouTube Studio Auto-Upload",
                desc: "Login sekali, video langsung tersimpan sebagai Draft di YouTube Studio dengan judul dan deskripsi yang menarik",
                tags: ["YouTube API", "OAuth2", "Draft"],
              },
              {
                icon: "📱",
                title: "Multi-Platform Support",
                desc: "Mendukung link dari YouTube, Facebook, TikTok, dan Instagram secara bersamaan",
                tags: ["YouTube", "TikTok", "Instagram", "Facebook"],
              },
              {
                icon: "⚡",
                title: "Realtime Progress",
                desc: "Update status real-time di Telegram — dari download, transkripsi, analisis, cutting, thumbnail, hingga upload",
                tags: ["Telegram", "Live Updates"],
              },
            ].map((f) => (
              <div
                key={f.title}
                className={`bg-gray-900 border rounded-xl p-5 ${
                  "highlight" in f && f.highlight
                    ? "border-green-500/40 bg-green-500/5"
                    : "border-gray-800"
                }`}
              >
                {"highlight" in f && f.highlight && (
                  <div className="mb-2">
                    <span className="bg-green-500/20 text-green-400 text-xs px-2 py-0.5 rounded-full border border-green-500/30">
                      ✨ Fitur Baru
                    </span>
                  </div>
                )}
                <div className="text-3xl mb-2">{f.icon}</div>
                <div className="font-semibold mb-1">{f.title}</div>
                <div className="text-sm text-gray-400 mb-3">{f.desc}</div>
                <div className="flex gap-1 flex-wrap">
                  {f.tags.map((t) => (
                    <span
                      key={t}
                      className="bg-gray-800 text-gray-300 text-xs px-2 py-0.5 rounded"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* How it works */}
        <div>
          <h2 className="text-xl font-bold mb-4">🔄 Cara Kerja</h2>
          <div className="flex flex-wrap gap-4">
            {[
              { step: "1", icon: "🔗", title: "Kirim Link", desc: "Tempel link video ke chat Telegram bot" },
              { step: "2", icon: "⬇️", title: "Download", desc: "Bot mengunduh video via yt-dlp" },
              { step: "3", icon: "🧠", title: "AI Analisis", desc: "Whisper transkripsi + AI pilih momen viral" },
              { step: "4", icon: "✂️", title: "Auto Clip", desc: `FFmpeg potong video, mode: ${currentMode}` },
              { step: "5", icon: "🖼", title: "Auto Thumbnail", desc: `FFmpeg generate thumbnail, mode: ${thumbConfig.mode}` },
              { step: "6", icon: "📤", title: "Upload Draft", desc: "Auto upload ke YouTube Studio sebagai Draft" },
            ].map((step, i) => (
              <div key={step.step} className="flex items-start gap-3">
                {i < 5 && (
                  <div className="hidden md:block text-gray-700 text-xl mt-4">→</div>
                )}
                <div className="flex flex-col items-center text-center w-28">
                  <div className="w-12 h-12 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center text-xl mb-2">
                    {step.icon}
                  </div>
                  <div className="text-xs text-gray-500 mb-1">Step {step.step}</div>
                  <div className="text-sm font-semibold">{step.title}</div>
                  <div className="text-xs text-gray-500 mt-1">{step.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Telegram Commands */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <h2 className="text-xl font-bold mb-4">🤖 Perintah Bot Telegram</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { cmd: "/start", desc: "Menu utama" },
              { cmd: "/help", desc: "Panduan lengkap" },
              { cmd: "/connect", desc: "Hubungkan YouTube Studio" },
              { cmd: "/settings", desc: "Pengaturan bot (klip, privacy)" },
              { cmd: "/status", desc: "Status job terbaru" },
              { cmd: "/history", desc: "Riwayat semua job" },
              { cmd: "/mode", desc: "Info & cara ubah ASPECT_RATIO_MODE" },
              { cmd: "/thumbnail", desc: "Info & cara ubah thumbnail config ✨" },
              { cmd: "/disconnect", desc: "Putuskan koneksi YouTube" },
              { cmd: "/cancel", desc: "Info pembatalan proses" },
            ].map((item) => (
              <div
                key={item.cmd}
                className={`flex gap-3 items-start p-3 rounded-lg border ${
                  item.cmd === "/thumbnail"
                    ? "bg-green-500/5 border-green-500/20"
                    : "bg-gray-800/50 border-gray-700/50"
                }`}
              >
                <code className={`text-sm font-mono font-bold shrink-0 ${
                  item.cmd === "/thumbnail" ? "text-green-400" : "text-blue-400"
                }`}>
                  {item.cmd}
                </code>
                <span className="text-sm text-gray-400">{item.desc}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Jobs */}
        {stats.recentJobs.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <h2 className="text-xl font-bold mb-4">📊 Job Terbaru</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-left">
                    <th className="pb-3 text-gray-400 font-medium">Video</th>
                    <th className="pb-3 text-gray-400 font-medium">Platform</th>
                    <th className="pb-3 text-gray-400 font-medium">Status</th>
                    <th className="pb-3 text-gray-400 font-medium">Klip</th>
                    <th className="pb-3 text-gray-400 font-medium">Waktu</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {stats.recentJobs.map((job) => {
                    const status =
                      statusConfig[job.status] || statusConfig.queued;
                    const platform =
                      platformConfig[job.platform] || platformConfig.unknown;
                    const clips = (job.clips as ClipResult[] | null) || [];

                    return (
                      <tr key={job.jobId}>
                        <td className="py-3 pr-4">
                          <div className="font-medium text-gray-200 truncate max-w-[200px]">
                            {job.videoTitle || "Memproses..."}
                          </div>
                          <div className="text-gray-600 text-xs truncate max-w-[200px]">
                            {job.sourceUrl.slice(0, 50)}...
                          </div>
                        </td>
                        <td className="py-3 pr-4">
                          <span className={platform.color}>
                            {platform.emoji} {job.platform}
                          </span>
                        </td>
                        <td className="py-3 pr-4">
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-medium ${status.bg} ${status.color}`}
                          >
                            {status.label}
                          </span>
                        </td>
                        <td className="py-3 pr-4">
                          {clips.length > 0 ? (
                            <span>
                              {clips.length}
                              {clips.some((c) => c.youtubeUrl) && (
                                <span className="text-red-400 ml-1">
                                  ({clips.filter((c) => c.youtubeUrl).length}{" "}
                                  📺)
                                </span>
                              )}
                              {clips.some((c) => c.thumbnailPath) && (
                                <span className="text-green-400 ml-1">
                                  🖼
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-gray-600">—</span>
                          )}
                        </td>
                        <td className="py-3 text-gray-500 text-xs">
                          {new Date(job.createdAt).toLocaleString("id-ID", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Setup Guide */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold">📋 Panduan Setup</h2>

          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <h3 className="font-semibold text-gray-200 mb-4">
              Environment Variables (Railway / .env)
            </h3>
            <div className="font-mono text-xs space-y-1">
              {[
                { key: "TELEGRAM_BOT_TOKEN", desc: "Token dari @BotFather", required: true },
                { key: "DATABASE_URL", desc: "PostgreSQL connection string", required: true },
                { key: "ASPECT_RATIO_MODE", desc: "blur | crop | pad | stretch | none (default: blur)", required: false, highlight: true },
                { key: "THUMBNAIL_ENABLED", desc: "true | false (default: true) ← aktifkan thumbnail", required: false, highlight: true },
                { key: "THUMBNAIL_MODE", desc: "middle | best | start | custom (default: middle)", required: false, highlight: true },
                { key: "THUMBNAIL_QUALITY", desc: "1-31, makin kecil makin bagus (default: 5)", required: false, highlight: true },
                { key: "THUMBNAIL_WIDTH", desc: "lebar thumbnail (default: 1280)", required: false, highlight: true },
                { key: "THUMBNAIL_HEIGHT", desc: "tinggi thumbnail (default: 720, 0=auto)", required: false, highlight: true },
                { key: "THUMBNAIL_OFFSET_SECONDS", desc: "offset detik untuk mode custom (default: 5)", required: false, highlight: true },
                { key: "GOOGLE_CLIENT_ID", desc: "Google OAuth Client ID", required: false },
                { key: "GOOGLE_CLIENT_SECRET", desc: "Google OAuth Client Secret", required: false },
                { key: "GOOGLE_REDIRECT_URI", desc: "https://yourapp.railway.app/api/youtube/callback", required: false },
                { key: "OPENAI_API_KEY", desc: "OpenAI API Key (untuk AI analysis & Whisper)", required: false },
                { key: "GEMINI_API_KEY", desc: "Google Gemini API Key (alternatif)", required: false },
                { key: "GROQ_API_KEY", desc: "Groq API Key (untuk Whisper gratis)", required: false },
                { key: "NEXT_PUBLIC_APP_URL", desc: "URL app Anda (untuk webhook setup)", required: false },
              ].map((env) => (
                <div
                  key={env.key}
                  className={`flex gap-3 py-1 px-2 rounded ${
                    env.highlight ? "bg-green-500/5 border border-green-500/20" : ""
                  }`}
                >
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded shrink-0 h-fit mt-0.5 ${
                      env.required
                        ? "bg-red-500/20 text-red-300"
                        : "bg-gray-700 text-gray-400"
                    }`}
                  >
                    {env.required ? "REQ" : "OPT"}
                  </span>
                  <span
                    className={`shrink-0 ${
                      env.highlight ? "text-green-400" : "text-blue-400"
                    }`}
                  >
                    {env.key}
                  </span>
                  <span className="text-gray-500"># {env.desc}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <h3 className="font-semibold text-gray-200 mb-3">
              Setup Webhook (Jalankan setelah deploy)
            </h3>
            <div className="bg-gray-800 rounded-lg p-3 font-mono text-xs text-green-400">
              GET /api/webhook/setup?secret=setup-autoclip-2024
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <h3 className="font-semibold text-gray-200 mb-3">
              Dockerfile untuk Railway
            </h3>
            <pre className="bg-gray-800 rounded-lg p-4 font-mono text-xs text-gray-300 overflow-x-auto">{`FROM node:20-alpine
RUN apk add --no-cache ffmpeg python3 py3-pip curl
RUN pip3 install yt-dlp --break-system-packages || pip3 install yt-dlp
WORKDIR /app
COPY . .
RUN npm ci
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]`}</pre>
            <p className="text-xs text-yellow-400 mt-3">
              ⚠️ ffmpeg dan yt-dlp wajib ada di server untuk video processing dan thumbnail generation.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-gray-600 text-sm py-6 border-t border-gray-800">
          <p>🤖 AutoClip Bot • Made with Next.js, Grammy.js, FFmpeg & OpenAI</p>
          <p className="mt-2">
            Mode 9:16:{" "}
            <code className="text-blue-400">{currentMode}</code> | Thumbnail:{" "}
            <code className="text-green-400">
              {thumbConfig.enabled ? thumbConfig.mode : "disabled"}
            </code>{" "}
            — Ubah via Railway Variables
          </p>
        </div>
      </div>
    </main>
  );
}
