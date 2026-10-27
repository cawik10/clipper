import { webhookCallback } from "grammy";
import { bot } from "@/lib/telegram-bot";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Atur timeout grammy menjadi 5 menit (300000 ms) agar selaras dengan maxDuration
const handler = webhookCallback(bot, "std/http", {
  timeoutMilliseconds: 300000,
  onTimeout: "return",
});

export async function POST(req: Request) {
  try {
    return await handler(req);
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response("OK", { status: 200 });
  }
}

export async function GET() {
  return new Response(
    JSON.stringify({ status: "Telegram webhook is active", bot: "AutoClip Bot" }),
    { headers: { "Content-Type": "application/json" } }
  );
}