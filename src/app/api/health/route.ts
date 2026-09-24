import { NextResponse } from "next/server";
import { db } from "@/db";
import { clipJobs } from "@/db/schema";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Test DB connection
    await db.select({ count: sql<number>`count(*)` }).from(clipJobs);

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const googleClientId = process.env.GOOGLE_CLIENT_ID;
    const openaiKey = process.env.OPENAI_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;

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
