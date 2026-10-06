import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Memaksa penambahan kolom baru ke tabel user_settings di database
    await db.execute(sql`ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "max_clips" integer DEFAULT 5;`);
    await db.execute(sql`ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "clip_duration" integer DEFAULT 30;`);
    
    return Response.json({ ok: true, message: "Database berhasil diupdate dan siap digunakan!" });
  } catch (err: any) {
    return Response.json({ ok: false, error: err.message || String(err) }, { status: 500 });
  }
}
