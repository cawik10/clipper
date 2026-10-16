import { webhookCallback } from "grammy";
import { bot } from "@/lib/telegram-bot";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const handler = webhookCallback(bot, "std/http");

// Contoh di route.ts webhook
export async function POST(req: Request) {
  const body = await req.json();

  // Tangani update bot Grammy/Telegraf...
  // Jalankan proses pekerjaan latar belakang TANPA 'await' agar webhook langsung merespons
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
