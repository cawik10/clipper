import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { youtubeTokens, userSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { exchangeCodeForTokens } from "@/lib/youtube-oauth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state"); // telegramUserId
  const error = req.nextUrl.searchParams.get("error");

  if (error) {
    return new NextResponse(
      `<html><body><h2>❌ OAuth Error: ${error}</h2><p>Kembali ke Telegram dan coba lagi.</p></body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }

  if (!code || !state) {
    return new NextResponse(
      `<html><body><h2>❌ Missing Parameters</h2><p>Code atau state tidak ditemukan.</p></body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }

  try {
    const tokens = await exchangeCodeForTokens(code);

    if (!tokens.access_token || !tokens.refresh_token) {
      throw new Error("Invalid tokens received from Google");
    }

    const expiresAt = tokens.expiry_date
      ? new Date(tokens.expiry_date)
      : new Date(Date.now() + 3600 * 1000);

    // Upsert token
    const existing = await db
      .select()
      .from(youtubeTokens)
      .where(eq(youtubeTokens.telegramUserId, state));

    if (existing.length > 0) {
      await db
        .update(youtubeTokens)
        .set({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt,
          scope: tokens.scope || null,
          updatedAt: new Date(),
        })
        .where(eq(youtubeTokens.telegramUserId, state));
    } else {
      await db.insert(youtubeTokens).values({
        telegramUserId: state,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt,
        scope: tokens.scope || null,
      });
    }

    // Update user settings
    await db
      .update(userSettings)
      .set({ youtubeConnected: true, updatedAt: new Date() })
      .where(eq(userSettings.telegramUserId, state));

    // Send confirmation message via Telegram bot
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (botToken && state) {
      try {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: state,
            text: "✅ *YouTube Berhasil Terhubung!*\n\nAkun YouTube Anda sudah terhubung.\nKirim link video untuk mulai membuat Shorts! 🎬",
            parse_mode: "Markdown",
          }),
        });
      } catch {
        // ignore notification error
      }
    }

    return new NextResponse(
      `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>YouTube Terhubung - AutoClip Bot</title>
  <style>
    body { font-family: -apple-system, sans-serif; background: #0f0f0f; color: #fff; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .card { background: #1a1a2e; border: 1px solid #16213e; border-radius: 16px; padding: 40px; text-align: center; max-width: 400px; }
    .icon { font-size: 64px; margin-bottom: 16px; }
    h1 { color: #4ade80; margin: 0 0 12px; }
    p { color: #9ca3af; margin: 0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✅</div>
    <h1>YouTube Terhubung!</h1>
    <p>Akun YouTube Studio Anda berhasil terhubung dengan AutoClip Bot.<br><br>Kembali ke Telegram dan mulai kirim link video!</p>
  </div>
</body>
</html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  } catch (err) {
    console.error("OAuth callback error:", err);
    return new NextResponse(
      `<html><body><h2>❌ Error: ${err instanceof Error ? err.message : String(err)}</h2></body></html>`,
      { headers: { "Content-Type": "text/html" }, status: 500 }
    );
  }
}
