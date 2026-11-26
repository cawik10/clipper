import { NextResponse } from "next/server";
import { saveDriveConnection } from "@/lib/drive-uploader";
import { bot } from "@/lib/telegram-bot";

function page(title: string, body: string, ok: boolean, status = 200) {
  const color = ok ? "#22c55e" : "#ef4444";
  return new NextResponse(
    `<html>
      <head><title>${title}</title><meta name="viewport" content="width=device-width,initial-scale=1"></head>
      <body style="font-family:sans-serif;text-align:center;padding:50px;background:#0f172a;color:white">
        <div style="max-width:420px;margin:0 auto;background:#1e293b;border-radius:16px;padding:40px">
          <div style="font-size:64px">${ok ? "✅" : "❌"}</div>
          <h2 style="color:${color}">${title}</h2>
          <p style="color:#94a3b8">${body}</p>
        </div>
      </body>
    </html>`,
    { headers: { "Content-Type": "text/html" }, status }
  );
}

/** Dipakai oleh /api/drive/callback dan /api/youtube/callback (state berawalan "drive:") */
export async function handleDriveOAuthCallback(
  code: string | null,
  userId: string | null,
  error: string | null
): Promise<NextResponse> {
  if (error) {
    return page("Login Dibatalkan", "Kamu membatalkan proses login Google Drive. Kembali ke Telegram dan coba lagi.", false);
  }
  if (!code || !userId) {
    return NextResponse.json({ error: "Missing code or state" }, { status: 400 });
  }

  try {
    const { email } = await saveDriveConnection(code, userId);

    // Beri tahu user di Telegram (chat pribadi: chat id = user id)
    try {
      await bot.api.sendMessage(
        userId,
        `✅ *Google Drive terhubung!*${email ? `\n📧 Akun: \`${email}\`` : ""}\n\n` +
          `Setiap klip yang selesai dibuat akan otomatis di-upload ke Drive.\n` +
          `Atur folder tujuan & pengaturan lain lewat /drive`,
        { parse_mode: "Markdown" }
      );
    } catch (e) {
      console.warn("[drive] gagal kirim notifikasi Telegram:", e);
    }

    return page(
      "Google Drive Terhubung!",
      `Akun${email ? ` <b>${email}</b>` : ""} berhasil terhubung dengan AutoClip Bot.<br><br>Kembali ke Telegram — klip akan otomatis masuk ke Drive.`,
      true
    );
  } catch (err) {
    console.error("Drive callback error:", err);
    const msg = (err instanceof Error ? err.message : "Terjadi kesalahan").replace(/</g, "&lt;");
    return page("Error", msg, false, 500);
  }
}
