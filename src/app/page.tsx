import { db } from "@/db";
import { clipJobs, userSettings, youtubeTokens } from "@/db/schema";
import { desc, count, sql } from "drizzle-orm";
import {
  getAspectRatioMode,
  getModeLabel,
  getThumbnailConfig,
  getWatermarkConfig,
  getIntroOutroConfig,
  getZoomEffectConfig,
  getMaxClipsConfig,
  resolveMaxClips,
  resolveAspectRatioMode,
  resolveWatermarkConfig,
  resolveZoomEffectConfig,
  resolveIntroOutroConfig,
} from "@/lib/video-config";
import type { ClipResult, UserSettingsRow } from "@/db/schema";

export const dynamic = "force-dynamic";

async function getStats() {
  const [totalJobsRow] = await db.select({ count: count() }).from(clipJobs);
  const [doneJobsRow] = await db
    .select({ count: count() })
    .from(clipJobs)
    .where(sql`status = 'done'`);
  const [totalUsersRow] = await db.select({ count: count() }).from(userSettings);

  const allDoneJobs = await db
    .select({ clips: clipJobs.clips })
    .from(clipJobs)
    .where(sql`status = 'done'`);

  let totalClips = 0;
  let totalThumbnails = 0;
  allDoneJobs.forEach((j) => {
    const clips = (j.clips as ClipResult[] | null) || [];
    totalClips += clips.length;
    totalThumbnails += clips.filter((c) => c.thumbnailPath).length;
  });

  const recentJobs = await db
    .select()
    .from(clipJobs)
    .orderBy(desc(clipJobs.createdAt))
    .limit(10);

  const allUsers = await db
    .select()
    .from(userSettings)
    .orderBy(desc(userSettings.createdAt))
    .limit(20);

  const ytConnected = await db.select({ count: count() }).from(youtubeTokens);

  return {
    totalJobs: totalJobsRow.count,
    doneJobs: doneJobsRow.count,
    totalUsers: totalUsersRow.count,
    totalClips,
    totalThumbnails,
    ytConnected: ytConnected[0].count,
    recentJobs,
    allUsers,
  };
}

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  queued: { label: "⏳ Antri", color: "text-yellow-400", bg: "bg-yellow-400/10" },
  downloading: { label: "⬇️ Download", color: "text-blue-400", bg: "bg-blue-400/10" },
  analyzing: { label: "🧠 Analisis", color: "text-purple-400", bg: "bg-purple-400/10" },
  clipping: { label: "✂️ Klip", color: "text-orange-400", bg: "bg-orange-400/10" },
  uploading: { label: "📤 Upload", color: "text-cyan-400", bg: "bg-cyan-400/10" },
  done: { label: "✅ Selesai", color: "text-green-400", bg: "bg-green-400/10" },
  error: { label: "❌ Error", color: "text-red-400", bg: "bg-red-400/10" },
};

