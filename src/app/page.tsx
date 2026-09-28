import { db } from "@/db";
import { clipJobs, uploadedVideos } from "@/db/schema";
import { sql, desc } from "drizzle-orm";
import { ClipResult } from "@/db/schema";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function getStats() {
  try {
    const [totalResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(clipJobs);

    const [doneResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(clipJobs)
      .where(sql`status = 'done'`);

    const [usersResult] = await db
      .select({ count: sql<number>`count(distinct telegram_user_id)` })
      .from(clipJobs);

    const recentJobs = await db
      .select()
      .from(clipJobs)
      .orderBy(desc(clipJobs.createdAt))
      .limit(8);

    // Count clips and uploads
    let totalClips = 0;
    let totalYoutubeUploads = 0;
    let totalTikTokUploads = 0;

    recentJobs.forEach((job) => {
      const clips = (job.clips as ClipResult[] | null) || [];
      totalClips += clips.length;
      totalYoutubeUploads += clips.filter((c) => c.youtubeUrl).length;
      totalTikTokUploads += clips.filter((c) => c.tiktokPublishId).length;
    });

    // Get all-time counts from all jobs
    const allJobs = await db.select().from(clipJobs);
    let allClips = 0;
    let allYt = 0;
    let allTt = 0;
    allJobs.forEach((job) => {
      const clips = (job.clips as ClipResult[] | null) || [];
      allClips += clips.length;
      allYt += clips.filter((c) => c.youtubeUrl).length;
      allTt += clips.filter((c) => c.tiktokPublishId).length;
    });

    return {
      totalJobs: Number(totalResult.count),
      doneJobs: Number(doneResult.count),
      totalUsers: Number(usersResult.count),
      totalClips: allClips,
      totalYoutubeUploads: allYt,
      totalTikTokUploads: allTt,
      recentJobs,
    };
  } catch {
    return {
      totalJobs: 0,
      doneJobs: 0,
      totalUsers: 0,
      totalClips: 0,
      totalYoutubeUploads: 0,
      totalTikTokUploads: 0,
      recentJobs: [],
    };
  }
}

const statusConfig: Record<string, { label: string; color: string; dot: string }> = {
  queued: { label: "Antrian", color: "text-gray-400", dot: "bg-gray-400" },
  downloading: { label: "Mengunduh", color: "text-blue-400", dot: "bg-blue-400" },
  analyzing: { label: "Menganalisis", color: "text-purple-400", dot: "bg-purple-400" },
  clipping: { label: "Memotong", color: "text-yellow-400", dot: "bg-yellow-400" },
  uploading: { label: "Mengupload", color: "text-orange-400", dot: "bg-orange-400" },
  done: { label: "Selesai", color: "text-green-400", dot: "bg-green-400" },
  error: { label: "Error", color: "text-red-400", dot: "bg-red-400" },
};

const platformConfig: Record<string, { emoji: string; color: string }> = {
  youtube: { emoji: "📺", color: "text-red-400" },
  facebook: { emoji: "📘", color: "text-blue-400" },
  tiktok: { emoji: "🎵", color: "text-pink-400" },
  instagram: { emoji: "📸", color: "text-purple-400" },
  unknown: { emoji: "🌐", color: "text-gray-400" },
};

export default async function HomePage() {
  const stats = await getStats();

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white font-sans">
      {/* Header */}
      <header className="border-b border-white/10 bg-black/40 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🤖</span>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                AutoClip Bot
              </h1>
              <p className="text-xs text-gray-500">AI Video Clipper · YouTube & TikTok</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <span className="text-green-400 font-medium">Live</span>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-10 space-y-12">
        {/* Hero */}
        <section className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 text-sm text-gray-400">
            <span>🚀</span>
            <span>Deploy di Railway · Powered by Next.js 16</span>
          </div>
          <h2 className="text-4xl md:text-5xl font-extrabold bg-gradient-to-r from-white via-gray-200 to-gray-500 bg-clip-text text-transparent">
            AI YouTube Shorts &amp;
            <br />
            <span className="bg-gradient-to-r from-[#00f2ea] to-[#ff0050] bg-clip-text text-transparent">
              TikTok Auto-Upload
            </span>
          </h2>
          <p className="text-gray-400 max-w-2xl mx-auto text-lg">
            Bot Telegram cerdas yang memotong video panjang menjadi klip viral 20–40 detik,
            lalu auto-upload ke <strong className="text-white">YouTube Studio</strong> dan{" "}
            <strong className="text-[#00f2ea]">TikTok Inbox</strong> sekaligus.
          </p>
        </section>

        {/* Stats */}
        <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label: "Total Jobs", value: stats.totalJobs, icon: "🎬", color: "from-blue-500/20 to-blue-600/20 border-blue-500/30" },
            { label: "Selesai", value: stats.doneJobs, icon: "✅", color: "from-green-500/20 to-green-600/20 border-green-500/30" },
            { label: "Pengguna", value: stats.totalUsers, icon: "👥", color: "from-purple-500/20 to-purple-600/20 border-purple-500/30" },
            { label: "Klip Dibuat", value: stats.totalClips, icon: "✂️", color: "from-yellow-500/20 to-yellow-600/20 border-yellow-500/30" },
            { label: "Upload YouTube", value: stats.totalYoutubeUploads, icon: "📺", color: "from-red-500/20 to-red-600/20 border-red-500/30" },
            { label: "Upload TikTok", value: stats.totalTikTokUploads, icon: "🎵", color: "from-pink-500/20 to-pink-600/20 border-pink-500/30" },
          ].map((stat) => (
            <div
              key={stat.label}
              className={`bg-gradient-to-br ${stat.color} border rounded-2xl p-4 text-center`}
            >
              <div className="text-2xl mb-1">{stat.icon}</div>
              <div className="text-2xl font-bold">{stat.value}</div>
              <div className="text-xs text-gray-400 mt-1">{stat.label}</div>
            </div>
          ))}
        </section>

        {/* Features */}
        <section>
          <h3 className="text-xl font-bold mb-6 text-center">🚀 Fitur Lengkap</h3>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                icon: "🧠",
                title: "AI-Powered Analysis",
                desc: "GPT-4o-mini atau Gemini mengidentifikasi momen viral terbaik dari video panjang",
                tags: ["OpenAI", "Gemini", "Whisper"],
              },
              {
                icon: "✂️",
                title: "Auto Video Clipper",
                desc: "Memotong video 20-40 detik secara otomatis dalam format vertikal 9:16",
                tags: ["FFmpeg", "9:16", "1080x1920"],
              },
              {
                icon: "📺",
                title: "YouTube Studio Auto-Upload",
                desc: "Video tersimpan sebagai Draft di YouTube Studio dengan judul & deskripsi menarik",
                tags: ["YouTube API", "OAuth2", "Draft"],
              },
              {
                icon: "🎵",
                title: "TikTok Auto-Upload",
                desc: "Video dikirim ke TikTok Inbox. Buka app TikTok → notifikasi → tap Post untuk publish",
                tags: ["TikTok API", "OAuth2", "Inbox"],
                highlight: true,
              },
              {
                icon: "🔥",
                title: "Viral Score Rating",
                desc: "Setiap klip mendapat skor viral 1-10 berdasarkan konten, hook, dan potensi engagement",
                tags: ["Scoring", "Analytics"],
              },
              {
                icon: "⚡",
                title: "Realtime Progress",
                desc: "Update status real-time di Telegram — dari download, transkripsi, cutting, hingga upload",
                tags: ["Telegram", "Live Updates"],
              },
            ].map((f) => (
              <div
                key={f.title}
                className={`rounded-2xl p-5 border space-y-3 ${
                  f.highlight
                    ? "bg-gradient-to-br from-[#00f2ea]/10 to-[#ff0050]/10 border-[#00f2ea]/30"
                    : "bg-white/5 border-white/10"
                }`}
              >
                <div className="text-3xl">{f.icon}</div>
                <div className="font-semibold">{f.title}</div>
                <p className="text-sm text-gray-400">{f.desc}</p>
                <div className="flex flex-wrap gap-1.5">
                  {f.tags.map((t) => (
                    <span
                      key={t}
                      className="bg-white/10 text-xs rounded-full px-2.5 py-0.5 text-gray-300"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section>
          <h3 className="text-xl font-bold mb-6 text-center">🔄 Cara Kerja</h3>
          <div className="flex flex-wrap justify-center gap-0">
            {[
              { step: "1", icon: "🔗", title: "Kirim Link", desc: "Tempel link video ke chat Telegram bot" },
              { step: "2", icon: "⬇️", title: "Download", desc: "Bot mengunduh video via yt-dlp" },
              { step: "3", icon: "🧠", title: "AI Analisis", desc: "Whisper transkripsi + AI pilih momen viral" },
              { step: "4", icon: "✂️", title: "Auto Clip", desc: "FFmpeg potong video 20-40 detik, 9:16" },
              { step: "5", icon: "📤", title: "Upload", desc: "Auto upload ke YouTube Draft & TikTok Inbox" },
            ].map((step, i) => (
              <div key={step.step} className="flex items-center">
                <div className="text-center w-36 p-3">
                  <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-2xl mx-auto mb-2">
                    {step.icon}
                  </div>
                  <div className="text-xs text-gray-500 mb-0.5">Step {step.step}</div>
                  <div className="font-semibold text-sm">{step.title}</div>
                  <div className="text-xs text-gray-400 mt-1">{step.desc}</div>
                </div>
                {i < 4 && (
                  <div className="text-gray-600 text-xl font-light mx-1">→</div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Recent Jobs */}
        {stats.recentJobs.length > 0 && (
          <section>
            <h3 className="text-xl font-bold mb-4">📊 Job Terbaru</h3>
            <div className="overflow-x-auto rounded-2xl border border-white/10">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-white/5">
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Video</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Platform</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Status</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Klip</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Upload</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Waktu</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {stats.recentJobs.map((job) => {
                    const status = statusConfig[job.status] || statusConfig.queued;
                    const platform = platformConfig[job.platform] || platformConfig.unknown;
                    const clips = (job.clips as ClipResult[] | null) || [];
                    const ytClips = clips.filter((c) => c.youtubeUrl).length;
                    const ttClips = clips.filter((c) => c.tiktokPublishId).length;

                    return (
                      <tr key={job.id} className="hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium text-white truncate max-w-[200px]">
                            {job.videoTitle || "Memproses..."}
                          </div>
                          <div className="text-xs text-gray-500 truncate max-w-[200px]">
                            {job.sourceUrl.slice(0, 45)}...
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`${platform.color} font-medium`}>
                            {platform.emoji} {job.platform}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${status.dot}`} />
                            <span className={status.color}>{status.label}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {clips.length > 0 ? (
                            <span className="bg-white/10 rounded-full px-2.5 py-0.5">
                              {clips.length}
                            </span>
                          ) : (
                            <span className="text-gray-600">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            {ytClips > 0 && (
                              <span className="text-red-400 text-xs">📺 {ytClips}</span>
                            )}
                            {ttClips > 0 && (
                              <span className="text-pink-400 text-xs">🎵 {ttClips}</span>
                            )}
                            {ytClips === 0 && ttClips === 0 && (
                              <span className="text-gray-600 text-xs">—</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
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
          </section>
        )}

        {/* Setup Guide */}
        <section>
          <h3 className="text-xl font-bold mb-6 text-center">📋 Panduan Setup</h3>
          <div className="grid md:grid-cols-2 gap-6">
            {/* Env vars */}
            <div className="bg-[#111] border border-white/10 rounded-2xl p-5">
              <h4 className="font-semibold mb-4 text-sm text-gray-300">
                Environment Variables (Railway / .env)
              </h4>
              <div className="space-y-2 font-mono text-xs">
                {[
                  { key: "TELEGRAM_BOT_TOKEN", desc: "Token dari @BotFather", required: true },
                  { key: "DATABASE_URL", desc: "PostgreSQL connection string", required: true },
                  { key: "─── YouTube OAuth ─────────────────", desc: "", required: null },
                  { key: "GOOGLE_CLIENT_ID", desc: "Google OAuth Client ID", required: false },
                  { key: "GOOGLE_CLIENT_SECRET", desc: "Google OAuth Client Secret", required: false },
                  { key: "GOOGLE_REDIRECT_URI", desc: "https://yourapp.railway.app/api/youtube/callback", required: false },
                  { key: "─── TikTok OAuth ──────────────────", desc: "", required: null },
                  { key: "TIKTOK_CLIENT_KEY", desc: "TikTok App Client Key", required: false },
                  { key: "TIKTOK_CLIENT_SECRET", desc: "TikTok App Client Secret", required: false },
                  { key: "TIKTOK_REDIRECT_URI", desc: "https://yourapp.railway.app/api/tiktok/callback", required: false },
                  { key: "TELEGRAM_BOT_USERNAME", desc: "Username bot (tanpa @), untuk callback page", required: false },
                  { key: "─── AI Keys ────────────────────────", desc: "", required: null },
                  { key: "OPENAI_API_KEY", desc: "GPT-4o-mini + Whisper transcription", required: false },
                  { key: "GEMINI_API_KEY", desc: "Google Gemini (alternatif OpenAI)", required: false },
                  { key: "GROQ_API_KEY", desc: "Groq Whisper (gratis, cepat)", required: false },
                  { key: "NEXT_PUBLIC_APP_URL", desc: "URL app Railway Anda", required: false },
                ].map((env) => (
                  <div key={env.key} className="flex items-start gap-2">
                    {env.required === null ? (
                      <span className="text-gray-600 mt-0.5 flex-shrink-0">{env.key}</span>
                    ) : (
                      <>
                        <span
                          className={`mt-0.5 flex-shrink-0 rounded px-1 text-[10px] font-bold ${
                            env.required
                              ? "bg-red-500/20 text-red-400"
                              : "bg-gray-700 text-gray-400"
                          }`}
                        >
                          {env.required ? "REQ" : "OPT"}
                        </span>
                        <div>
                          <span className="text-green-400">{env.key}</span>
                          <span className="text-gray-600"> # {env.desc}</span>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* TikTok Setup Guide */}
            <div className="space-y-4">
              <div className="bg-gradient-to-br from-[#00f2ea]/10 to-[#ff0050]/10 border border-[#00f2ea]/20 rounded-2xl p-5">
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  🎵 Setup TikTok OAuth
                </h4>
                <ol className="text-sm text-gray-300 space-y-2 list-decimal list-inside">
                  <li>
                    Buka{" "}
                    <a
                      href="https://developers.tiktok.com"
                      target="_blank"
                      className="text-[#00f2ea] underline"
                    >
                      developers.tiktok.com
                    </a>{" "}
                    → Manage Apps
                  </li>
                  <li>Buat app baru → pilih <strong>Web</strong></li>
                  <li>
                    Di Products, tambahkan:{" "}
                    <code className="bg-white/10 px-1 rounded">Login Kit</code> +{" "}
                    <code className="bg-white/10 px-1 rounded">Content Posting API</code>
                  </li>
                  <li>
                    Tambahkan Redirect URI:{" "}
                    <code className="bg-white/10 px-1 rounded text-xs">
                      https://yourapp.railway.app/api/tiktok/callback
                    </code>
                  </li>
                  <li>
                    Set Scope:{" "}
                    <code className="bg-white/10 px-1 rounded">video.upload</code>,{" "}
                    <code className="bg-white/10 px-1 rounded">video.publish</code>,{" "}
                    <code className="bg-white/10 px-1 rounded">user.info.basic</code>
                  </li>
                  <li>Copy Client Key & Secret ke Railway env vars</li>
                  <li>Submit app untuk review TikTok (sandbox gratis)</li>
                </ol>
                <div className="mt-3 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-xs text-yellow-300">
                  📌 Mode default: <strong>Inbox Upload</strong> — video dikirim ke TikTok Inbox, 
                  user tap "Post" di app untuk publish. Tidak perlu approval extra dari TikTok.
                </div>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  🔧 Setup Webhook
                </h4>
                <code className="text-xs bg-black/50 rounded-xl px-3 py-2 block text-green-400">
                  GET /api/webhook/setup?secret=setup-autoclip-2024
                </code>
                <p className="text-xs text-gray-500 mt-2">
                  Jalankan sekali setelah deploy untuk mendaftarkan Telegram webhook.
                </p>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                <h4 className="font-semibold mb-3">📱 Bot Commands</h4>
                <div className="space-y-1.5 font-mono text-xs">
                  {[
                    ["/connect", "Hubungkan YouTube Studio"],
                    ["/connect_tiktok", "Hubungkan TikTok 🆕"],
                    ["/disconnect", "Putus YouTube"],
                    ["/disconnect_tiktok", "Putus TikTok 🆕"],
                    ["/settings", "Pengaturan (privacy, auto-upload)"],
                    ["/status", "Status job terbaru"],
                    ["/history", "Riwayat semua klip"],
                  ].map(([cmd, desc]) => (
                    <div key={cmd} className="flex gap-3">
                      <span className="text-blue-400 flex-shrink-0">{cmd}</span>
                      <span className="text-gray-500">{desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Tech Stack */}
        <section className="grid md:grid-cols-2 gap-6">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
            <h4 className="font-semibold mb-4">🔧 Tech Stack</h4>
            <div className="space-y-2">
              {[
                { name: "Next.js 16 (App Router)", role: "Framework & API" },
                { name: "Grammy.js", role: "Telegram Bot SDK" },
                { name: "PostgreSQL + Drizzle ORM", role: "Database" },
                { name: "yt-dlp", role: "Video Downloader" },
                { name: "FFmpeg", role: "Video Processing" },
                { name: "OpenAI Whisper", role: "Audio Transcription" },
                { name: "GPT-4o-mini / Gemini", role: "AI Analysis" },
                { name: "YouTube Data API v3", role: "YouTube Upload" },
                { name: "TikTok Content Posting API", role: "TikTok Upload 🆕" },
              ].map((tech) => (
                <div
                  key={tech.name}
                  className="flex items-center justify-between text-sm py-1.5 border-b border-white/5 last:border-0"
                >
                  <span className="text-white font-medium">{tech.name}</span>
                  <span className="text-gray-500 text-xs">{tech.role}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
            <h4 className="font-semibold mb-4">📡 API Endpoints</h4>
            <div className="space-y-2 font-mono text-xs">
              {[
                { method: "GET", path: "/api/health", desc: "System health check" },
                { method: "POST", path: "/api/telegram/webhook", desc: "Telegram webhook" },
                { method: "GET", path: "/api/youtube/callback", desc: "YouTube OAuth callback" },
                { method: "GET", path: "/api/tiktok/callback", desc: "TikTok OAuth callback 🆕" },
                { method: "GET", path: "/api/webhook/setup", desc: "Setup Telegram webhook" },
              ].map((ep) => (
                <div key={ep.path} className="flex items-start gap-2 py-1.5 border-b border-white/5 last:border-0">
                  <span
                    className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                      ep.method === "GET"
                        ? "bg-green-500/20 text-green-400"
                        : "bg-blue-500/20 text-blue-400"
                    }`}
                  >
                    {ep.method}
                  </span>
                  <div>
                    <div className="text-white">{ep.path}</div>
                    <div className="text-gray-500">{ep.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/10 mt-16 py-8 text-center text-sm text-gray-600">
        <p>
          🤖 AutoClip Bot — Made with ❤️ using Next.js, Grammy.js, FFmpeg, OpenAI &amp; TikTok API
        </p>
        <p className="mt-1 text-xs">
          Deploy di Railway · PostgreSQL · Drizzle ORM
        </p>
      </footer>
    </main>
  );
}
