import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { youtubeTokens, userSettings } from "@/db/schema";
import { exchangeCodeForTokens } from "@/lib/youtube-oauth";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state"); // Telegram user ID
  const error = searchParams.get("error");

  if (error) {
    return new NextResponse(renderHtml("❌ Koneksi Dibatalkan", "Anda membatalkan koneksi YouTube.", false), {
      headers: { "Content-Type": "text/html" },
    });
  }

  if (!code || !state) {
    return new NextResponse(renderHtml("❌ Parameter Tidak Valid", "code atau state tidak ditemukan.", false), {
      headers: { "Content-Type": "text/html" },
    });
  }

  const telegramUserId = state;

  try {
    const rawTokens = await exchangeCodeForTokens(code);

    if (!rawTokens.access_token || !rawTokens.refresh_token) {
      throw new Error("Token tidak lengkap dari Google");
    }

    const expiresAt = rawTokens.expiry_date
      ? new Date(rawTokens.expiry_date)
      : new Date(Date.now() + 3600 * 1000);

    const existing = await db
      .select()
      .from(youtubeTokens)
      .where(eq(youtubeTokens.telegramUserId, telegramUserId));

    if (existing.length > 0) {
      await db
        .update(youtubeTokens)
        .set({
          accessToken: rawTokens.access_token,
          refreshToken: rawTokens.refresh_token,
          expiresAt,
          scope: rawTokens.scope ?? null,
          updatedAt: new Date(),
        })
        .where(eq(youtubeTokens.telegramUserId, telegramUserId));
    } else {
      await db.insert(youtubeTokens).values({
        telegramUserId,
        accessToken: rawTokens.access_token,
        refreshToken: rawTokens.refresh_token,
        expiresAt,
        scope: rawTokens.scope ?? null,
      });
    }

    await db
      .update(userSettings)
      .set({ youtubeConnected: true, updatedAt: new Date() })
      .where(eq(userSettings.telegramUserId, telegramUserId));

    // Notify the user via Telegram
    try {
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      if (botToken) {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: telegramUserId,
            text:
              "✅ *YouTube berhasil terhubung!*\n\nKlip video akan otomatis diupload ke YouTube Studio sebagai Draft. Kirim link video untuk mulai! 🎬",
            parse_mode: "Markdown",
          }),
        });
      }
    } catch {
      // silently ignore
    }

    return new NextResponse(
      renderHtml(
        "✅ YouTube Terhubung!",
        "Akun YouTube Studio Anda berhasil terhubung dengan AutoClip Bot. Kembali ke Telegram dan mulai kirim link video!",
        true
      ),
      { headers: { "Content-Type": "text/html" } }
    );
  } catch (err) {
    console.error("YouTube OAuth callback error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return new NextResponse(renderHtml("❌ Koneksi Gagal", message, false), {
      headers: { "Content-Type": "text/html" },
    });
  }
}

function renderHtml(title: string, message: string, success: boolean): string {
  const color = success ? "#ff0000" : "#ff6b6b";
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${title}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
         background:#0f0f0f;color:#fff;min-height:100vh;display:flex;
         align-items:center;justify-content:center;padding:24px}
    .card{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);
          border-radius:20px;padding:40px 32px;max-width:440px;width:100%;text-align:center}
    .icon{font-size:64px;margin-bottom:20px}
    h1{font-size:24px;font-weight:700;color:${color};margin-bottom:12px}
    p{color:rgba(255,255,255,.75);line-height:1.6;margin-bottom:24px}
    .brand{font-size:18px;font-weight:700;color:${color};margin-bottom:24px}
    a{display:inline-block;background:${color};color:#fff;padding:12px 28px;
      border-radius:10px;text-decoration:none;font-weight:700}
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">📺 YouTube × AutoClip Bot</div>
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
