import { NextResponse } from "next/server";
import { db } from "@/db";
import { clipJobs } from "@/db/schema";
import { sql } from "drizzle-orm";
import {
  getAspectRatioMode,
  getModeLabel,
  getThumbnailConfig,
  getThumbnailModeLabel,
} from "@/lib/video-config";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Test DB connection
    await db.select({ count: sql`count(*)` }).from(clipJobs);

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const googleClientId = process.env.GOOGLE_CLIENT_ID;
    const openaiKey = process.env.OPENAI_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;

    const aspectRatioMode = getAspectRatioMode();
    const thumbConfig = getThumbnailConfig();

    return NextResponse.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      services: {
        database: "connected",
        telegram: botToken ? "configured" : "missing TELEGRAM_BOT_TOKEN",
        google_oauth: googleClientId
          ? "configured"
          : "missing GOOGLE_CLIENT_ID",
        ai: openaiKey
          ? "openai"
          : geminiKey
            ? "gemini"
            : groqKey
              ? "groq (transcription only)"
              : "not configured (using fallback)",
      },
      features: {
        video_clipper: true,
        ai_analysis: !!(openaiKey || geminiKey),
        transcription: !!(openaiKey || groqKey),
        youtube_upload: !!googleClientId,
        platforms: ["youtube", "facebook", "tiktok", "instagram"],
        aspect_ratio: {
          mode: aspectRatioMode,
          label: getModeLabel(aspectRatioMode),
          env_var: "ASPECT_RATIO_MODE",
          available_modes: ["blur", "crop", "pad", "stretch", "none"],
          description:
            "Set ASPECT_RATIO_MODE env var to change 9:16 conversion mode. 'blur' = background blur (recommended).",
        },
        thumbnail: {
          enabled: thumbConfig.enabled,
          mode: thumbConfig.mode,
          mode_label: getThumbnailModeLabel(thumbConfig.mode),
          quality: thumbConfig.quality,
          width: thumbConfig.width,
          height: thumbConfig.height,
          env_vars: {
            THUMBNAIL_ENABLED: "true | false (default: true)",
            THUMBNAIL_MODE: "middle | best | start | custom (default: middle)",
            THUMBNAIL_QUALITY: "1-31, makin kecil makin bagus (default: 5)",
            THUMBNAIL_WIDTH: "lebar output (default: 1280)",
            THUMBNAIL_HEIGHT: "tinggi output (default: 720, 0=auto)",
            THUMBNAIL_OFFSET_SECONDS: "offset detik untuk mode custom (default: 5)",
          },
          description:
            "Auto-generate thumbnail dari setiap klip menggunakan FFmpeg. Mudah dikonfigurasi via env vars di Railway.",
        },
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
