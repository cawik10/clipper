import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secret = req.nextUrl.searchParams.get("secret");

  // Simple auth
  if (secret !== process.env.SETUP_SECRET && secret !== "setup-autoclip-2024") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!token) {
    return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN not set" }, { status: 500 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
  const webhookUrl = `${appUrl}/api/telegram/webhook`;

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/setWebhook`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: webhookUrl,
          allowed_updates: ["message", "callback_query", "inline_query"],
          drop_pending_updates: true,
        }),
      }
    );

    const result = await response.json();

    if (result.ok) {
      return NextResponse.json({
        success: true,
        message: `Webhook set to: ${webhookUrl}`,
        result,
      });
    } else {
      return NextResponse.json({ success: false, error: result.description }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secret = req.nextUrl.searchParams.get("secret");

  if (secret !== process.env.SETUP_SECRET && secret !== "setup-autoclip-2024") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!token) {
    return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN not set" }, { status: 500 });
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, {
    method: "POST",
  });
  const result = await response.json();

  return NextResponse.json(result);
}
