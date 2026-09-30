import {
  pgTable,
  text,
  timestamp,
  integer,
  jsonb,
  serial,
  boolean,
  real,
} from "drizzle-orm/pg-core";

// ─── CLIP JOBS ─────────────────────────────────────────────────────────────
export const clipJobs = pgTable("clip_jobs", {
  id: serial("id").primaryKey(),
  jobId: text("job_id").notNull().unique(),
  telegramUserId: text("telegram_user_id").notNull(),
  telegramChatId: text("telegram_chat_id").notNull(),
  telegramMessageId: integer("telegram_message_id"),
  sourceUrl: text("source_url").notNull(),
  platform: text("platform").notNull(),
  status: text("status").notNull().default("queued"),
  videoTitle: text("video_title"),
  videoDuration: integer("video_duration"),
  downloadPath: text("download_path"),
  transcriptPath: text("transcript_path"),
  clips: jsonb("clips").$type<ClipResult[]>(),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── YOUTUBE TOKENS ────────────────────────────────────────────────────────
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

// ─── UPLOADED VIDEOS ───────────────────────────────────────────────────────
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
  uploadStatus: text("upload_status").notNull().default("pending"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── USER SETTINGS (PER-USER, PER-TELEGRAM-ID) ─────────────────────────────
// Every setting here can be overridden per Telegram user.
// Railway env vars act as global defaults when a per-user value is NULL.
export const userSettings = pgTable("user_settings", {
  id: serial("id").primaryKey(),
  telegramUserId: text("telegram_user_id").notNull().unique(),
  telegramUsername: text("telegram_username"),
  telegramFirstName: text("telegram_first_name"),

  // YouTube
  youtubeConnected: boolean("youtube_connected").default(false),
  defaultPrivacy: text("default_privacy").default("private"),

  // Clip settings
  maxClips: integer("max_clips").default(5),
  minDuration: integer("min_duration").default(20),
  maxDuration: integer("max_duration").default(40),
  language: text("language").default("id"),

  // Aspect ratio: blur | crop | pad | stretch | none
  aspectRatioMode: text("aspect_ratio_mode"),

  // Watermark
  watermarkEnabled: boolean("watermark_enabled"),
  watermarkText: text("watermark_text"),
  watermarkPosition: text("watermark_position"),
  watermarkFontSize: integer("watermark_font_size"),
  watermarkColor: text("watermark_color"),
  watermarkOpacity: real("watermark_opacity"),
  watermarkBox: boolean("watermark_box"),

  // Thumbnail
  thumbnailEnabled: boolean("thumbnail_enabled"),
  thumbnailMode: text("thumbnail_mode"),
  thumbnailQuality: integer("thumbnail_quality"),

  // Zoom effect
  zoomEnabled: boolean("zoom_enabled"),
  zoomMode: text("zoom_mode"),
  zoomType: text("zoom_type"),
  zoomIntensity: real("zoom_intensity"),
  zoomMinScore: integer("zoom_min_score"),

  // Intro / Outro
  introEnabled: boolean("intro_enabled"),
  introText: text("intro_text"),
  introDuration: integer("intro_duration"),
  outroEnabled: boolean("outro_enabled"),
  outroText: text("outro_text"),
  outroDuration: integer("outro_duration"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── TYPES ─────────────────────────────────────────────────────────────────
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
}

export type UserSettingsRow = typeof userSettings.$inferSelect;
