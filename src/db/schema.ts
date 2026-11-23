import {
  pgTable,
  text,
  timestamp,
  integer,
  jsonb,
  serial,
  boolean,
} from "drizzle-orm/pg-core";

export const clipJobs = pgTable("clip_jobs", {
  id: serial("id").primaryKey(),
  jobId: text("job_id").notNull().unique(),
  telegramUserId: text("telegram_user_id").notNull(),
  telegramChatId: text("telegram_chat_id").notNull(),
  telegramMessageId: integer("telegram_message_id"),
  sourceUrl: text("source_url").notNull(),
  platform: text("platform").notNull(), // youtube | facebook | tiktok | instagram
  status: text("status").notNull().default("queued"), // queued | downloading | analyzing | clipping | uploading | done | error
  videoTitle: text("video_title"),
  videoDuration: integer("video_duration"),
  downloadPath: text("download_path"),
  transcriptPath: text("transcript_path"),
  clips: jsonb("clips").$type<ClipResult[]>(),
  errorMessage: text("error_message"),
  // 📡 Auto-Monitor Channel/Playlist (BARU!) — kolom tambahan nullable, TIDAK
  // mengubah kolom lain di atas. Diisi otomatis kalau job ini dibuat oleh
  // worker monitoring (bukan dari link manual yang dikirim user ke bot).
  // Lihat src/db/schema.ts → monitoredChannels & src/lib/channel-monitor.ts.
  sourceMonitorId: integer("source_monitor_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// =====================================================================
// REAL-TIME PROGRESS TRACKING (Telegram step-by-step job updates)
// =====================================================================
// Tabel tambahan — TIDAK mengubah tabel/kolom yang sudah ada di atas,
// jadi dashboard web (src/app/page.tsx) tidak terpengaruh sama sekali.
// Setiap kali status job berubah (download/transkripsi/analisis/clip/
// upload/selesai/gagal), satu baris dicatat di sini sehingga progres
// bisa ditampilkan step-by-step secara real-time di Telegram dan bisa
// dipakai lagi untuk fitur lain di masa depan tanpa migrasi ulang.
// Lihat src/lib/progress-config.ts untuk konfigurasi tampilan/step yang
// mudah diubah.
export const jobProgressEvents = pgTable("job_progress_events", {
  id: serial("id").primaryKey(),
  jobId: text("job_id").notNull(),
  stepId: text("step_id").notNull(), // lihat PROGRESS_STEPS di progress-config.ts
  stepLabel: text("step_label").notNull(),
  state: text("state").notNull(), // pending | active | done | error
  message: text("message"),
  percent: integer("percent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const youtubeTokens = pgTable("youtube_tokens", {
  id: serial("id").primaryKey(),
  telegramUserId: text("telegram_user_id").notNull().unique(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  scope: text("scope"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const uploadedVideos = pgTable("uploaded_videos", {
  id: serial("id").primaryKey(),
  jobId: text("job_id").notNull(),
  telegramUserId: text("telegram_user_id").notNull(),
  youtubeVideoId: text("youtube_video_id"),
  youtubeUrl: text("youtube_url"),
  title: text("title").notNull(),
  description: text("description"),
  tags: text("tags").array(),
  privacyStatus: text("privacy_status").notNull().default("private"),
  clipIndex: integer("clip_index"),
  startTime: integer("start_time"),
  endTime: integer("end_time"),
  duration: integer("duration"),
  uploadStatus: text("upload_status").notNull().default("pending"), // pending | uploading | done | error
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const userSettings = pgTable("user_settings", {
  id: serial("id").primaryKey(),
  telegramUserId: text("telegram_user_id").notNull().unique(),
  youtubeConnected: boolean("youtube_connected").default(false),
  defaultPrivacy: text("default_privacy").default("private"),
  // Default changed to 5 — can also be overridden by MAX_CLIPS env var
  maxClips: integer("max_clips").default(5),
  // Durasi klip pilihan tetap: 15 | 20 | 30 | 40 | 60 detik (lihat src/lib/video-config.ts).
  // Bisa juga di-override via env var CLIP_DURATION. Default: 30.
  clipDuration: integer("clip_duration").default(30),
  // minDuration/maxDuration kini dihitung otomatis dari clipDuration (± toleransi)
  // tetap disimpan untuk kompatibilitas data lama.
  minDuration: integer("min_duration").default(20),
  maxDuration: integer("max_duration").default(40),
  language: text("language").default("id"),
  // =====================================================================
  // 🎯 CUSTOM NICHE PROMPT (BARU!)
  // =====================================================================
  // Prompt khusus milik user untuk mengarahkan AI Analysis, misal:
  // "fokus ke momen lucu" atau "fokus ke insight bisnis".
  // NULL = pakai DEFAULT_NICHE_PROMPT (env var) atau tanpa arahan khusus.
  // Diatur via Telegram command /niche atau PATCH /api/settings.
  // Lihat src/lib/niche-prompt.ts untuk konfigurasi lengkap — mudah diubah
  // tanpa menyentuh bagian lain dari aplikasi.
  nichePrompt: text("niche_prompt"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Google Drive connection + destination per Telegram user.
// NOTE: tabel ini juga dibuat otomatis saat runtime (lihat src/lib/drive-uploader.ts → ensureDriveTable)
// jadi di Railway tidak wajib menjalankan `drizzle-kit push`.
export const driveTokens = pgTable("drive_tokens", {
  id: serial("id").primaryKey(),
  telegramUserId: text("telegram_user_id").notNull().unique(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  scope: text("scope"),
  googleEmail: text("google_email"),
  // Folder tujuan yang dipilih user via /drivefolder (null = pakai env / folder otomatis)
  folderId: text("folder_id"),
  folderName: text("folder_name"),
  // Folder yang dibuat otomatis oleh bot (fallback terakhir)
  autoFolderId: text("auto_folder_id"),
  autoUpload: boolean("auto_upload").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// =====================================================================
// 🧹 DUPLICATE / REPETITIVE CLIP FILTER (BARU!)
// =====================================================================
// Tabel tambahan — TIDAK mengubah tabel/kolom yang sudah ada di atas,
// jadi dashboard web (src/app/page.tsx) dan alur job yang sudah ada
// sama sekali tidak terpengaruh.
//
// Setiap kali sebuah klip BERHASIL dipotong, "sidik jari" kontennya
// (judul, deskripsi, alasan AI, serta rentang waktu) disimpan di
// `clip_fingerprints`. Saat source video yang sama (atau mirip) diproses
// lagi — baik berkali-kali oleh satu user maupun oleh beberapa user —
// bot akan membandingkan momen hasil AI Analysis terhadap sidik jari lama
// dan melewati (skip) klip yang kontennya sudah terlalu mirip, supaya
// tidak membuang kuota AI/FFmpeg/YouTube untuk konten yang berulang.
//
// Event klip yang di-skip dicatat di `duplicate_clip_skips` supaya bisa
// ditampilkan di dashboard & dipakai untuk audit/tuning threshold.
//
// Konfigurasi (semua via Railway Variables, lihat src/lib/duplicate-filter-config.ts):
//   DUPLICATE_FILTER_ENABLED=true
//   DUPLICATE_FILTER_SCOPE=source              // source | user | global
//   DUPLICATE_FILTER_TEXT_THRESHOLD=0.72        // 0.0 - 1.0
//   DUPLICATE_FILTER_TIME_OVERLAP_THRESHOLD=0.6 // 0.0 - 1.0
//   DUPLICATE_FILTER_LOOKBACK_DAYS=30           // 0 = tanpa batas waktu
export const clipFingerprints = pgTable("clip_fingerprints", {
  id: serial("id").primaryKey(),
  sourceKey: text("source_key").notNull(), // URL sumber yang sudah dinormalisasi (lihat normalizeSourceUrl)
  sourceUrl: text("source_url").notNull(),
  telegramUserId: text("telegram_user_id").notNull(),
  jobId: text("job_id").notNull(),
  clipIndex: integer("clip_index"),
  title: text("title").notNull(),
  description: text("description"),
  reason: text("reason"),
  startTime: integer("start_time").notNull(),
  endTime: integer("end_time").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const duplicateClipSkips = pgTable("duplicate_clip_skips", {
  id: serial("id").primaryKey(),
  jobId: text("job_id").notNull(),
  telegramUserId: text("telegram_user_id").notNull(),
  sourceKey: text("source_key").notNull(),
  sourceUrl: text("source_url").notNull(),
  candidateTitle: text("candidate_title").notNull(),
  candidateStart: integer("candidate_start").notNull(),
  candidateEnd: integer("candidate_end").notNull(),
  matchedJobId: text("matched_job_id"),
  matchedTitle: text("matched_title"),
  textScore: integer("text_score"), // disimpan sebagai persen (0-100) agar tidak perlu kolom numeric
  timeScore: integer("time_score"), // persen (0-100)
  combinedScore: integer("combined_score"), // persen (0-100)
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// =====================================================================
// 🗓️ SCHEDULER / QUEUE POSTING (BARU!)
// =====================================================================
// Tabel tambahan — TIDAK mengubah tabel/kolom yang sudah ada di atas,
// jadi dashboard web (src/app/page.tsx) dan alur job lama sama sekali
// tidak terpengaruh.
//
// Sebelum upload ke YouTube, user sekarang ditanya lewat Telegram:
//   1) 📤 Post sekarang           → upload langsung (perilaku lama)
//   2) 🤖 Jadwalkan (rekomendasi AI) → upload otomatis di jam optimal
//      hasil analisis AI berdasarkan niche (lihat src/lib/scheduler.ts)
//   3) 🕐 Atur jam custom         → user menentukan sendiri jam uploadnya
//
// Pilihan #2 dan #3 akan membuat satu baris di tabel ini (status=pending).
// Worker di src/lib/scheduler-worker.ts berjalan berkala (lihat
// src/lib/scheduler-config.ts untuk interval & konfigurasi lain yang mudah
// diubah) dan akan mem-publish klip (upload YouTube + Google Drive) begitu
// `scheduled_at` tercapai, lalu mengirim notifikasi hasilnya ke Telegram.
export const scheduledUploads = pgTable("scheduled_uploads", {
  id: serial("id").primaryKey(),
  jobId: text("job_id").notNull(),
  telegramUserId: text("telegram_user_id").notNull(),
  telegramChatId: text("telegram_chat_id").notNull(),
  // now | ai_recommended | custom
  mode: text("mode").notNull().default("custom"),
  scheduledAt: timestamp("scheduled_at").notNull(),
  // pending | processing | done | error | cancelled
  status: text("status").notNull().default("pending"),
  // Alasan/insight singkat dari AI (jika mode = ai_recommended), ditampilkan ke user.
  recommendationReason: text("recommendation_reason"),
  attempts: integer("attempts").notNull().default(0),
  errorMessage: text("error_message"),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Types
export type UserSettingsRow = typeof userSettings.$inferSelect;
export type DriveTokenRow = typeof driveTokens.$inferSelect;
export type ClipFingerprintRow = typeof clipFingerprints.$inferSelect;
export type DuplicateClipSkipRow = typeof duplicateClipSkips.$inferSelect;
export type ScheduledUploadRow = typeof scheduledUploads.$inferSelect;

// =====================================================================
// 📡 AUTO-MONITOR CHANNEL/PLAYLIST (BARU!)
// =====================================================================
// Tabel tambahan — TIDAK mengubah tabel/kolom lain yang sudah ada di atas,
// jadi dashboard web (src/app/page.tsx) dan alur job manual (kirim link ke
// bot Telegram) sama sekali tidak terpengaruh / tidak berubah perilakunya.
//
// Fitur: user mendaftarkan channel atau playlist YouTube lewat Telegram
// (`/monitor <url>`). Worker berkala (src/lib/channel-monitor-worker.ts)
// memantau upload baru dari channel/playlist tersebut dan OTOMATIS
// menjalankan pipeline AutoClip penuh (download → transkripsi → analisis
// AI → potong klip → upload YouTube Studio) begitu video baru terdeteksi —
// user TIDAK perlu mengirim link secara manual lagi.
//
// Mudah diganti/dikonfigurasi — 100% lewat Railway Variables, satu-satunya
// tempat yang perlu disentuh untuk tuning adalah
// src/lib/channel-monitor-config.ts:
//   CHANNEL_MONITOR_ENABLED=true                   // matikan/nyalakan seluruh fitur
//   CHANNEL_MONITOR_POLL_INTERVAL_MS=300000         // seberapa sering worker "bangun" (ms)
//   CHANNEL_MONITOR_DEFAULT_INTERVAL_MINUTES=10     // default jeda cek per channel (menit)
//   CHANNEL_MONITOR_MAX_PER_USER=5                  // batas jumlah channel/playlist per user
//   CHANNEL_MONITOR_MAX_NEW_VIDEOS_PER_RUN=2        // batas video baru diproses per channel/run
//   CHANNEL_MONITOR_PROCESS_LATEST_ON_ADD=false     // true = langsung proses video terbaru saat didaftarkan
//   CHANNEL_MONITOR_AUTO_UPLOAD_DEFAULT=true        // auto upload ke YouTube Studio tiap monitor baru
//   YOUTUBE_API_KEY=                                // opsional — tanpa ini otomatis fallback ke yt-dlp
//
// Mengganti/menambah sumber platform lain (mis. TikTok) di masa depan
// hanya perlu menyentuh src/lib/channel-monitor.ts (fungsi resolve &
// fetch-video), tabel & worker ini tidak perlu diubah sama sekali.
export const monitoredChannels = pgTable("monitored_channels", {
  id: serial("id").primaryKey(),
  telegramUserId: text("telegram_user_id").notNull(),
  telegramChatId: text("telegram_chat_id").notNull(),
  platform: text("platform").notNull().default("youtube"), // youtube (mudah ditambah platform lain nanti)
  sourceType: text("source_type").notNull().default("channel"), // channel | playlist
  inputUrl: text("input_url").notNull(), // URL asli yang dikirim user via /monitor
  externalId: text("external_id").notNull(), // channelId (UCxxxx) atau playlistId
  uploadsPlaylistId: text("uploads_playlist_id"), // cache "UU..." playlist upload channel (hemat kuota API)
  title: text("title"), // nama channel/playlist hasil resolve (ditampilkan di Telegram/dashboard)
  intervalMinutes: integer("interval_minutes").notNull().default(10),
  autoUpload: boolean("auto_upload").notNull().default(true),
  enabled: boolean("enabled").notNull().default(true),
  lastVideoId: text("last_video_id"),
  lastVideoPublishedAt: timestamp("last_video_published_at"),
  lastCheckedAt: timestamp("last_checked_at"),
  lastError: text("last_error"),
  totalVideosProcessed: integer("total_videos_processed").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Riwayat video yang sudah terdeteksi/diproses per monitor — mencegah video
// yang sama diproses dua kali (idempoten) & jadi bahan statistik dashboard.
export const monitoredChannelVideos = pgTable("monitored_channel_videos", {
  id: serial("id").primaryKey(),
  monitorId: integer("monitor_id").notNull(),
  videoId: text("video_id").notNull(),
  jobId: text("job_id"), // relasi longgar ke clip_jobs.job_id (diisi kalau berhasil di-enqueue)
  title: text("title"),
  publishedAt: timestamp("published_at"),
  status: text("status").notNull().default("queued"), // queued | processing | done | error | skipped
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type MonitoredChannelRow = typeof monitoredChannels.$inferSelect;
export type MonitoredChannelVideoRow = typeof monitoredChannelVideos.$inferSelect;

// =====================================================================
// 📈 AI ANALYTICS & FEEDBACK LOOP (BARU!)
// =====================================================================
// Tabel tambahan — TIDAK mengubah tabel/kolom yang sudah ada, jadi dashboard
// web & alur job lama tidak terpengaruh. Tabel ini juga dibuat otomatis saat
// runtime (src/lib/analytics-store.ts → ensureAnalyticsTables) sehingga di
// Railway tidak wajib menjalankan `drizzle-kit push`.
// Konfigurasi lengkap: src/lib/analytics-config.ts (semua via Railway Variables).

// Satu baris per klip yang sudah diupload ke YouTube + statistik terbarunya.
export const clipPerformance = pgTable("clip_performance", {
  id: serial("id").primaryKey(),
  youtubeVideoId: text("youtube_video_id").notNull().unique(),
  jobId: text("job_id").notNull(),
  telegramUserId: text("telegram_user_id").notNull(),
  clipIndex: integer("clip_index"),
  title: text("title").notNull(),
  niche: text("niche").notNull().default("Umum"), // label niche hasil klasifikasi
  viralScore: integer("viral_score"),
  duration: integer("duration"),
  hook: text("hook"),
  sourceTitle: text("source_title"),
  views: integer("views").notNull().default(0),
  likes: integer("likes").notNull().default(0),
  comments: integer("comments").notNull().default(0),
  // views saat laporan mingguan terakhir → dipakai menghitung pertumbuhan mingguan
  viewsBaseline: integer("views_baseline").notNull().default(0),
  statsSource: text("stats_source"), // api | manual
  lastSyncedAt: timestamp("last_synced_at"),
  syncError: text("sync_error"),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Preferensi & hasil belajar AI per user Telegram.
export const analyticsUserState = pgTable("analytics_user_state", {
  id: serial("id").primaryKey(),
  telegramUserId: text("telegram_user_id").notNull().unique(),
  telegramChatId: text("telegram_chat_id"),
  weeklyReportEnabled: boolean("weekly_report_enabled").notNull().default(true),
  learningEnabled: boolean("learning_enabled").notNull().default(true),
  // Prompt hasil belajar yang AKTIF dipakai sebagai pengganti DEFAULT_NICHE_PROMPT.
  learnedPrompt: text("learned_prompt"),
  learnedInsights: text("learned_insights"), // JSON array string
  learnedAt: timestamp("learned_at"),
  learnedSampleSize: integer("learned_sample_size"),
  lastReportKey: text("last_report_key"), // mis. tanggal lokal laporan → cegah kirim ganda
  lastReportAt: timestamp("last_report_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Riwayat proses belajar (audit + bahan tampilan dashboard).
export const analyticsLearningLog = pgTable("analytics_learning_log", {
  id: serial("id").primaryKey(),
  telegramUserId: text("telegram_user_id").notNull(),
  previousPrompt: text("previous_prompt"),
  newPrompt: text("new_prompt").notNull(),
  insights: text("insights"), // JSON array string
  sampleSize: integer("sample_size").notNull().default(0),
  topNiche: text("top_niche"),
  method: text("method").notNull().default("ai"), // ai | heuristic
  applied: boolean("applied").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// 🩺 Auto-Title Doctor (BARU!) — riwayat penggantian judul klip ber-views rendah.
// Dibuat otomatis saat runtime (src/lib/auto-title-doctor.ts → ensureRetitleTable).
export const clipRetitleLog = pgTable("clip_retitle_log", {
  id: serial("id").primaryKey(),
  youtubeVideoId: text("youtube_video_id").notNull(),
  telegramUserId: text("telegram_user_id").notNull(),
  oldTitle: text("old_title").notNull(),
  newTitle: text("new_title"),
  hashtags: text("hashtags"), // dipisah spasi, mis. "#a #b"
  viewsAtRetitle: integer("views_at_retitle").notNull().default(0),
  hoursSinceUpload: integer("hours_since_upload"),
  status: text("status").notNull(), // success | dry_run | failed
  errorKind: text("error_kind"), // permission | quota | ai | youtube
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ✂️ Auto-Prune Klip Gagal (BARU!) — usulan sembunyikan/hapus klip sepi; keputusan ada di tangan user.
// Dibuat otomatis saat runtime (src/lib/auto-prune.ts → ensurePruneTable).
export const clipPruneSuggestion = pgTable("clip_prune_suggestion", {
  id: serial("id").primaryKey(),
  youtubeVideoId: text("youtube_video_id").notNull().unique(),
  telegramUserId: text("telegram_user_id").notNull(),
  title: text("title").notNull(),
  views: integer("views").notNull().default(0),
  ageDays: integer("age_days").notNull().default(0),
  retitleCount: integer("retitle_count").notNull().default(0),
  status: text("status").notNull().default("pending"), // pending | hidden | deleted | kept
  lastError: text("last_error"),
  notifiedCount: integer("notified_count").notNull().default(0),
  lastNotifiedAt: timestamp("last_notified_at"),
  decidedAt: timestamp("decided_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type ClipPruneSuggestionRow = typeof clipPruneSuggestion.$inferSelect;

export type ClipRetitleLogRow = typeof clipRetitleLog.$inferSelect;

export type ClipPerformanceRow = typeof clipPerformance.$inferSelect;
export type AnalyticsUserStateRow = typeof analyticsUserState.$inferSelect;
export type AnalyticsLearningLogRow = typeof analyticsLearningLog.$inferSelect;

// =====================================================================
// 🛡️ SOURCE CREDIT & COPYRIGHT GUARD (BARU!)
// =====================================================================
// Tabel tambahan — TIDAK mengubah tabel/kolom yang sudah ada. Dibuat otomatis
// saat runtime (lihat ensureSourceGuardTables di src/lib/source-guard.ts),
// jadi tidak wajib `drizzle-kit push`. Konfigurasi: src/lib/source-guard-config.ts
export const sourceGuardLog = pgTable("source_guard_log", {
  id: serial("id").primaryKey(),
  jobId: text("job_id").notNull(),
  telegramUserId: text("telegram_user_id").notNull(),
  sourceKey: text("source_key").notNull(), // hasil normalizeSourceUrl (mis. youtube:<id>)
  sourceUrl: text("source_url").notNull(),
  sourceTitle: text("source_title"),
  channelId: text("channel_id"),
  channelName: text("channel_name"),
  monitorId: integer("monitor_id"),
  mode: text("mode").notNull().default("warn"),
  decision: text("decision").notNull().default("allowed"), // allowed | warned | blocked
  violations: jsonb("violations"), // [{ code, message }]
  clipsCount: integer("clips_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const sourceWhitelist = pgTable("source_whitelist", {
  id: serial("id").primaryKey(),
  telegramUserId: text("telegram_user_id").notNull(),
  entry: text("entry").notNull(), // sudah dinormalisasi (huruf kecil, tanpa @ / URL)
  label: text("label"), // teks asli yang diketik user
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type SourceGuardLogRow = typeof sourceGuardLog.$inferSelect;
export type SourceWhitelistRow = typeof sourceWhitelist.$inferSelect;

// =====================================================================
// 🛠️ ADMIN PANEL TELEGRAM (BARU!) — tabel tambahan, TIDAK mengubah tabel lain.
// Juga dibuat OTOMATIS saat runtime (ensureAdminTables di src/lib/admin-store.ts),
// jadi tidak wajib `drizzle-kit push`. Konfigurasi: src/lib/admin-config.ts
// =====================================================================
export const adminUsers = pgTable("admin_users", {
  telegramUserId: text("telegram_user_id").primaryKey(),
  chatId: text("chat_id"),
  username: text("username"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  isBanned: boolean("is_banned").notNull().default(false),
  banReason: text("ban_reason"),
  bannedAt: timestamp("banned_at"),
  bannedBy: text("banned_by"),
  quotaOverride: integer("quota_override"), // NULL = pakai ADMIN_DEFAULT_QUOTA, 0 = tanpa batas
  firstSeen: timestamp("first_seen").defaultNow().notNull(),
  lastSeen: timestamp("last_seen").defaultNow().notNull(),
});

export const adminBroadcasts = pgTable("admin_broadcasts", {
  id: serial("id").primaryKey(),
  adminId: text("admin_id").notNull(),
  message: text("message").notNull(),
  total: integer("total").notNull().default(0),
  sent: integer("sent").notNull().default(0),
  failed: integer("failed").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  finishedAt: timestamp("finished_at"),
});

export interface ClipResult {
  index: number;
  startTime: number;
  endTime: number;
  duration: number;
  title: string;
  description: string;
  tags: string[];
  viralScore: number;
  reason: string;
  // 🪝 AI Hook Overlay (BARU!) — teks pembuka 1-2 detik pertama, di-generate AI
  // bersamaan dengan analisis momen. Opsional & disimpan di jsonb `clips`
  // (tidak perlu migrasi). Lihat src/lib/hook-config.ts.
  hook?: string;
  // 💬 Auto-First Comment (BARU!) — komentar pancingan hasil AI + hasil posting
  // via commentThreads.insert. Opsional & disimpan di jsonb `clips` (tanpa migrasi).
  // Lihat src/lib/auto-comment-config.ts & src/lib/auto-comment.ts.
  firstComment?: string;
  firstCommentId?: string;
  firstCommentUrl?: string;
  firstCommentStatus?: "posted" | "failed" | "skipped";
  filePath?: string;
  thumbnailPath?: string;
  youtubeVideoId?: string;
  youtubeUrl?: string;
  driveFileId?: string;
  driveUrl?: string;
}