export default async function HomePage() {
  const stats = await getStats();
  const globalMaxClips = getMaxClipsConfig();
  const globalMode = getAspectRatioMode();
  const globalWm = getWatermarkConfig();
  const globalZoom = getZoomEffectConfig();
  const globalIo = getIntroOutroConfig();
  const globalThumb = getThumbnailConfig();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="max-w-7xl mx-auto space-y-8">

        {/* ── Header ── */}
        <div className="text-center py-8">
          <h1 className="text-4xl font-bold text-white mb-2">🤖 AutoClip Bot</h1>
          <p className="text-slate-400 text-lg">AI YouTube Shorts Generator — Admin Dashboard</p>
          <div className="mt-4 flex justify-center gap-3 flex-wrap">
            <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-full text-sm border border-emerald-500/30">
              🟢 Bot Active
            </span>
            <span className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-sm border border-blue-500/30">
              📡 Per-User Settings ✨
            </span>
            <span className="px-3 py-1 bg-purple-500/20 text-purple-400 rounded-full text-sm border border-purple-500/30">
              🚂 Deployed on Railway
            </span>
          </div>
        </div>

        {/* ── Stats ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label: "Total Jobs", value: stats.totalJobs, icon: "🎬", color: "blue" },
            { label: "Selesai", value: stats.doneJobs, icon: "✅", color: "green" },
            { label: "Pengguna", value: stats.totalUsers, icon: "👥", color: "purple" },
            { label: "Klip Dibuat", value: stats.totalClips, icon: "✂️", color: "orange" },
            { label: "Thumbnail", value: stats.totalThumbnails, icon: "🖼️", color: "pink" },
            { label: "YT Terhubung", value: stats.ytConnected, icon: "📺", color: "red" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-slate-900 rounded-xl border border-slate-800 p-4 text-center"
            >
              <div className="text-2xl mb-1">{stat.icon}</div>
              <div className="text-2xl font-bold text-white">{stat.value}</div>
              <div className="text-xs text-slate-400 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* ── PER-USER SETTINGS FEATURE HIGHLIGHT ── */}
        <div className="bg-gradient-to-br from-emerald-900/40 to-teal-900/40 rounded-2xl border border-emerald-500/30 p-6">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-3xl">⚙️</span>
            <div>
              <h2 className="text-xl font-bold text-emerald-400">Per-User Settings — Fitur Baru!</h2>
              <p className="text-slate-400 text-sm">Setiap akun Telegram memiliki pengaturan sendiri yang tersimpan di database.</p>
            </div>
            <span className="ml-auto px-2 py-1 bg-emerald-500 text-white text-xs rounded-full font-bold">NEW</span>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { icon: "✂️", title: "Jumlah Klip", desc: "1–10 klip per video per akun", cmd: "/settings → Jumlah Klip" },
              { icon: "🔒", title: "Privacy Upload", desc: "Private/Unlisted/Public per akun", cmd: "/settings → Privacy" },
              { icon: "📐", title: "Aspect Ratio", desc: "blur/crop/pad/stretch/none per akun", cmd: "/settings → Aspect Ratio" },
              { icon: "💧", title: "Watermark", desc: "Teks, posisi, warna per akun", cmd: "/setwm @NamaChannel" },
              { icon: "🔍", title: "Zoom Effect", desc: "On/off, tipe, intensitas per akun", cmd: "/settings → Zoom Effect" },
              { icon: "🎬", title: "Intro / Outro", desc: "Aktif/nonaktif, teks per akun", cmd: "/setintro /setoutro" },
            ].map((item) => (
              <div key={item.title} className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{item.icon}</span>
                  <div>
                    <div className="font-semibold text-white text-sm">{item.title}</div>
                    <div className="text-slate-400 text-xs mt-1">{item.desc}</div>
                    <div className="mt-2 font-mono text-xs text-emerald-400 bg-slate-900 px-2 py-1 rounded">
                      {item.cmd}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
            <h3 className="font-semibold text-white mb-2">📋 Cara Kerja Priority Setting:</h3>
            <div className="flex items-center gap-2 flex-wrap text-sm">
              <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full">1. Per-User DB</span>
              <span className="text-slate-500">➡️ lebih tinggi dari</span>
              <span className="px-3 py-1 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-full">2. Railway Env Var</span>
              <span className="text-slate-500">➡️ lebih tinggi dari</span>
              <span className="px-3 py-1 bg-slate-600/20 text-slate-400 border border-slate-600/30 rounded-full">3. Hardcoded Default</span>
            </div>
            <p className="text-slate-400 text-xs mt-2">
              Jika user belum set (NULL), Railway env var digunakan. Jika env var tidak di-set, fallback ke default hardcoded.
            </p>
          </div>
        </div>

        {/* ── USERS TABLE ── */}
        {stats.allUsers.length > 0 && (
          <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
            <div className="p-6 border-b border-slate-800">
              <h2 className="text-xl font-bold text-white">👥 Pengguna & Settings Mereka</h2>
              <p className="text-slate-400 text-sm mt-1">
                Setiap baris = satu akun Telegram dengan setting independen
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-800/50">
                    <th className="text-left p-4 text-slate-400 text-sm font-medium">Pengguna</th>
                    <th className="text-left p-4 text-slate-400 text-sm font-medium">Klip</th>
                    <th className="text-left p-4 text-slate-400 text-sm font-medium">Privacy</th>
                    <th className="text-left p-4 text-slate-400 text-sm font-medium">Aspect Ratio</th>
                    <th className="text-left p-4 text-slate-400 text-sm font-medium">Watermark</th>
                    <th className="text-left p-4 text-slate-400 text-sm font-medium">Zoom</th>
                    <th className="text-left p-4 text-slate-400 text-sm font-medium">Intro/Outro</th>
                    <th className="text-left p-4 text-slate-400 text-sm font-medium">YouTube</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.allUsers.map((user: UserSettingsRow) => {
                    const effectiveClips = resolveMaxClips(user.maxClips);
                    const effectiveMode = resolveAspectRatioMode(user.aspectRatioMode);
                    const effectiveWm = resolveWatermarkConfig({
                      watermarkEnabled: user.watermarkEnabled,
                      watermarkText: user.watermarkText,
                      watermarkPosition: user.watermarkPosition,
                      watermarkFontSize: user.watermarkFontSize,
                      watermarkColor: user.watermarkColor,
                      watermarkOpacity: user.watermarkOpacity,
                      watermarkBox: user.watermarkBox,
                    });
                    const effectiveZoom = resolveZoomEffectConfig({
                      zoomEnabled: user.zoomEnabled,
                      zoomMode: user.zoomMode,
                      zoomType: user.zoomType,
                      zoomIntensity: user.zoomIntensity,
                      zoomMinScore: user.zoomMinScore,
                    });
                    const effectiveIo = resolveIntroOutroConfig({
                      introEnabled: user.introEnabled,
                      introText: user.introText,
                      introDuration: user.introDuration,
                      outroEnabled: user.outroEnabled,
                      outroText: user.outroText,
                      outroDuration: user.outroDuration,
                    });
                    const isCustom = (val: unknown) => val !== null && val !== undefined;

                    return (
                      <tr key={user.id} className="border-b border-slate-800 hover:bg-slate-800/30">
                        <td className="p-4">
                          <div className="font-medium text-white text-sm">
                            {user.telegramFirstName || "User"}
                            {user.telegramUsername && (
                              <span className="text-slate-400 ml-1">@{user.telegramUsername}</span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 font-mono">{user.telegramUserId}</div>
                          <div className="text-xs text-slate-500 mt-1">
                            {new Date(user.createdAt).toLocaleDateString("id-ID")}
                          </div>
                        </td>
                        <td className="p-4">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-sm font-bold ${isCustom(user.maxClips) ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-slate-700/50 text-slate-400"}`}>
                            {effectiveClips}
                            {isCustom(user.maxClips) && <span className="text-xs">✏️</span>}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className={`text-sm px-2 py-1 rounded ${isCustom(user.defaultPrivacy) ? "bg-blue-500/20 text-blue-400" : "text-slate-400"}`}>
                            {user.defaultPrivacy || "private"}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className={`text-xs px-2 py-1 rounded font-mono ${isCustom(user.aspectRatioMode) ? "bg-purple-500/20 text-purple-400" : "text-slate-400"}`}>
                            {effectiveMode}
                            {isCustom(user.aspectRatioMode) && " ✏️"}
                          </span>
                        </td>
                        <td className="p-4">
                          <div className={`text-sm ${effectiveWm.enabled ? "text-emerald-400" : "text-slate-500"}`}>
                            {effectiveWm.enabled ? `✅ "${effectiveWm.text.slice(0, 15)}"` : "❌"}
                            {isCustom(user.watermarkEnabled) && " ✏️"}
                          </div>
                          {isCustom(user.watermarkText) && (
                            <div className="text-xs text-slate-500 mt-1">Custom text ✏️</div>
                          )}
                        </td>
                        <td className="p-4">
                          <span className={`text-sm ${effectiveZoom.enabled ? "text-cyan-400" : "text-slate-500"}`}>
                            {effectiveZoom.enabled ? `✅ ${effectiveZoom.type}` : "❌"}
                            {isCustom(user.zoomEnabled) && " ✏️"}
                          </span>
                        </td>
                        <td className="p-4">
                          <div className="text-xs space-y-1">
                            <div className={effectiveIo.introEnabled ? "text-emerald-400" : "text-slate-500"}>
                              🎬 Intro: {effectiveIo.introEnabled ? "✅" : "❌"}
                              {isCustom(user.introEnabled) && " ✏️"}
                            </div>
                            <div className={effectiveIo.outroEnabled ? "text-emerald-400" : "text-slate-500"}>
                              🎭 Outro: {effectiveIo.outroEnabled ? "✅" : "❌"}
                              {isCustom(user.outroEnabled) && " ✏️"}
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          <span className={`text-sm ${user.youtubeConnected ? "text-emerald-400" : "text-slate-500"}`}>
                            {user.youtubeConnected ? "✅ Terhubung" : "❌ Tidak"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="p-4 bg-slate-800/30 border-t border-slate-800">
              <p className="text-xs text-slate-500">
                ✏️ = Setting custom per-user (override env var) &nbsp;|&nbsp;
                Tanpa ✏️ = menggunakan Railway env var default
              </p>
            </div>
          </div>
        )}

        {/* ── GLOBAL ENV DEFAULTS ── */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
          <h2 className="text-xl font-bold text-white mb-4">🌍 Railway Env Var — Global Defaults</h2>
          <p className="text-slate-400 text-sm mb-6">
            Nilai ini berlaku untuk semua user yang belum mengatur setting mereka sendiri.
            Ubah via Railway Dashboard → Variables.
          </p>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { label: "MAX_CLIPS", value: `${globalMaxClips} klip`, icon: "✂️", env: "MAX_CLIPS" },
              { label: "ASPECT_RATIO_MODE", value: getModeLabel(globalMode), icon: "📐", env: "ASPECT_RATIO_MODE" },
              { label: "WATERMARK_ENABLED", value: globalWm.enabled ? "✅ Aktif" : "❌ Nonaktif", icon: "💧", env: "WATERMARK_ENABLED" },
              { label: "WATERMARK_TEXT", value: `"${globalWm.text}"`, icon: "📝", env: "WATERMARK_TEXT" },
              { label: "WATERMARK_POSITION", value: globalWm.position, icon: "📍", env: "WATERMARK_POSITION" },
              { label: "ZOOM_EFFECT_ENABLED", value: globalZoom.enabled ? "✅ Aktif" : "❌ Nonaktif", icon: "🔍", env: "ZOOM_EFFECT_ENABLED" },
              { label: "ZOOM_EFFECT_TYPE", value: globalZoom.type, icon: "🔄", env: "ZOOM_EFFECT_TYPE" },
              { label: "INTRO_ENABLED", value: globalIo.introEnabled ? "✅ Aktif" : "❌ Nonaktif", icon: "▶️", env: "INTRO_ENABLED" },
              { label: "OUTRO_ENABLED", value: globalIo.outroEnabled ? "✅ Aktif" : "❌ Nonaktif", icon: "⏹️", env: "OUTRO_ENABLED" },
              { label: "THUMBNAIL_ENABLED", value: globalThumb.enabled ? "✅ Aktif" : "❌ Nonaktif", icon: "🖼️", env: "THUMBNAIL_ENABLED" },
              { label: "THUMBNAIL_MODE", value: globalThumb.mode, icon: "📸", env: "THUMBNAIL_MODE" },
              { label: "DEFAULT_PRIVACY", value: "private (hardcoded)", icon: "🔒", env: "—" },
            ].map((item) => (
              <div key={item.label} className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                <div className="flex items-center gap-2 mb-2">
                  <span>{item.icon}</span>
                  <span className="font-mono text-xs text-slate-400">{item.label}</span>
                </div>
                <div className="text-white font-semibold">{item.value}</div>
                {item.env !== "—" && (
                  <div className="mt-2 font-mono text-xs text-emerald-400">
                    {item.env}=...
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── RECENT JOBS ── */}
        {stats.recentJobs.length > 0 && (
          <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
            <div className="p-6 border-b border-slate-800">
              <h2 className="text-xl font-bold text-white">📊 Job Terbaru</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-800/50">
                    <th className="text-left p-4 text-slate-400 text-sm font-medium">Video</th>
                    <th className="text-left p-4 text-slate-400 text-sm font-medium">Platform</th>
                    <th className="text-left p-4 text-slate-400 text-sm font-medium">Status</th>
                    <th className="text-left p-4 text-slate-400 text-sm font-medium">Klip</th>
                    <th className="text-left p-4 text-slate-400 text-sm font-medium">Waktu</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentJobs.map((job) => {
                    const status = statusConfig[job.status] || statusConfig.queued;
                    const clips = (job.clips as ClipResult[] | null) || [];
                    return (
                      <tr key={job.id} className="border-b border-slate-800 hover:bg-slate-800/30">
                        <td className="p-4">
                          <div className="font-medium text-white text-sm max-w-xs truncate">
                            {job.videoTitle || "Memproses..."}
                          </div>
                          <div className="text-xs text-slate-500 font-mono truncate max-w-xs">
                            {job.sourceUrl.slice(0, 50)}...
                          </div>
                          <div className="text-xs text-slate-600 mt-1">
                            User: {job.telegramUserId}
                          </div>
                        </td>
                        <td className="p-4">
                          <span className="text-sm text-slate-300">{job.platform}</span>
                        </td>
                        <td className="p-4">
                          <span className={`text-xs px-2 py-1 rounded-full ${status.bg} ${status.color}`}>
                            {status.label}
                          </span>
                        </td>
                        <td className="p-4">
                          {clips.length > 0 ? (
                            <div className="text-sm">
                              <span className="text-white">{clips.length}</span>
                              {clips.some((c) => c.youtubeUrl) && (
                                <span className="text-slate-400 ml-1">
                                  ({clips.filter((c) => c.youtubeUrl).length} 📺)
                                </span>
                              )}
                            </div>
                          ) : "—"}
                        </td>
                        <td className="p-4 text-slate-400 text-sm">
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

        {/* ── TELEGRAM COMMANDS ── */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
          <h2 className="text-xl font-bold text-white mb-4">🤖 Perintah Bot Telegram</h2>
          <div className="grid md:grid-cols-2 gap-3">
            {[
              { cmd: "/start", desc: "Menu utama & sambutan", isNew: false },
              { cmd: "/settings", desc: "⚙️ Semua pengaturan per-akun — UTAMA!", isNew: true },
              { cmd: "/connect", desc: "Hubungkan YouTube Studio", isNew: false },
              { cmd: "/disconnect", desc: "Putuskan koneksi YouTube", isNew: false },
              { cmd: "/setwm @NamaChannel", desc: "Set teks watermark per-akun", isNew: true },
              { cmd: "/setintro Teks", desc: "Set teks intro & aktifkan", isNew: true },
              { cmd: "/setoutro Teks", desc: "Set teks outro & aktifkan", isNew: true },
              { cmd: "/status", desc: "Status job terbaru", isNew: false },
              { cmd: "/history", desc: "Riwayat semua job", isNew: false },
              { cmd: "/help", desc: "Panduan lengkap", isNew: false },
              { cmd: "/cancel", desc: "Info pembatalan job", isNew: false },
            ].map((item) => (
              <div
                key={item.cmd}
                className={`flex items-center gap-3 p-3 rounded-xl border ${
                  item.isNew
                    ? "border-emerald-500/30 bg-emerald-500/5"
                    : "border-slate-700/50 bg-slate-800/30"
                }`}
              >
                <code className={`text-sm font-mono px-2 py-1 rounded ${
                  item.isNew ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-700 text-slate-300"
                }`}>
                  {item.cmd}
                </code>
                <span className="text-slate-400 text-sm flex-1">{item.desc}</span>
                {item.isNew && (
                  <span className="text-xs bg-emerald-500 text-white px-2 py-0.5 rounded-full font-bold">
                    NEW
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── ENV VARS REFERENCE ── */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
          <h2 className="text-xl font-bold text-white mb-2">📋 Railway Variables Reference</h2>
          <p className="text-slate-400 text-sm mb-4">
            Semua env var ini berfungsi sebagai global default. User bisa override via /settings di Telegram.
          </p>
          <div className="font-mono text-xs space-y-1 bg-slate-950 rounded-xl p-4 border border-slate-800">
            {[
              { key: "# WAJIB", isSection: true },
              { key: "TELEGRAM_BOT_TOKEN", desc: "Token dari @BotFather", required: true },
              { key: "DATABASE_URL", desc: "PostgreSQL connection string", required: true },
              { key: "# YOUTUBE", isSection: true },
              { key: "GOOGLE_CLIENT_ID", desc: "Google OAuth Client ID" },
              { key: "GOOGLE_CLIENT_SECRET", desc: "Google OAuth Client Secret" },
              { key: "GOOGLE_REDIRECT_URI", desc: "https://app.railway.app/api/youtube/callback" },
              { key: "# AI & TRANSKRIPSI", isSection: true },
              { key: "OPENAI_API_KEY", desc: "GPT-4o + Whisper" },
              { key: "GEMINI_API_KEY", desc: "Google Gemini (alternatif)" },
              { key: "GROQ_API_KEY", desc: "Groq Whisper (gratis)" },
              { key: "# GLOBAL DEFAULTS (user bisa override via /settings)", isSection: true },
              { key: "MAX_CLIPS", desc: "1-10 klip per video (default: 5)" },
              { key: "ASPECT_RATIO_MODE", desc: "blur|crop|pad|stretch|none (default: blur)" },
              { key: "WATERMARK_ENABLED", desc: "true|false (default: true)" },
              { key: "WATERMARK_TEXT", desc: "@YourChannel ← UBAH INI!" },
              { key: "WATERMARK_POSITION", desc: "bottomright|bottomleft|topright|topleft" },
              { key: "ZOOM_EFFECT_ENABLED", desc: "true|false (default: true)" },
              { key: "ZOOM_EFFECT_TYPE", desc: "in|out|in-out|pulse (default: in)" },
              { key: "INTRO_ENABLED", desc: "true|false (default: false)" },
              { key: "INTRO_TEXT", desc: "Teks intro (default: AutoClip Bot)" },
              { key: "OUTRO_ENABLED", desc: "true|false (default: false)" },
              { key: "OUTRO_TEXT", desc: "Teks outro (default: Subscribe! 🔔)" },
              { key: "THUMBNAIL_ENABLED", desc: "true|false (default: true)" },
              { key: "THUMBNAIL_MODE", desc: "middle|best|start|custom" },
              { key: "# LAINNYA", isSection: true },
              { key: "NEXT_PUBLIC_APP_URL", desc: "URL Railway app kamu" },
              { key: "SETUP_SECRET", desc: "Secret untuk /api/webhook/setup" },
            ].map((item, i) => (
              "isSection" in item ? (
                <div key={i} className="text-slate-600 mt-3 mb-1">{item.key}</div>
              ) : (
                <div key={i} className="flex gap-2">
                  <span className={`w-6 text-center ${item.required ? "text-red-400" : "text-slate-600"}`}>
                    {item.required ? "●" : "○"}
                  </span>
                  <span className={`${item.required ? "text-yellow-400" : "text-slate-300"} min-w-[200px]`}>
                    {item.key}
                  </span>
                  <span className="text-slate-500"># {item.desc}</span>
                </div>
              )
            ))}
          </div>
        </div>

        {/* ── SETUP ── */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
          <h2 className="text-xl font-bold text-white mb-4">🚀 Setup Webhook</h2>
          <div className="space-y-3">
            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
              <div className="text-sm text-slate-400 mb-2">Setup Telegram Webhook (jalankan 1x setelah deploy):</div>
              <code className="text-emerald-400 text-sm">
                curl &quot;https://yourapp.railway.app/api/webhook/setup?secret=setup-autoclip-2024&quot;
              </code>
            </div>
            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
              <div className="text-sm text-slate-400 mb-2">Apply database schema:</div>
              <code className="text-emerald-400 text-sm">npx drizzle-kit push</code>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-slate-600 text-sm py-4">
          AutoClip Bot • Next.js + Grammy.js + PostgreSQL + FFmpeg + Railway
        </div>
      </div>
    </div>
  );
}
