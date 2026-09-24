import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { youtubeTokens, userSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { exchangeCodeForTokens } from "@/lib/youtube-oauth";
import { bot } from "@/lib/telegram-bot";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state"); // Contains Telegram user ID
  const error = searchParams.get("error");

  if (error) {
    return new NextResponse(
      `<html><body style="font-family:sans-serif;text-align:center;padding:40px">
        <h2>❌ Authorization Denied</h2>
        <p>You denied access. Close this window and try again.</p>
        <script>setTimeout(()=>window.close(),3000)</script>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }

  if (!code || !state) {
    return new NextResponse(
      `<html><body style="font-family:sans-serif;text-align:center;padding:40px">
        <h2>❌ Invalid Request</h2>
        <p>Missing authorization code or state.</p>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }

  const telegramUserId = state;

  try {
    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code);

    if (!tokens.access_token || !tokens.refresh_token) {
      throw new Error("Missing tokens in response");
    }

    const expiresAt = new Date(tokens.expiry_date || Date.now() + 3600 * 1000);

    // Save tokens to DB
    const existing = await db
      .select()
      .from(youtubeTokens)
      .where(eq(youtubeTokens.telegramUserId, telegramUserId));

    if (existing.length > 0) {
      await db
        .update(youtubeTokens)
        .set({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt,
          scope: tokens.scope || "",
          updatedAt: new Date(),
        })
        .where(eq(youtubeTokens.telegramUserId, telegramUserId));
    } else {
      await db.insert(youtubeTokens).values({
        telegramUserId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt,
        scope: tokens.scope || "",
      });
    }

    // Update user settings
    await db
      .update(userSettings)
      .set({ youtubeConnected: true, updatedAt: new Date() })
      .where(eq(userSettings.telegramUserId, telegramUserId));

    // Notify user via Telegram
    try {
      await bot.api.sendMessage(
        parseInt(telegramUserId),
        `✅ *YouTube Studio berhasil terhubung!*\n\n` +
          `Sekarang klip video Anda akan otomatis diupload ke YouTube Studio sebagai Draft.\n\n` +
          `🎬 Kirim link video untuk mulai membuat Shorts!`,
        { parse_mode: "Markdown" }
      );
    } catch (telegramErr) {
      console.error("Failed to notify user:", telegramErr);
    }

    return new NextResponse(
      `<html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: -apple-system, sans-serif; text-align: center; padding: 40px 20px; background: #f5f5f5; }
          .card { background: white; border-radius: 16px; padding: 40px; max-width: 400px; margin: 0 auto; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
          h2 { color: #22c55e; font-size: 24px; margin-bottom: 16px; }
          p { color: #666; line-height: 1.6; }
          .icon { font-size: 64px; margin-bottom: 20px; }
          .close-btn { background: #ef4444; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-size: 16px; cursor: pointer; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon">✅</div>
          <h2>YouTube Terhubung!</h2>
          <p>Akun YouTube Studio Anda berhasil terhubung dengan AutoClip Bot.</p>
          <p>Kembali ke Telegram dan mulai kirim link video!</p>
          <button class="close-btn" onclick="window.close()">Tutup Window</button>
        </div>
        <script>setTimeout(()=>window.close(), 5000)</script>
      </body>
      </html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  } catch (err) {
    console.error("OAuth callback error:", err);
    const errorMsg = err instanceof Error ? err.message : "Unknown error";

    return new NextResponse(
      `<html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: -apple-system, sans-serif; text-align: center; padding: 40px 20px; background: #f5f5f5; }
          .card { background: white; border-radius: 16px; padding: 40px; max-width: 400px; margin: 0 auto; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
          h2 { color: #ef4444; }
          .icon { font-size: 64px; margin-bottom: 20px; }
          pre { background: #f5f5f5; padding: 12px; border-radius: 8px; text-align: left; font-size: 12px; overflow: auto; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon">❌</div>
          <h2>Connection Failed</h2>
          <pre>${errorMsg}</pre>
          <p>Close this window and try again from Telegram.</p>
        </div>
      </body>
      </html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }
}
