import { db } from "@/db";
import { clipJobs, userSettings, uploadedVideos } from "@/db/schema";
import { sql, count } from "drizzle-orm";
import { ClipResult } from "@/db/schema";
import { getAspectRatioMode, getModeLabel, type AspectRatioMode } from "@/lib/video-config";

export const dynamic = "force-dynamic";

async function getStats() {
  try {
    const [jobsResult] = await db
      .select({ count: count() })
      .from(clipJobs);

    const [doneResult] = await db
      .select({ count: count() })
      .from(clipJobs)
      .where(sql`status = 'done'`);

    const [usersResult] = await db
      .select({ count: count() })
      .from(userSettings);

    const recentJobs = await db
      .select()
      .from(clipJobs)
      .orderBy(sql`created_at DESC`)
      .limit(10);

    // Count total clips and YouTube uploads
    let totalClips = 0;
    let totalYoutubeUploads = 0;
    recentJobs.forEach((job) => {
      const clips = (job.clips as ClipResult[] | null) || [];
      totalClips += clips.length;
      totalYoutubeUploads += clips.filter((c) => c.youtubeUrl).length;
    });

    return {
      totalJobs: jobsResult.count,
      doneJobs: doneResult.count,
      totalUsers: usersResult.count,
      totalClips,
      totalYoutubeUploads,
      recentJobs,
    };
  } catch {
    return {
      totalJobs: 0,
      doneJobs: 0,
      totalUsers: 0,
      totalClips: 0,
      totalYoutubeUploads: 0,
      recentJobs: [],
    };
  }
}

const statusConfig: Record<
  string,
  { color: string; bg: string; label: string; dot: string }
> = {
  queued: { color: "text-gray-400", bg: "bg-gray-800", label: "Antrian", dot: "bg-gray-400" },
  downloading: { color: "text-blue-400", bg: "bg-blue-900/30", label: "Download", dot: "bg-blue-400" },
  analyzing: { color: "text-purple-400", bg: "bg-purple-900/30", label: "Analisis", dot: "bg-purple-400" },
  clipping: { color: "text-yellow-400", bg: "bg-yellow-900/30", label: "Clipping", dot: "bg-yellow-400" },
  uploading: { color: "text-orange-400", bg: "bg-orange-900/30", label: "Upload", dot: "bg-orange-400" },
  done: { color: "text-green-400", bg: "bg-green-900/30", label: "Selesai", dot: "bg-green-400" },
  error: { color: "text-red-400", bg: "bg-red-900/30", label: "Error", dot: "bg-red-400" },
};

const platformConfig: Record<string, { emoji: string; color: string }> = {
  youtube: { emoji: "📺", color: "text-red-400" },
  facebook: { emoji: "📘", color: "text-blue-400" },
  tiktok: { emoji: "🎵", color: "text-pink-400" },
  instagram: { emoji: "📸", color: "text-purple-400" },
  twitter: { emoji: "🐦", color: "text-sky-400" },
  unknown: { emoji: "🌐", color: "text-gray-400" },
};

const modeDescriptions: Record<
  AspectRatioMode,
  { icon: string; label: string; desc: string; recommended?: boolean; color: string }
> = {
  blur: {
    icon: "🌀",
    label: "Blur Background",
    desc: "Video asli di tengah, sisi kosong diisi blur versi video. Tidak bolong, tidak crop. TERBAIK untuk Shorts!",
    recommended: true,
    color: "border-green-500/50 bg-green-500/10",
  },
  crop: {
    icon: "✂️",
    label: "Center Crop",
    desc: "Zoom & crop tengah video agar mengisi penuh 9:16. Full layar tapi sisi kiri/kanan mungkin terpotong.",
    color: "border-blue-500/50 bg-blue-500/10",
  },
  pad: {
    icon: "⬛",
    label: "Black Bars",
    desc: "Video di tengah dengan black bars di sisi kosong (letterbox). Mode lama, tidak bolong tapi ada hitam.",
    color: "border-gray-500/50 bg-gray-500/10",
  },
  stretch: {
    icon: "↔️",
    label: "Stretch to Fill",
    desc: "Paksa stretch video ke 9:16. Full layar tapi bisa distorsi (gambar gepeng/melet).",
    color: "border-yellow-500/50 bg-yellow-500/10",
  },
  none: {
    icon: "📐",
    label: "Original Ratio",
    desc: "Tidak ada konversi. Video tetap di rasio aslinya. Cocok untuk video yang sudah 9:16.",
    color: "border-gray-600/50 bg-gray-600/10",
  },
};

