import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { tiktokTokens, userSettings } from "@/db/schema";
import { exchangeCodeForTokens } from "@/lib/tiktok-oauth";
import { eq } from "drizzle-orm";
import { bot } from "@/lib/telegram-bot";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state"); // Telegram user ID
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  // Handle user denied
  if (error) {
    return new NextResponse(
      renderHtml("❌ Koneksi TikTok Dibatalkan", errorDescription ?? error, false),
      { headers: { "Content-Type": "text/html" } }
    );
  }

  if (!code || !state) {
    return new NextResponse(
      renderHtml("❌ Parameter Tidak Valid", "code atau state tidak ditemukan.", false),
      { headers: { "Content-Type": "text/html" } }
    );
  }

  const telegramUserId = state;

  try {
    const tokens = await exchangeCodeForTokens(code);

    // Upsert tiktok tokens
    const existing = await db
      .select()
      .from(tiktokTokens)
      .where(eq(tiktokTokens.telegramUserId, telegramUserId));

    if (existing.length > 0) {
      await db
        .update(tiktokTokens)
        .set({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          openId: tokens.openId,
          expiresAt: tokens.expiresAt,
          refreshExpiresAt: tokens.refreshExpiresAt,
          scope: tokens.scope,
          updatedAt: new Date(),
        })
        .where(eq(tiktokTokens.telegramUserId, telegramUserId));
    } else {
      await db.insert(tiktokTokens).values({
        telegramUserId,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        openId: tokens.openId,
        expiresAt: tokens.expiresAt,
        refreshExpiresAt: tokens.refreshExpiresAt,
        scope: tokens.scope,
      });
    }

    // Update user settings
    await db
      .update(userSettings)
      .set({ tiktokConnected: true, updatedAt: new Date() })
      .where(eq(userSettings.telegramUserId, telegramUserId));

    // Notify user via Telegram
    try {
      await bot.api.sendMessage(
        telegramUserId,
        "✅ *TikTok berhasil terhubung!*\n\n" +
          "Klip video akan otomatis diupload ke TikTok inbox Anda setelah proses selesai.\n\n" +
          "📌 *Catatan:* Buka TikTok → notifikasi inbox → tap *Post* untuk mempublikasikan.\n\n" +
          "Kirim link video untuk mulai membuat klip! 🎬",
        { parse_mode: "Markdown" }
      );
    } catch {
      // silently ignore Telegram notification failure
    }

    return new NextResponse(
      renderHtml(
        "✅ TikTok Terhubung!",
        "Akun TikTok Anda berhasil terhubung dengan AutoClip Bot. Kembali ke Telegram!",
        true
      ),
      { headers: { "Content-Type": "text/html" } }
    );
  } catch (err) {
    console.error("TikTok OAuth callback error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return new NextResponse(
      renderHtml("❌ Koneksi Gagal", message, false),
      { headers: { "Content-Type": "text/html" } }
    );
  }
}

function renderHtml(title: string, message: string, success: boolean): string {
  const color = success ? "#00f2ea" : "#ff0050";
  const bg = success ? "#010101" : "#1a0000";
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${title}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
         background:${bg};color:#fff;min-height:100vh;display:flex;
         align-items:center;justify-content:center;padding:24px}
    .card{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);
          border-radius:20px;padding:40px 32px;max-width:440px;width:100%;text-align:center}
    .icon{font-size:64px;margin-bottom:20px}
    h1{font-size:24px;font-weight:700;color:${color};margin-bottom:12px}
    p{color:rgba(255,255,255,.75);line-height:1.6;margin-bottom:24px}
    .brand{display:flex;align-items:center;justify-content:center;gap:8px;
           font-size:18px;font-weight:700;color:${color};margin-bottom:24px}
    a{display:inline-block;background:${color};color:#000;padding:12px 28px;
      border-radius:10px;text-decoration:none;font-weight:700}
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">🎵 TikTok × AutoClip Bot</div>
    <div class="icon">${success ? "🎉" : "⚠️"}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <a href="https://t.me/${process.env.TELEGRAM_BOT_USERNAME ?? "your_bot"}">
      Kembali ke Telegram
    </a>
  </div>
</body>
</html>`;
}
