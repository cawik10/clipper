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

// Types
export type UserSettingsRow = typeof userSettings.$inferSelect;
export type DriveTokenRow = typeof driveTokens.$inferSelect;

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
  filePath?: string;
  thumbnailPath?: string;
  youtubeVideoId?: string;
  youtubeUrl?: string;
  driveFileId?: string;
  driveUrl?: string;
}