export default async function Home() {
  const stats = await getStats();
  const currentMode = getAspectRatioMode();
  const currentModeLabel = getModeLabel(currentMode);

  return (
    <main className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Hero */}
      <div className="relative overflow-hidden border-b border-white/5">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-900/20 via-transparent to-blue-900/20" />
        <div className="relative max-w-6xl mx-auto px-6 py-16">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-4xl">🤖</span>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-violet-400 to-blue-400 bg-clip-text text-transparent">
                AutoClip Bot
              </h1>
              <p className="text-gray-400 text-sm">AI YouTube Shorts Generator</p>
            </div>
          </div>
          <p className="text-gray-300 max-w-2xl">
            Bot Telegram cerdas yang memotong video panjang menjadi klip viral 20-40 detik untuk YouTube Shorts,
            lalu auto-upload ke YouTube Studio sebagai Draft.
          </p>

          {/* Active mode badge */}
          <div className="mt-4 inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5">
            <span className="text-green-400 text-xs font-medium">● AKTIF</span>
            <span className="text-gray-300 text-sm">
              Mode 9:16:{" "}
              <span className="text-violet-400 font-semibold">
                {modeDescriptions[currentMode]?.icon} {currentModeLabel}
              </span>
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
            { label: "Upload YouTube", value: stats.totalYoutubeUploads, icon: "📺", color: "from-red-500/20 to-red-600/20 border-red-500/30" },
          ].map((stat) => (
            <div
              key={stat.label}
              className={`bg-gradient-to-br ${stat.color} border rounded-xl p-4 text-center`}
            >
              <div className="text-2xl mb-1">{stat.icon}</div>
              <div className="text-2xl font-bold">{stat.value}</div>
              <div className="text-xs text-gray-400">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* =================== ASPECT RATIO MODE SECTION =================== */}
        <div className="bg-white/3 border border-white/10 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                📐 Konfigurasi Aspek Rasio 9:16
              </h2>
              <p className="text-gray-400 text-sm mt-1">
                Kontrol bagaimana video dikonversi ke format vertikal 9:16 (1080×1920) untuk YouTube Shorts
              </p>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-500 mb-1">Mode Aktif</div>
              <div className="bg-violet-500/20 border border-violet-500/40 text-violet-300 rounded-lg px-3 py-1 text-sm font-mono font-bold">
                {currentMode}
              </div>
            </div>
          </div>

          {/* Mode Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {(Object.entries(modeDescriptions) as [AspectRatioMode, typeof modeDescriptions[AspectRatioMode]][]).map(
              ([mode, info]) => (
                <div
                  key={mode}
                  className={`relative border rounded-xl p-4 transition-all ${
                    currentMode === mode
                      ? `${info.color} ring-2 ring-violet-500/50`
                      : "border-white/10 bg-white/3 opacity-60"
                  }`}
                >
                  {currentMode === mode && (
                    <div className="absolute top-3 right-3">
                      <span className="bg-violet-500 text-white text-xs px-2 py-0.5 rounded-full font-medium">
                        ● AKTIF
                      </span>
                    </div>
                  )}
                  {info.recommended && (
                    <div className="absolute top-3 left-3">
                      <span className="bg-green-500/20 border border-green-500/40 text-green-400 text-xs px-2 py-0.5 rounded-full font-medium">
                        ⭐ Rekomendasi
                      </span>
                    </div>
                  )}
                  <div className={`text-3xl mt-${info.recommended ? "7" : "0"} mb-2`}>{info.icon}</div>
                  <h3 className="font-bold text-white mb-1">{info.label}</h3>
                  <code className="text-xs text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded font-mono">
                    {mode}
                  </code>
                  <p className="text-gray-400 text-xs mt-2">{info.desc}</p>
                </div>
              )
            )}
          </div>

          {/* How to Change */}
          <div className="bg-gradient-to-r from-violet-900/30 to-blue-900/30 border border-violet-500/20 rounded-xl p-5">
            <h3 className="font-bold text-violet-300 mb-3 flex items-center gap-2">
              🔧 Cara Mengubah Mode (Railway)
            </h3>
            <div className="space-y-3">
              <div>
                <p className="text-gray-400 text-sm mb-2">
                  1. Buka Railway Dashboard → Project Anda → <strong className="text-white">Variables</strong>
                </p>
                <p className="text-gray-400 text-sm mb-2">
                  2. Tambah atau edit variable:
                </p>
                <div className="bg-black/40 rounded-lg p-3 font-mono text-sm">
                  <span className="text-gray-500"># Nama variable:</span>
                  <br />
                  <span className="text-yellow-400">ASPECT_RATIO_MODE</span>
                  <br />
                  <br />
                  <span className="text-gray-500"># Nilai yang tersedia:</span>
                  <br />
                  <span className="text-green-400">blur</span>
                  <span className="text-gray-500">     ← 🌀 Background blur (REKOMENDASI, tidak bolong)</span>
                  <br />
                  <span className="text-blue-400">crop</span>
                  <span className="text-gray-500">     ← ✂️ Center crop (full layar)</span>
                  <br />
                  <span className="text-gray-400">pad</span>
                  <span className="text-gray-500">      ← ⬛ Black bars</span>
                  <br />
                  <span className="text-yellow-400">stretch</span>
                  <span className="text-gray-500">  ← ↔️ Stretch paksa</span>
                  <br />
                  <span className="text-gray-400">none</span>
                  <span className="text-gray-500">     ← 📐 Keep original</span>
                </div>
              </div>
              <div>
                <p className="text-gray-400 text-sm mb-2">
                  3. Klik <strong className="text-white">Save</strong> → Railway akan auto-redeploy
                </p>
                <p className="text-gray-400 text-sm">
                  4. Mode baru aktif langsung untuk semua klip berikutnya
                </p>
              </div>
            </div>
          </div>

          {/* Visual Comparison */}
          <div className="mt-4 grid grid-cols-5 gap-2">
            {(
              [
                { mode: "blur", frames: ["▓▒░", "███", "▓▒░"], label: "Blur BG" },
                { mode: "crop", frames: ["███", "███", "███"], label: "Crop" },
                { mode: "pad", frames: ["   ", "███", "   "], label: "Black Pad" },
                { mode: "stretch", frames: ["▓██", "███", "▓██"], label: "Stretch" },
                { mode: "none", frames: [" ", "▓█▓", " "], label: "Original" },
              ] as { mode: AspectRatioMode; frames: string[]; label: string }[]
            ).map(({ mode, frames, label }) => (
              <div
                key={mode}
                className={`text-center p-2 rounded-lg border text-xs ${
                  currentMode === mode
                    ? "border-violet-500/50 bg-violet-500/10"
                    : "border-white/10 bg-white/3"
                }`}
              >
                <div className="font-mono text-[9px] leading-tight text-gray-300 mb-1">
                  {frames.map((f, i) => (
                    <div key={i} className="border border-white/20 rounded px-1">{f || "\u00A0"}</div>
                  ))}
                </div>
                <div className="text-gray-500">{label}</div>
                {currentMode === mode && (
                  <div className="text-violet-400 font-bold">✓</div>
                )}
              </div>
            ))}
          </div>
        </div>
        {/* =================== END ASPECT RATIO SECTION =================== */}

        {/* Features */}
        <div className="bg-white/3 border border-white/10 rounded-2xl p-6">
          <h2 className="text-xl font-bold mb-6">🚀 Fitur Lengkap</h2>
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
                icon: "🎯",
                title: "Viral Score Rating",
                desc: "Setiap klip mendapat skor viral 1-10 berdasarkan konten, hook, dan potensi engagement",
                tags: ["Scoring", "Analytics"],
              },
              {
                icon: "⚡",
                title: "Realtime Progress",
                desc: "Update status real-time di Telegram — dari download, transkripsi, analisis, cutting, hingga upload",
                tags: ["Telegram", "Live Updates"],
              },
            ].map((f) => (
              <div
                key={f.title}
                className="bg-white/3 border border-white/10 rounded-xl p-4 hover:border-white/20 transition-colors"
              >
                <div className="text-3xl mb-2">{f.icon}</div>
                <h3 className="font-bold mb-1">{f.title}</h3>
                <p className="text-gray-400 text-sm mb-3">{f.desc}</p>
                <div className="flex flex-wrap gap-1">
                  {f.tags.map((t) => (
                    <span
                      key={t}
                      className="text-xs bg-white/10 text-gray-300 px-2 py-0.5 rounded-full"
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
        <div className="bg-white/3 border border-white/10 rounded-2xl p-6">
          <h2 className="text-xl font-bold mb-6">🔄 Cara Kerja</h2>
          <div className="flex flex-col md:flex-row items-start gap-0">
            {[
              { step: "1", icon: "🔗", title: "Kirim Link", desc: "Tempel link video ke chat Telegram bot" },
              { step: "2", icon: "⬇️", title: "Download", desc: "Bot mengunduh video via yt-dlp" },
              { step: "3", icon: "🧠", title: "AI Analisis", desc: "Whisper transkripsi + AI pilih momen viral" },
              { step: "4", icon: "✂️", title: "Auto Clip", desc: `FFmpeg potong video 20-40 detik, mode: ${currentMode}` },
              { step: "5", icon: "📤", title: "Upload Draft", desc: "Auto upload ke YouTube Studio sebagai Draft" },
            ].map((step, i) => (
              <div key={step.step} className="flex md:flex-col items-start md:items-center flex-1">
                {i < 4 && (
                  <div className="hidden md:block w-full h-px bg-white/10 mt-8 mb-0" />
                )}
                <div className="flex md:flex-col items-center gap-3 md:gap-2 w-full">
                  <div className="w-14 h-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-2xl shrink-0">
                    {step.icon}
                  </div>
                  <div className="md:text-center">
                    <div className="text-xs text-gray-500">Step {step.step}</div>
                    <div className="font-medium text-sm">{step.title}</div>
                    <div className="text-gray-400 text-xs">{step.desc}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Jobs */}
        {stats.recentJobs.length > 0 && (
          <div className="bg-white/3 border border-white/10 rounded-2xl p-6">
            <h2 className="text-xl font-bold mb-4">📊 Job Terbaru</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-2 px-3 text-gray-400 font-medium">Video</th>
                    <th className="text-left py-2 px-3 text-gray-400 font-medium">Platform</th>
                    <th className="text-left py-2 px-3 text-gray-400 font-medium">Status</th>
                    <th className="text-left py-2 px-3 text-gray-400 font-medium">Klip</th>
                    <th className="text-left py-2 px-3 text-gray-400 font-medium">Waktu</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentJobs.map((job) => {
                    const status = statusConfig[job.status] || statusConfig.queued;
                    const platform = platformConfig[job.platform] || platformConfig.unknown;
                    const clips = (job.clips as ClipResult[] | null) || [];

                    return (
                      <tr
                        key={job.jobId}
                        className="border-b border-white/5 hover:bg-white/3 transition-colors"
                      >
                        <td className="py-3 px-3">
                          <div className="font-medium truncate max-w-[200px]">
                            {job.videoTitle || "Memproses..."}
                          </div>
                          <div className="text-gray-500 text-xs truncate max-w-[200px]">
                            {job.sourceUrl.slice(0, 50)}...
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <span className={`${platform.color}`}>
                            {platform.emoji} {job.platform}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs ${status.bg} ${status.color}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                            {status.label}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          {clips.length > 0 ? (
                            <div className="flex items-center gap-2">
                              <span>{clips.length}</span>
                              {clips.some((c) => c.youtubeUrl) && (
                                <span className="text-red-400 text-xs">
                                  ({clips.filter((c) => c.youtubeUrl).length} 📺)
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-600">—</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-gray-400 text-xs">
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
        <div className="bg-white/3 border border-white/10 rounded-2xl p-6">
          <h2 className="text-xl font-bold mb-6">📋 Panduan Setup</h2>
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-gray-300 mb-2">
                Environment Variables (Railway / .env)
              </h3>
              <div className="bg-black/40 rounded-lg p-4 font-mono text-xs space-y-1">
                {[
                  { key: "TELEGRAM_BOT_TOKEN", desc: "Token dari @BotFather", required: true },
                  { key: "DATABASE_URL", desc: "PostgreSQL connection string", required: true },
                  { key: "ASPECT_RATIO_MODE", desc: "blur | crop | pad | stretch | none (default: blur)", required: false, highlight: true },
                  { key: "GOOGLE_CLIENT_ID", desc: "Google OAuth Client ID", required: false },
                  { key: "GOOGLE_CLIENT_SECRET", desc: "Google OAuth Client Secret", required: false },
                  { key: "GOOGLE_REDIRECT_URI", desc: "https://yourapp.railway.app/api/youtube/callback", required: false },
                  { key: "OPENAI_API_KEY", desc: "OpenAI API Key (untuk AI analysis & Whisper)", required: false },
                  { key: "GEMINI_API_KEY", desc: "Google Gemini API Key (alternatif)", required: false },
                  { key: "GROQ_API_KEY", desc: "Groq API Key (untuk Whisper transcription gratis)", required: false },
                  { key: "NEXT_PUBLIC_APP_URL", desc: "URL app Anda (untuk webhook setup)", required: false },
                ].map((env) => (
                  <div key={env.key} className="flex items-start gap-3">
                    <span
                      className={`shrink-0 text-xs px-1.5 py-0.5 rounded font-bold ${
                        env.required
                          ? "bg-red-900/50 text-red-400"
                          : "bg-gray-800 text-gray-500"
                      }`}
                    >
                      {env.required ? "REQ" : "OPT"}
                    </span>
                    <span className={env.highlight ? "text-violet-400 font-bold" : "text-green-400"}>
                      {env.key}
                    </span>
                    <span className="text-gray-600"># {env.desc}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-300 mb-2">
                Setup Webhook (Jalankan setelah deploy)
              </h3>
              <div className="bg-black/40 rounded-lg p-3 font-mono text-xs text-green-400">
                GET /api/webhook/setup?secret=setup-autoclip-2024
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-300 mb-2">
                Dockerfile untuk Railway
              </h3>
              <div className="bg-black/40 rounded-lg p-4 font-mono text-xs text-gray-300">
                <pre>{`FROM node:20-alpine
RUN apk add --no-cache ffmpeg python3 py3-pip curl
RUN pip3 install yt-dlp --break-system-packages || pip3 install yt-dlp
WORKDIR /app
COPY . .
RUN npm ci
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]`}</pre>
              </div>
              <p className="text-yellow-400 text-xs mt-2">
                ⚠️ ffmpeg dan yt-dlp wajib ada di server untuk video processing.
              </p>
            </div>
          </div>
        </div>

        {/* Tech Stack & Deploy */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white/3 border border-white/10 rounded-2xl p-6">
            <h2 className="text-xl font-bold mb-4">🔧 Tech Stack</h2>
            <div className="space-y-2">
              {[
                { name: "Next.js 16 (App Router)", role: "Framework & API" },
                { name: "Grammy.js", role: "Telegram Bot SDK" },
                { name: "PostgreSQL + Drizzle ORM", role: "Database" },
                { name: "yt-dlp", role: "Video Downloader" },
                { name: "FFmpeg", role: "Video Processing (9:16)" },
                { name: "OpenAI Whisper", role: "Audio Transcription" },
                { name: "GPT-4o-mini / Gemini", role: "AI Analysis" },
                { name: "YouTube Data API v3", role: "YouTube Upload" },
              ].map((tech) => (
                <div
                  key={tech.name}
                  className="flex items-center justify-between py-1.5 border-b border-white/5"
                >
                  <span className="text-sm font-medium">{tech.name}</span>
                  <span className="text-xs text-gray-500">{tech.role}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white/3 border border-white/10 rounded-2xl p-6">
            <h2 className="text-xl font-bold mb-4">🌐 Deployment</h2>
            <div className="space-y-3">
              {[
                {
                  name: "Railway (Recommended)",
                  color: "text-purple-400",
                  note: "✅ Mendukung ffmpeg + yt-dlp. Set ASPECT_RATIO_MODE=blur untuk hasil terbaik.",
                  icon: "🚂",
                },
                {
                  name: "VPS (DigitalOcean / Hetzner)",
                  color: "text-blue-400",
                  note: "Kontrol penuh. Install ffmpeg & yt-dlp manual. Performance terbaik.",
                  icon: "🖥️",
                },
                {
                  name: "Vercel",
                  color: "text-white",
                  note: "⚠️ Tidak support ffmpeg. Hanya cocok untuk UI & bot tanpa video processing.",
                  icon: "▲",
                },
              ].map((opt) => (
                <div
                  key={opt.name}
                  className="bg-white/3 border border-white/10 rounded-xl p-4"
                >
                  <div className={`font-medium mb-1 ${opt.color}`}>
                    {opt.icon} {opt.name}
                  </div>
                  <div className="text-gray-400 text-xs">{opt.note}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center py-6 text-gray-600 text-sm border-t border-white/5">
          <p>
            🤖 AutoClip Bot • Made with Next.js, Grammy.js, FFmpeg & OpenAI
          </p>
          <p className="text-xs mt-1">
            Mode 9:16 aktif:{" "}
            <code className="bg-white/5 px-2 py-0.5 rounded text-violet-400">
              {currentMode}
            </code>{" "}
            — Ubah via{" "}
            <code className="bg-white/5 px-2 py-0.5 rounded text-gray-400">
              ASPECT_RATIO_MODE
            </code>
          </p>
        </div>
      </div>
    </main>
  );
}
