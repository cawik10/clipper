import { db } from "@/db";
import { sql } from "drizzle-orm";
import { getMaxClipsConfig } from "@/lib/video-config";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    const maxClips = getMaxClipsConfig();
    return Response.json({
      status: "ok",
      bot: "AutoClip Bot",
      maxClips,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return Response.json(
      { status: "error", error: String(err) },
      { status: 500 }
    );
  }
}
