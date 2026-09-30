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
      `<html><body style="font-family:sans-serif;text-align:center;padding:40px">
        <h2>❌ Koneksi Dibatalkan</h2>
        <p>Kamu membatalkan koneksi YouTube.</p>
        <p>Kembali ke Telegram dan coba lagi jika diperlukan.</p>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }

  if (!code || !state) {
    return new NextResponse(
      `<html><body style="font-family:sans-serif;text-align:center;padding:40px">
        <h2>❌ Error</h2><p>Parameter tidak lengkap.</p>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }

  try {
    const tokens = await exchangeCodeForTokens(code);

    await db
      .insert(youtubeTokens)
      .values({
        telegramUserId: state,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
        scope: tokens.scope,
      })
      .onConflictDoUpdate({
        target: youtubeTokens.telegramUserId,
        set: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: tokens.expiresAt,
          scope: tokens.scope,
          updatedAt: new Date(),
        },
      });

    await db
      .update(userSettings)
      .set({ youtubeConnected: true, updatedAt: new Date() })
      .where(eq(userSettings.telegramUserId, state));

    return new NextResponse(
      `<html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#0f172a;color:#e2e8f0">
        <div style="max-width:400px;margin:0 auto;background:#1e293b;padding:40px;border-radius:16px;border:1px solid #10b981">
          <div style="font-size:60px;margin-bottom:20px">✅</div>
          <h2 style="color:#10b981;margin-bottom:12px">YouTube Terhubung!</h2>
          <p style="color:#94a3b8">Akun YouTube Studio Anda berhasil terhubung dengan AutoClip Bot.</p>
          <p style="color:#64748b;margin-top:20px;font-size:14px">Kembali ke Telegram dan mulai kirim link video!</p>
        </div>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new NextResponse(
      `<html><body style="font-family:sans-serif;text-align:center;padding:40px">
        <h2>❌ Gagal</h2><p>${msg}</p>
      </body></html>`,
      { headers: { "Content-Type": "text/html" }, status: 500 }
    );
  }
}
