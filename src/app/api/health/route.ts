import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Memaksa penambahan kolom baru ke tabel user_settings di database
    await db.execute(sql`ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "max_clips" integer DEFAULT 5;`);
    await db.execute(sql`ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "clip_duration" integer DEFAULT 30;`);
    // 🎯 Custom Niche Prompt (BARU!) — pastikan kolom ada tanpa perlu migrasi manual
    await db.execute(sql`ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "niche_prompt" text;`);

    // 📅 Scheduler / Queue Posting (BARU!) — buat tabel otomatis kalau belum
    // ada, supaya di Railway tidak wajib menjalankan `drizzle-kit push` dulu
    // (mengikuti pola yang sama dengan tabel Google Drive di drive-uploader.ts).
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "scheduled_posts" (
        "id" serial PRIMARY KEY,
        "telegram_user_id" text NOT NULL,
        "telegram_chat_id" text NOT NULL,
        "job_id" text NOT NULL,
        "clip_index" integer NOT NULL,
        "platform" text NOT NULL DEFAULT 'youtube',
        "title" text,
        "niche" text,
        "scheduled_at" timestamp NOT NULL,
        "source" text NOT NULL DEFAULT 'manual',
        "status" text NOT NULL DEFAULT 'pending',
        "attempts" integer NOT NULL DEFAULT 0,
        "result_url" text,
        "error_message" text,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      );
    `);
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS "scheduled_posts_status_scheduled_at_idx" ON "scheduled_posts" ("status", "scheduled_at");`
    );

    return Response.json({ ok: true, message: "Database berhasil diupdate dan siap digunakan!" });
  } catch (err: any) {
    return Response.json({ ok: false, error: err.message || String(err) }, { status: 500 });
  }
}
