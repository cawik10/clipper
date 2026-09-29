import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { youtubeTokens, userSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { exchangeCodeForTokens } from "@/lib/youtube-oauth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state"); // userId
  const error = req.nextUrl.searchParams.get("error");

  if (error) {
    return new NextResponse(
      `<html><body><h1>❌ Gagal</h1><p>Error: ${error}</p></body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }

  if (!code || !state) {
    return new NextResponse(
      `<html><body><h1>❌ Gagal</h1><p>Code atau state tidak ditemukan.</p></body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }

  try {
    const tokens = await exchangeCodeForTokens(code);

    // Save tokens
    const existing = await db
      .select()
      .from(youtubeTokens)
      .where(eq(youtubeTokens.telegramUserId, state));

    if (existing.length > 0) {
      await db.update(youtubeTokens).set({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
        scope: tokens.scope,
        updatedAt: new Date(),
      }).where(eq(youtubeTokens.telegramUserId, state));
    } else {
      await db.insert(youtubeTokens).values({
        telegramUserId: state,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
        scope: tokens.scope,
      });
    }

    // Update user settings
    await db.update(userSettings)
      .set({ youtubeConnected: true, updatedAt: new Date() })
      .where(eq(userSettings.telegramUserId, state));

    return new NextResponse(
      `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>YouTube Terhubung</title>
  <style>
    body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0f172a; color: white; }
    .card { background: #1e293b; border-radius: 16px; padding: 40px; text-align: center; max-width: 400px; }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { margin: 0 0 8px; color: #22c55e; }
    p { color: #94a3b8; margin: 0; }
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
    const msg = err instanceof Error ? err.message : String(err);
    return new NextResponse(
      `<html><body><h1>❌ Error</h1><p>${msg}</p></body></html>`,
      { headers: { "Content-Type": "text/html" }, status: 500 }
    );
  }
}
