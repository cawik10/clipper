import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { youtubeTokens, userSettings } from "@/db/schema";
import { exchangeCodeForTokens } from "@/lib/youtube-oauth";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state"); // This is the telegramUserId
  const error = searchParams.get("error");

  if (error) {
    return new NextResponse(
      `<html><body><h2>❌ Auth Error: ${error}</h2><p>Silakan coba lagi di Telegram.</p></body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }

  if (!code || !state) {
    return new NextResponse(
      `<html><body><h2>❌ Invalid callback</h2><p>Parameter code atau state tidak ditemukan.</p></body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }

  try {
    const tokens = await exchangeCodeForTokens(code);

    if (!tokens.access_token || !tokens.refresh_token) {
      throw new Error("Tokens tidak lengkap dari Google");
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

    // Notify user via Telegram
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (botToken) {
      try {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: state,
            text: "✅ *YouTube berhasil terhubung!*\n\nKini klip video kamu akan otomatis diupload ke YouTube Studio sebagai Draft.\n\nKirim link video untuk mulai! 🎬",
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
  <title>YouTube Terhubung!</title>
  <style>
    body { font-family: Arial, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0f0f0f; color: white; }
    .card { background: #1a1a2e; border: 1px solid #16213e; border-radius: 16px; padding: 40px; text-align: center; max-width: 400px; }
    .icon { font-size: 64px; margin-bottom: 16px; }
    h1 { color: #4ade80; margin: 0 0 12px; }
    p { color: #94a3b8; margin: 0; line-height: 1.6; }
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
      `<html><body><h2>❌ Error</h2><p>${err instanceof Error ? err.message : String(err)}</p></body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }
}
