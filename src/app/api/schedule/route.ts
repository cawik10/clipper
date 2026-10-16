/**
 * 📅 SCHEDULER / QUEUE POSTING — API
 * ====================================
 * Endpoint BARU (additive) — tidak mengubah /api/settings atau endpoint lain
 * yang sudah ada. Dipakai oleh Telegram bot & bisa juga dipakai langsung
 * (mis. dari dashboard eksternal / automation lain) untuk mengelola antrean.
 *
 * GET    /api/schedule?userId=xxx       → daftar jadwal milik satu user
 * GET    /api/schedule                  → semua jadwal pending terdekat (admin/overview)
 * POST   /api/schedule                  → buat jadwal baru
 *        body: { telegramUserId, telegramChatId, jobId, clipIndex, platform?,
 *                 scheduledAt (ISO string) | hour & minute, source?, niche? }
 * DELETE /api/schedule?id=123&userId=xxx → batalkan satu jadwal (status pending saja)
 */
import { NextRequest, NextResponse } from "next/server";
import {
  createScheduledPost,
  listScheduledPostsForUser,
  listUpcomingScheduledPosts,
  cancelScheduledPost,
} from "@/lib/scheduler";
import { nextDateForSlot } from "@/lib/scheduler-config";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (userId) {
    const rows = await listScheduledPostsForUser(userId);
    return NextResponse.json(rows);
  }
  const rows = await listUpcomingScheduledPosts(50);
  return NextResponse.json(rows);
}

interface CreateBody {
  telegramUserId?: string;
  telegramChatId?: string;
  jobId?: string;
  clipIndex?: number;
  platform?: "youtube" | "tiktok";
  scheduledAt?: string;
  hour?: number;
  minute?: number;
  day?: "weekday" | "weekend" | "any";
  source?: "manual" | "ai" | "preset";
  niche?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CreateBody;
    const { telegramUserId, telegramChatId, jobId } = body;
    const clipIndex = body.clipIndex;

    if (!telegramUserId || !telegramChatId || !jobId || clipIndex === undefined) {
      return NextResponse.json(
        { error: "telegramUserId, telegramChatId, jobId, clipIndex wajib diisi" },
        { status: 400 }
      );
    }

    let scheduledAt: Date;
    if (body.scheduledAt) {
      scheduledAt = new Date(body.scheduledAt);
      if (isNaN(scheduledAt.getTime())) {
        return NextResponse.json({ error: "scheduledAt tidak valid" }, { status: 400 });
      }
    } else if (typeof body.hour === "number") {
      scheduledAt = nextDateForSlot({
        day: body.day || "any",
        hour: body.hour,
        minute: body.minute ?? 0,
        label: "manual",
      });
    } else {
      return NextResponse.json({ error: "scheduledAt atau hour wajib diisi" }, { status: 400 });
    }

    const row = await createScheduledPost({
      telegramUserId,
      telegramChatId,
      jobId,
      clipIndex,
      platform: body.platform || "youtube",
      scheduledAt,
      source: body.source || "manual",
      niche: body.niche,
    });

    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const idRaw = req.nextUrl.searchParams.get("id");
  const userId = req.nextUrl.searchParams.get("userId") || undefined;
  const id = idRaw ? parseInt(idRaw, 10) : NaN;
  if (isNaN(id)) {
    return NextResponse.json({ error: "id wajib diisi" }, { status: 400 });
  }
  const ok = await cancelScheduledPost(id, userId);
  if (!ok) {
    return NextResponse.json({ error: "Jadwal tidak ditemukan atau sudah diproses" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
