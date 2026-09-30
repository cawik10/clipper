import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { sql } from "drizzle-orm";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: databaseUrl,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);

// AUTO-MIGRATE: Menambahkan kolom yang kurang secara otomatis saat server boot
async function runAutoMigration() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS user_settings (
        id SERIAL PRIMARY KEY,
        telegram_user_id TEXT NOT NULL UNIQUE,
        telegram_username TEXT,
        telegram_first_name TEXT,
        youtube_connected BOOLEAN DEFAULT false,
        default_privacy TEXT DEFAULT 'private',
        max_clips INTEGER DEFAULT 5,
        min_duration INTEGER DEFAULT 20,
        max_duration INTEGER DEFAULT 40,
        language TEXT DEFAULT 'id',
        aspect_ratio_mode TEXT,
        watermark_enabled BOOLEAN,
        watermark_text TEXT,
        watermark_position TEXT,
        watermark_font_size INTEGER,
        watermark_color TEXT,
        watermark_opacity REAL,
        watermark_box BOOLEAN,
        thumbnail_enabled BOOLEAN,
        thumbnail_mode TEXT,
        thumbnail_quality INTEGER,
        zoom_enabled BOOLEAN,
        zoom_mode TEXT,
        zoom_type TEXT,
        zoom_intensity REAL,
        zoom_min_score INTEGER,
        intro_enabled BOOLEAN,
        intro_text TEXT,
        intro_duration INTEGER,
        outro_enabled BOOLEAN,
        outro_text TEXT,
        outro_duration INTEGER,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);
    
    // Fallback jika tabel sudah ada tapi kolomnya belum lengkap
    await db.execute(sql`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS telegram_username TEXT;`);
    await db.execute(sql`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS telegram_first_name TEXT;`);
    await db.execute(sql`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS youtube_connected BOOLEAN DEFAULT false;`);
    await db.execute(sql`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS default_privacy TEXT DEFAULT 'private';`);
    await db.execute(sql`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS max_clips INTEGER DEFAULT 5;`);
    await db.execute(sql`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS min_duration INTEGER DEFAULT 20;`);
    await db.execute(sql`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS max_duration INTEGER DEFAULT 40;`);
    await db.execute(sql`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'id';`);
    await db.execute(sql`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS aspect_ratio_mode TEXT;`);
    await db.execute(sql`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS watermark_enabled BOOLEAN;`);
    await db.execute(sql`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS watermark_text TEXT;`);
    await db.execute(sql`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS watermark_position TEXT;`);
    await db.execute(sql`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS watermark_font_size INTEGER;`);
    await db.execute(sql`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS watermark_color TEXT;`);
    await db.execute(sql`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS watermark_opacity REAL;`);
    await db.execute(sql`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS watermark_box BOOLEAN;`);
    await db.execute(sql`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS thumbnail_enabled BOOLEAN;`);
    await db.execute(sql`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS thumbnail_mode TEXT;`);
    await db.execute(sql`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS thumbnail_quality INTEGER;`);
    await db.execute(sql`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS zoom_enabled BOOLEAN;`);
    await db.execute(sql`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS zoom_mode TEXT;`);
    await db.execute(sql`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS zoom_type TEXT;`);
    await db.execute(sql`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS zoom_intensity REAL;`);
    await db.execute(sql`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS zoom_min_score INTEGER;`);
    await db.execute(sql`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS intro_enabled BOOLEAN;`);
    await db.execute(sql`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS intro_text TEXT;`);
    await db.execute(sql`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS intro_duration INTEGER;`);
    await db.execute(sql`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS outro_enabled BOOLEAN;`);
    await db.execute(sql`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS outro_text TEXT;`);
    await db.execute(sql`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS outro_duration INTEGER;`);
    
    console.log("[Database] Auto-migration completed successfully.");
  } catch (err) {
    console.error("[Database] Auto-migration error:", err);
  }
}

// Jalankan migrasi saat modul pertama kali dimuat di server
runAutoMigration();
