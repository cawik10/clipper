import {
  pgTable,
  text,
  timestamp,
  integer,
  jsonb,
  serial,
  boolean,
} from "drizzle-orm/pg-core";

// ── Clip Jobs ─────────────────────────────────────────────────────────────────
export const clipJobs = pgTable("clip_jobs", {
  id: serial("id").primaryKey(),
  jobId: text("job_id").notNull().unique(),
  telegramUserId: text("telegram_user_id").notNull(),
  telegramChatId: text("telegram_chat_id").notNull(),
  telegramMessageId: integer("telegram_message_id"),
  sourceUrl: text("source_url").notNull(),
  platform: text("platform").notNull(), // youtube | facebook | tiktok | instagram
  status: text("status").notNull().default("queued"),
  // queued | downloading | analyzing | clipping | uploading | done | error
  videoTitle: text("video_title"),
  videoDuration: integer("video_duration"),
  downloadPath: text("download_path"),
  transcriptPath: text("transcript_path"),
  clips: jsonb("clips").$type<ClipResult[]>(),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── YouTube OAuth Tokens ──────────────────────────────────────────────────────
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

// ── TikTok OAuth Tokens ───────────────────────────────────────────────────────
export const tiktokTokens = pgTable("tiktok_tokens", {
  id: serial("id").primaryKey(),
  telegramUserId: text("telegram_user_id").notNull().unique(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  openId: text("open_id").notNull(),           // TikTok user's open_id
  expiresAt: timestamp("expires_at").notNull(),
  refreshExpiresAt: timestamp("refresh_expires_at").notNull(),
  scope: text("scope"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── Uploaded Videos ───────────────────────────────────────────────────────────
export const uploadedVideos = pgTable("uploaded_videos", {
  id: serial("id").primaryKey(),
  jobId: text("job_id").notNull(),
  telegramUserId: text("telegram_user_id").notNull(),
  // YouTube
  youtubeVideoId: text("youtube_video_id"),
  youtubeUrl: text("youtube_url"),
  // TikTok
  tiktokPublishId: text("tiktok_publish_id"),
  tiktokUrl: text("tiktok_url"),
  // Common
  title: text("title").notNull(),
  description: text("description"),
  tags: text("tags").array(),
  privacyStatus: text("privacy_status").notNull().default("private"),
  clipIndex: integer("clip_index"),
  startTime: integer("start_time"),
  endTime: integer("end_time"),
  duration: integer("duration"),
  uploadStatus: text("upload_status").notNull().default("pending"),
  // pending | uploading | done | error
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── User Settings ─────────────────────────────────────────────────────────────
export const userSettings = pgTable("user_settings", {
  id: serial("id").primaryKey(),
  telegramUserId: text("telegram_user_id").notNull().unique(),
  // YouTube
  youtubeConnected: boolean("youtube_connected").default(false),
  defaultPrivacy: text("default_privacy").default("private"),
  // TikTok
  tiktokConnected: boolean("tiktok_connected").default(false),
  tiktokPrivacy: text("tiktok_privacy").default("SELF_ONLY"),
  // tiktok privacy: PUBLIC_TO_EVERYONE | MUTUAL_FOLLOW_FRIENDS | SELF_ONLY
  tiktokAutoUpload: boolean("tiktok_auto_upload").default(true),
  // General
  maxClips: integer("max_clips").default(3),
  minDuration: integer("min_duration").default(20),
  maxDuration: integer("max_duration").default(40),
  language: text("language").default("id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── Shared Types ──────────────────────────────────────────────────────────────
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
  // YouTube
  youtubeVideoId?: string;
  youtubeUrl?: string;
  // TikTok
  tiktokPublishId?: string;
  tiktokUrl?: string;
}
