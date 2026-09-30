import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { userSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAllUserSettings, patchUserSettings } from "@/lib/user-settings";

export const dynamic = "force-dynamic";

// GET /api/settings — list all users (admin)
// GET /api/settings?userId=xxx — get single user
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");

  if (userId) {
    const rows = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.telegramUserId, userId));
    if (!rows.length) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    return NextResponse.json(rows[0]);
  }

  const all = await getAllUserSettings();
  return NextResponse.json(all);
}

// PATCH /api/settings — update user settings
// Body: { telegramUserId: string, ...patch }
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json() as { telegramUserId?: string; [key: string]: unknown };
    const { telegramUserId, ...patch } = body;

    if (!telegramUserId) {
      return NextResponse.json({ error: "telegramUserId is required" }, { status: 400 });
    }

    await patchUserSettings(telegramUserId, patch as Parameters<typeof patchUserSettings>[1]);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
