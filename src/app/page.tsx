import { db } from "@/db";
import { clipJobs, userSettings } from "@/db/schema";
import { sql, desc } from "drizzle-orm";
import Link from "next/link";
import { ClipResult } from "@/db/schema";

async function getStats() {
  try {
    const [totalJobs] = await db
      .select({ count: sql<number>`count(*)` })
      .from(clipJobs);

    const [doneJobs] = await db
      .select({ count: sql<number>`count(*)` })
      .from(clipJobs)
      .where(sql`status = 'done'`);

    const [totalUsers] = await db
      .select({ count: sql<number>`count(*)` })
      .from(userSettings);

    const recentJobs = await db
      .select()
      .from(clipJobs)
      .orderBy(desc(clipJobs.createdAt))
      .limit(10);

    // Count total clips created
    let totalClips = 0;
    let totalYoutubeUploads = 0;
    recentJobs.forEach((job) => {
      if (job.clips) {
        const clips = job.clips as ClipResult[];
        totalClips += clips.length;
        totalYoutubeUploads += clips.filter((c) => c.youtubeUrl).length;
      }
    });

    return {
      totalJobs: Number(totalJobs?.count || 0),
      doneJobs: Number(doneJobs?.count || 0),
      totalUsers: Number(totalUsers?.count || 0),
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

const statusConfig: Record<string, { color: string; bg: string; label: string; dot: string }> = {
  queued: { color: "text-yellow-400", bg: "bg-yellow-400/10 border-yellow-400/30", label: "Queued", dot: "bg-yellow-400" },
  downloading: { color: "text-blue-400", bg: "bg-blue-400/10 border-blue-400/30", label: "Downloading", dot: "bg-blue-400 animate-pulse" },
  analyzing: { color: "text-purple-400", bg: "bg-purple-400/10 border-purple-400/30", label: "Analyzing", dot: "bg-purple-400 animate-pulse" },
  clipping: { color: "text-orange-400", bg: "bg-orange-400/10 border-orange-400/30", label: "Clipping", dot: "bg-orange-400 animate-pulse" },
  uploading: { color: "text-cyan-400", bg: "bg-cyan-400/10 border-cyan-400/30", label: "Uploading", dot: "bg-cyan-400 animate-pulse" },
  done: { color: "text-green-400", bg: "bg-green-400/10 border-green-400/30", label: "Done", dot: "bg-green-400" },
  error: { color: "text-red-400", bg: "bg-red-400/10 border-red-400/30", label: "Error", dot: "bg-red-400" },
};

const platformConfig: Record<string, { emoji: string; color: string }> = {
  youtube: { emoji: "📺", color: "text-red-400" },
  facebook: { emoji: "📘", color: "text-blue-400" },
  tiktok: { emoji: "🎵", color: "text-pink-400" },
  instagram: { emoji: "📸", color: "text-purple-400" },
  unknown: { emoji: "🌐", color: "text-gray-400" },
};

export default async function Home() {
  const stats = await getStats();
  const botUsername = process.env.TELEGRAM_BOT_USERNAME || "your_bot";

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      {/* Hero Section */}
      <div
        className="relative overflow-hidden"
        style={{
          backgroundImage: "url('/images/hero-bg.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="absolute inset-0 bg-gray-950/80 backdrop-blur-sm" />
        <div className="relative z-10 px-6 py-20 text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur border border-white/20 rounded-full px-4 py-2 text-sm mb-6">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <span>Live & Running on Vercel</span>
          </div>
          <h1 className="text-5xl md:text-7xl font-black mb-6 bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            AutoClip Bot
          </h1>
          <p className="text-xl md:text-2xl text-gray-300 mb-4 max-w-2xl mx-auto">
            Bot Telegram AI untuk membuat YouTube Shorts secara otomatis
          </p>
          <p className="text-gray-400 mb-10 max-w-xl mx-auto">
            Kirim link video YouTube, Facebook, TikTok, atau Instagram — bot kami akan 
            memilih momen terbaik, memotong video 20-40 detik, dan upload langsung ke YouTube Studio sebagai Draft.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <a
              href={`https://t.me/${botUsername}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white font-bold px-8 py-4 rounded-2xl text-lg transition-all hover:scale-105 shadow-lg shadow-blue-500/30"
            >
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248l-2.026 9.546c-.146.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.889.675z"/>
              </svg>
              Buka di Telegram
            </a>
            <a
              href={`/api/webhook/setup?secret=setup-autoclip-2024`}
              className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold px-8 py-4 rounded-2xl text-lg transition-all hover:scale-105"
            >
              ⚙️ Setup Webhook
            </a>
          </div>
        </div>
      </div>

      {/* Stats Section */}
      <div className="px-6 py-12 max-w-6xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-12">
          {[
            { label: "Total Jobs", value: stats.totalJobs, icon: "🎬", color: "from-blue-500/20 to-blue-600/20 border-blue-500/30" },
            { label: "Selesai", value: stats.doneJobs, icon: "✅", color: "from-green-500/20 to-green-600/20 border-green-500/30" },
            { label: "Pengguna", value: stats.totalUsers, icon: "👥", color: "from-purple-500/20 to-purple-600/20 border-purple-500/30" },
            { label: "Klip Dibuat", value: stats.totalClips, icon: "✂️", color: "from-orange-500/20 to-orange-600/20 border-orange-500/30" },
            { label: "Upload YouTube", value: stats.totalYoutubeUploads, icon: "📺", color: "from-red-500/20 to-red-600/20 border-red-500/30" },
          ].map((stat) => (
            <div
              key={stat.label}
              className={`bg-gradient-to-br ${stat.color} border rounded-2xl p-5 text-center`}
            >
              <div className="text-3xl mb-2">{stat.icon}</div>
              <div className="text-3xl font-black text-white">{stat.value}</div>
              <div className="text-sm text-gray-400 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Features */}
        <div className="mb-12">
          <h2 className="text-3xl font-bold text-center mb-8">
            🚀 Fitur Lengkap
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
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
                desc: "Memotong video 20-40 detik secara otomatis dalam format vertikal 9:16 yang optimal untuk YouTube Shorts",
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
                className="bg-gray-900 border border-gray-800 rounded-2xl p-6 hover:border-gray-700 transition-colors"
              >
                <div className="text-4xl mb-3">{f.icon}</div>
                <h3 className="text-lg font-bold mb-2">{f.title}</h3>
                <p className="text-gray-400 text-sm mb-4">{f.desc}</p>
                <div className="flex flex-wrap gap-2">
                  {f.tags.map((t) => (
                    <span
                      key={t}
                      className="text-xs bg-gray-800 border border-gray-700 px-2 py-1 rounded-full text-gray-300"
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
        <div className="mb-12 bg-gray-900 border border-gray-800 rounded-3xl p-8">
          <h2 className="text-2xl font-bold mb-8 text-center">🔄 Cara Kerja</h2>
          <div className="grid md:grid-cols-5 gap-4">
            {[
              { step: "1", icon: "🔗", title: "Kirim Link", desc: "Tempel link video ke chat Telegram bot" },
              { step: "2", icon: "⬇️", title: "Download", desc: "Bot mengunduh video via yt-dlp" },
              { step: "3", icon: "🧠", title: "AI Analisis", desc: "Whisper transkripsi + AI pilih momen viral" },
              { step: "4", icon: "✂️", title: "Auto Clip", desc: "FFmpeg potong video 20-40 detik, 9:16" },
              { step: "5", icon: "📤", title: "Upload Draft", desc: "Auto upload ke YouTube Studio sebagai Draft" },
            ].map((step, i) => (
              <div key={step.step} className="flex flex-col items-center text-center relative">
                {i < 4 && (
                  <div className="hidden md:block absolute top-6 left-1/2 w-full h-0.5 bg-gradient-to-r from-purple-500/50 to-transparent z-0" />
                )}
                <div className="relative z-10 w-12 h-12 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full flex items-center justify-center text-xl font-black mb-3 shadow-lg shadow-purple-500/30">
                  {step.icon}
                </div>
                <div className="text-xs text-gray-500 mb-1">Step {step.step}</div>
                <div className="font-bold text-sm mb-1">{step.title}</div>
                <div className="text-xs text-gray-400">{step.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Jobs */}
        {stats.recentJobs.length > 0 && (
          <div className="mb-12">
            <h2 className="text-2xl font-bold mb-6">📊 Job Terbaru</h2>
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="px-4 py-3 text-left text-gray-400 font-medium">Video</th>
                      <th className="px-4 py-3 text-left text-gray-400 font-medium">Platform</th>
                      <th className="px-4 py-3 text-left text-gray-400 font-medium">Status</th>
                      <th className="px-4 py-3 text-left text-gray-400 font-medium">Klip</th>
                      <th className="px-4 py-3 text-left text-gray-400 font-medium">Waktu</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recentJobs.map((job) => {
                      const status = statusConfig[job.status] || statusConfig.queued;
                      const platform = platformConfig[job.platform] || platformConfig.unknown;
                      const clips = (job.clips as ClipResult[] | null) || [];

                      return (
                        <tr
                          key={job.id}
                          className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors"
                        >
                          <td className="px-4 py-3">
                            <div className="max-w-xs truncate font-medium">
                              {job.videoTitle || "Memproses..."}
                            </div>
                            <div className="text-xs text-gray-500 font-mono truncate max-w-xs">
                              {job.sourceUrl.slice(0, 50)}...
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`${platform.color} font-medium`}>
                              {platform.emoji} {job.platform}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center gap-1.5 ${status.bg} ${status.color} border px-2.5 py-1 rounded-full text-xs font-medium`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                              {status.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-gray-300">
                              {clips.length > 0 ? (
                                <span>
                                  {clips.length}
                                  {clips.some((c) => c.youtubeUrl) && (
                                    <span className="text-red-400 ml-1">
                                      ({clips.filter((c) => c.youtubeUrl).length} 📺)
                                    </span>
                                  )}
                                </span>
                              ) : (
                                <span className="text-gray-600">—</span>
                              )}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-400 text-xs">
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
          </div>
        )}

        {/* Setup Guide */}
        <div className="bg-gray-900 border border-gray-800 rounded-3xl p-8 mb-12">
          <h2 className="text-2xl font-bold mb-6">📋 Panduan Setup</h2>
          <div className="space-y-4 text-sm">
            <div className="bg-gray-800/50 rounded-xl p-4">
              <div className="font-mono text-xs text-gray-400 mb-3">.env / Vercel Environment Variables</div>
              <div className="space-y-2 font-mono text-sm">
                {[
                  { key: "TELEGRAM_BOT_TOKEN", desc: "Token dari @BotFather", required: true },
                  { key: "DATABASE_URL", desc: "PostgreSQL connection string", required: true },
                  { key: "GOOGLE_CLIENT_ID", desc: "Google OAuth Client ID", required: false },
                  { key: "GOOGLE_CLIENT_SECRET", desc: "Google OAuth Client Secret", required: false },
                  { key: "GOOGLE_REDIRECT_URI", desc: "https://yourapp.vercel.app/api/youtube/callback", required: false },
                  { key: "OPENAI_API_KEY", desc: "OpenAI API Key (untuk AI analysis & Whisper)", required: false },
                  { key: "GEMINI_API_KEY", desc: "Google Gemini API Key (alternatif)", required: false },
                  { key: "GROQ_API_KEY", desc: "Groq API Key (untuk Whisper transcription gratis)", required: false },
                  { key: "NEXT_PUBLIC_APP_URL", desc: "URL app Anda (untuk webhook setup)", required: false },
                ].map((env) => (
                  <div key={env.key} className="flex items-start gap-3">
                    <span className={`shrink-0 text-xs px-2 py-0.5 rounded font-bold ${env.required ? "bg-red-500/20 text-red-400" : "bg-gray-700 text-gray-400"}`}>
                      {env.required ? "REQ" : "OPT"}
                    </span>
                    <span className="text-blue-300">{env.key}</span>
                    <span className="text-gray-500 text-xs mt-0.5"># {env.desc}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-gray-800/50 rounded-xl p-4">
              <div className="font-semibold mb-3">🔧 Setup Webhook (Jalankan setelah deploy)</div>
              <div className="font-mono text-xs bg-gray-900 p-3 rounded-lg text-green-400 overflow-auto">
                GET /api/webhook/setup?secret=setup-autoclip-2024
              </div>
            </div>

            <div className="bg-gray-800/50 rounded-xl p-4">
              <div className="font-semibold mb-3">📦 Dependensi Sistem (VPS/Server)</div>
              <div className="font-mono text-xs bg-gray-900 p-3 rounded-lg text-green-400 overflow-auto">
                {`# Install yt-dlp dan ffmpeg
pip3 install yt-dlp
# atau
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
chmod +x /usr/local/bin/yt-dlp

# FFmpeg
apt-get install ffmpeg  # Ubuntu/Debian
brew install ffmpeg     # macOS`}
              </div>
              <div className="mt-2 text-xs text-yellow-400">
                ⚠️ Vercel Serverless tidak mendukung ffmpeg. Gunakan Railway, Render, atau VPS untuk fitur video processing penuh.
              </div>
            </div>
          </div>
        </div>

        {/* Platform & Tech Stack */}
        <div className="grid md:grid-cols-2 gap-6 mb-12">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <h3 className="font-bold text-lg mb-4">🔧 Tech Stack</h3>
            <div className="space-y-3">
              {[
                { name: "Next.js 16 (App Router)", role: "Framework & API" },
                { name: "Grammy.js", role: "Telegram Bot SDK" },
                { name: "PostgreSQL + Drizzle ORM", role: "Database" },
                { name: "yt-dlp", role: "Video Downloader" },
                { name: "FFmpeg", role: "Video Processing" },
                { name: "OpenAI Whisper", role: "Audio Transcription" },
                { name: "GPT-4o-mini / Gemini", role: "AI Analysis" },
                { name: "YouTube Data API v3", role: "YouTube Upload" },
              ].map((tech) => (
                <div key={tech.name} className="flex justify-between items-center">
                  <span className="text-white font-medium text-sm">{tech.name}</span>
                  <span className="text-xs text-gray-500 bg-gray-800 px-2 py-1 rounded">{tech.role}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <h3 className="font-bold text-lg mb-4">🌐 Deployment Options</h3>
            <div className="space-y-4">
              {[
                {
                  name: "Vercel (Recommended for UI)",
                  color: "text-white",
                  note: "Bot UI + DB queries berjalan baik. Video processing perlu external service.",
                  icon: "▲",
                },
                {
                  name: "Railway / Render",
                  color: "text-purple-400",
                  note: "Mendukung ffmpeg dan yt-dlp langsung. Ideal untuk full video processing.",
                  icon: "🚂",
                },
                {
                  name: "VPS (DigitalOcean / Hetzner)",
                  color: "text-blue-400",
                  note: "Kontrol penuh atas semua dependensi. Performance terbaik.",
                  icon: "🖥️",
                },
              ].map((opt) => (
                <div key={opt.name} className="bg-gray-800/50 rounded-xl p-4">
                  <div className={`font-bold ${opt.color} mb-1`}>
                    {opt.icon} {opt.name}
                  </div>
                  <div className="text-xs text-gray-400">{opt.note}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-800 px-6 py-8 text-center text-gray-500 text-sm">
        <p className="mb-2">
          🤖 <strong className="text-white">AutoClip Bot</strong> — AI-Powered YouTube Shorts Generator
        </p>
        <p>
          Built with Next.js · Grammy.js · FFmpeg · OpenAI · YouTube API v3
        </p>
        <div className="flex justify-center gap-4 mt-4">
          <a
            href="/api/health"
            className="text-gray-600 hover:text-white transition-colors text-xs"
          >
            API Health
          </a>
          <a
            href="/api/telegram/webhook"
            className="text-gray-600 hover:text-white transition-colors text-xs"
          >
            Webhook Status
          </a>
        </div>
      </footer>
    </main>
  );
}
