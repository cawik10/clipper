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
      `<html><body style="font-family:sans-serif;text-align:center;padding:50px">
        <h2>❌ Login Dibatalkan</h2>
        <p>Kamu membatalkan proses login YouTube.</p>
        <p>Kembali ke Telegram dan coba lagi.</p>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }

  if (!code || !state) {
    return NextResponse.json({ error: "Missing code or state" }, { status: 400 });
  }

  try {
    const tokens = await exchangeCodeForTokens(code);

    // Upsert token
    const existing = await db
      .select()
      .from(youtubeTokens)
      .where(eq(youtubeTokens.telegramUserId, state));

    if (existing.length) {
      await db
        .update(youtubeTokens)
        .set({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: tokens.expiresAt,
          scope: tokens.scope,
          updatedAt: new Date(),
        })
        .where(eq(youtubeTokens.telegramUserId, state));
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
    await db
      .update(userSettings)
      .set({ youtubeConnected: true, updatedAt: new Date() })
      .where(eq(userSettings.telegramUserId, state));

    return new NextResponse(
      `<html>
        <head><title>YouTube Connected</title></head>
        <body style="font-family:sans-serif;text-align:center;padding:50px;background:#0f172a;color:white">
          <div style="max-width:400px;margin:0 auto;background:#1e293b;border-radius:16px;padding:40px">
            <div style="font-size:64px">✅</div>
            <h2 style="color:#22c55e">YouTube Terhubung!</h2>
            <p style="color:#94a3b8">Akun YouTube Studio Anda berhasil terhubung dengan AutoClip Bot.</p>
            <p style="color:#94a3b8">Kembali ke Telegram dan mulai kirim link video!</p>
          </div>
        </body>
      </html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  } catch (err) {
    console.error("YouTube callback error:", err);
    return new NextResponse(
      `<html><body style="font-family:sans-serif;text-align:center;padding:50px">
        <h2>❌ Error</h2>
        <p>${err instanceof Error ? err.message : "Terjadi kesalahan"}</p>
      </body></html>`,
      { headers: { "Content-Type": "text/html" }, status: 500 }
    );
  }
}
