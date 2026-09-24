import { webhookCallback } from "grammy";
import { bot } from "@/lib/telegram-bot";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes for video processing

const handler = webhookCallback(bot, "std/http");

export async function POST(req: Request) {
  try {
    return await handler(req);
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response("OK", { status: 200 }); // Always return 200 to Telegram
  }
}

export async function GET() {
  return new Response(
    JSON.stringify({ status: "Telegram webhook is active", bot: "AutoClip Bot" }),
    { headers: { "Content-Type": "application/json" } }
  );
}
