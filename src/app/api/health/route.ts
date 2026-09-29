import { NextResponse } from "next/server";
import { db } from "@/db";
import { clipJobs } from "@/db/schema";
import { sql } from "drizzle-orm";
import {
  getAspectRatioMode,
  getModeLabel,
  getThumbnailConfig,
  getThumbnailModeLabel,
  getWatermarkConfig,
  getWatermarkPositionLabel,
  getIntroOutroConfig,
  getZoomEffectConfig,
  getZoomEffectLabel,
} from "@/lib/video-config";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.select({ count: sql`count(*)` }).from(clipJobs);

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const googleClientId = process.env.GOOGLE_CLIENT_ID;
    const openaiKey = process.env.OPENAI_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;

    const aspectRatioMode = getAspectRatioMode();
    const thumbConfig = getThumbnailConfig();
    const wmConfig = getWatermarkConfig();
    const ioCfg = getIntroOutroConfig();
    const zoomCfg = getZoomEffectConfig();

    return NextResponse.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      services: {
        database: "connected",
        telegram: botToken ? "configured" : "missing TELEGRAM_BOT_TOKEN",
        google_oauth: googleClientId ? "configured" : "missing GOOGLE_CLIENT_ID",
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
            THUMBNAIL_QUALITY: "1-31 (default: 5)",
            THUMBNAIL_WIDTH: "lebar output (default: 1280)",
            THUMBNAIL_HEIGHT: "tinggi output (default: 720, 0=auto)",
            THUMBNAIL_OFFSET_SECONDS: "offset untuk mode custom (default: 5)",
          },
        },
        watermark: {
          enabled: wmConfig.enabled,
          text: wmConfig.text,
          position: wmConfig.position,
          position_label: getWatermarkPositionLabel(wmConfig.position),
          font_size: wmConfig.fontSize,
          color: wmConfig.color,
          opacity: wmConfig.opacity,
          box: wmConfig.box,
          has_image: !!wmConfig.imagePath,
          env_vars: {
            WATERMARK_ENABLED: "true | false (default: true)",
            WATERMARK_TEXT: "teks watermark (default: @AutoClipBot)",
            WATERMARK_POSITION: "topleft | topright | bottomleft | bottomright | center",
            WATERMARK_FONT_SIZE: "ukuran font (default: 32)",
            WATERMARK_COLOR: "warna teks (default: white)",
            WATERMARK_OPACITY: "0.0-1.0 (default: 0.85)",
            WATERMARK_BOX: "true | false (default: true)",
            WATERMARK_BOX_COLOR: "warna kotak (default: black@0.4)",
            WATERMARK_IMAGE_PATH: "path ke file logo PNG (opsional)",
            WATERMARK_IMAGE_SCALE: "skala gambar 0.01-1.0 (default: 0.15)",
          },
          description: "Tambah watermark teks/gambar otomatis ke setiap klip via FFmpeg drawtext/overlay.",
        },
        intro_outro: {
          intro_enabled: ioCfg.introEnabled,
          intro_text: ioCfg.introText,
          intro_duration: ioCfg.introDuration,
          intro_has_file: !!ioCfg.introVideoPath,
          outro_enabled: ioCfg.outroEnabled,
          outro_text: ioCfg.outroText,
          outro_duration: ioCfg.outroDuration,
          outro_has_file: !!ioCfg.outroVideoPath,
          env_vars: {
            INTRO_ENABLED: "true | false (default: false)",
            INTRO_VIDEO_PATH: "path ke file intro.mp4 (opsional)",
            INTRO_DURATION: "durasi intro otomatis dalam detik (default: 3)",
            INTRO_TEXT: "teks intro otomatis",
            INTRO_COLOR: "warna background intro (#000000)",
            OUTRO_ENABLED: "true | false (default: false)",
            OUTRO_VIDEO_PATH: "path ke file outro.mp4 (opsional)",
            OUTRO_DURATION: "durasi outro otomatis dalam detik (default: 3)",
            OUTRO_TEXT: "teks outro (misal: Subscribe! 🔔)",
            OUTRO_COLOR: "warna background outro",
          },
          description: "Tambah intro/outro otomatis ke setiap klip. Bisa pakai file video atau generate otomatis via FFmpeg lavfi.",
        },
        zoom_effect: {
          enabled: zoomCfg.enabled,
          mode: zoomCfg.mode,
          type: zoomCfg.type,
          type_label: getZoomEffectLabel(zoomCfg.type),
          intensity: zoomCfg.intensity,
          duration: zoomCfg.duration,
          min_score: zoomCfg.minScore,
          env_vars: {
            ZOOM_EFFECT_ENABLED: "true | false (default: true)",
            ZOOM_EFFECT_MODE: "auto | always | never (default: auto)",
            ZOOM_EFFECT_TYPE: "in | out | in-out | pulse (default: in)",
            ZOOM_EFFECT_INTENSITY: "1.0-1.3 (default: 1.05 = subtle)",
            ZOOM_EFFECT_DURATION: "durasi zoom dalam detik (default: 2.0)",
            ZOOM_EFFECT_MIN_SCORE: "min viral score 1-10 untuk auto mode (default: 7)",
          },
          description: "Zoom effect otomatis pada highlight moment. Aktif di klip dengan viral score ≥ MIN_SCORE (mode auto).",
        },
      },
    });
  } catch (err) {
    return NextResponse.json(
      { status: "error", error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
