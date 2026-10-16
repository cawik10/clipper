import { bot } from "@/lib/telegram-bot";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Inisialisasi botInfo grammY jika belum
    if (!bot.isInited()) {
      await bot.init();
    }

    // Jalankan pemrosesan update secara asinkron di latar belakang
    bot.handleUpdate(body).catch((err) =>
      console.error("Webhook process error:", err)
    );

    // Balas ke Telegram dalam < 1 detik agar tidak timeout
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Webhook route error:", error);
    return Response.json({ ok: false }, { status: 500 });
  }
}

export async function GET() {
  return Response.json({ status: "Webhook is active" });
}