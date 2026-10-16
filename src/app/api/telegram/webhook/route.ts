import { webhookCallback } from "grammy";
import { bot } from "@/lib/telegram-bot";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // 💡 Inisialisasi botInfo grammY jika belum terinisialisasi
    if (!bot.isInited()) {
      await bot.init();
    }

    // Jalankan pemrosesan update secara asinkron di latar belakang
    bot.handleUpdate(body).catch((err) => console.error("Webhook process error:", err));

    // Segera beri respons HTTP 200 ke Telegram agar tidak timeout
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Webhook route error:", error);
    return Response.json({ ok: false }, { status: 500 });
  }
}
  bot.handleUpdate(body).catch((err) => console.error("Webhook process error:", err));

  // Balas ke Telegram dalam < 1 detik agar tidak Request timed out after 10000 ms
  return Response.json({ ok: true });
}

export async function GET() {
  return new Response(
    JSON.stringify({ status: "Telegram webhook is active", bot: "AutoClip Bot" }),
    { headers: { "Content-Type": "application/json" } }
  );
}
