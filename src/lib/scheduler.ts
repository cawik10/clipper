/**
 * 🗓️ SCHEDULER / QUEUE POSTING
 * =====================================================================
 * Logika inti fitur penjadwalan upload YouTube:
 *   - Menghitung rekomendasi jam optimal berdasarkan niche (AI kalau
 *     tersedia, fallback ke tabel statis di scheduler-config.ts).
 *   - CRUD baris `scheduled_uploads` (lihat src/db/schema.ts).
 *
 * File ini TIDAK bergantung pada `telegram-bot.ts` (supaya tidak terjadi
 * circular import) — pengiriman notifikasi Telegram & eksekusi upload
 * dilakukan oleh src/lib/scheduler-worker.ts.
 *
 * Mudah diubah:
 *   - Jam rekomendasi per niche → src/lib/scheduler-config.ts
 *   - Interval worker / timezone / batas hari → src/lib/scheduler-config.ts
 *   - Provider AI yang dipakai → fungsi `refineHoursWithAI()` di bawah
 */

import { and, asc, eq, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { scheduledUploads, ScheduledUploadRow } from "@/db/schema";
import {
  getSchedulerMaxDaysAhead,
  getSchedulerSlotCount,
  getSchedulerTimezone,
  matchNicheOptimalHours,
} from "@/lib/scheduler-config";

export type ScheduleMode = "now" | "ai_recommended" | "custom";

export interface ScheduleSlot {
  date: Date;
  label: string;
  reason: string;
}

// ─── TABLE BOOTSTRAP (Railway-friendly, sama pola dengan ensureDriveTable) ──
// Membuat tabel otomatis saat runtime kalau belum ada (misal admin belum
// sempat menjalankan `drizzle-kit push`). Idempotent & aman dipanggil
// berkali-kali / bersamaan.
let tableReady: Promise<void> | null = null;
export function ensureScheduledUploadsTable(): Promise<void> {
  if (!tableReady) {
    tableReady = (async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS scheduled_uploads (
          id serial PRIMARY KEY,
          job_id text NOT NULL,
          telegram_user_id text NOT NULL,
          telegram_chat_id text NOT NULL,
          mode text NOT NULL DEFAULT 'custom',
          scheduled_at timestamp NOT NULL,
          status text NOT NULL DEFAULT 'pending',
          recommendation_reason text,
          attempts integer NOT NULL DEFAULT 0,
          error_message text,
          processed_at timestamp,
          created_at timestamp NOT NULL DEFAULT now(),
          updated_at timestamp NOT NULL DEFAULT now()
        )
      `);
    })().catch((err) => {
      tableReady = null;
      throw err;
    });
  }
  return tableReady;
}

// ─── REKOMENDASI JAM OPTIMAL (AI + fallback) ────────────────────────────────

/**
 * Minta AI (OpenAI/Gemini, kalau API key tersedia) untuk menyarankan jam
 * terbaik (0-23) untuk posting berdasarkan niche + platform. Kalau AI
 * tidak tersedia / gagal / hasilnya tidak valid, return null supaya
 * caller jatuh ke heuristik statis di scheduler-config.ts.
 */
async function refineHoursWithAI(
  nicheText: string,
  platform: string
): Promise<{ hours: number[]; reason: string } | null> {
  const prompt =
    `Kamu adalah ahli strategi konten YouTube Shorts/TikTok. ` +
    `Niche/topik konten: "${nicheText || "umum / belum ditentukan"}". Platform: ${platform}. ` +
    `Sebutkan ${getSchedulerSlotCount()} jam terbaik (format angka 0-23, waktu lokal audiens Indonesia WIB) ` +
    `untuk mem-publish video pendek agar mendapat views & engagement maksimal. ` +
    `Balas HANYA dengan JSON: {"hours": [number,...], "reason": "alasan singkat 1-2 kalimat dalam Bahasa Indonesia"}.`;

  if (process.env.OPENAI_API_KEY) {
    try {
      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Kamu ahli strategi konten sosial media. Balas hanya JSON valid." },
          { role: "user", content: prompt },
        ],
        temperature: 0.4,
        max_tokens: 300,
        response_format: { type: "json_object" },
      });
      const content = response.choices[0]?.message?.content || "{}";
      const parsed = JSON.parse(content);
      const hours = normalizeHours(parsed.hours);
      if (hours.length) return { hours, reason: String(parsed.reason || "").slice(0, 300) };
    } catch (err) {
      console.error("[scheduler] OpenAI hour recommendation failed:", err);
    }
  }

  if (process.env.GEMINI_API_KEY) {
    try {
      const { GoogleGenerativeAI } = await import("@google/generative-ai");
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      const result = await model.generateContent(prompt + "\n\nBALAS HANYA DENGAN JSON.");
      const text = result.response.text();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const hours = normalizeHours(parsed.hours);
        if (hours.length) return { hours, reason: String(parsed.reason || "").slice(0, 300) };
      }
    } catch (err) {
      console.error("[scheduler] Gemini hour recommendation failed:", err);
    }
  }

  return null;
}

function normalizeHours(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const hours = raw
    .map((h) => Math.round(Number(h)))
    .filter((h) => Number.isFinite(h) && h >= 0 && h <= 23);
  return Array.from(new Set(hours)).slice(0, getSchedulerSlotCount());
}

/**
 * Hitung slot waktu rekomendasi (tanggal+jam) berikutnya berdasarkan niche.
 * Mengembalikan beberapa pilihan terdekat (urut dari paling cepat) supaya
 * user bisa memilih langsung dari Telegram.
 */
export async function getOptimalSlots(
  nicheText: string | null | undefined,
  platform: string = "youtube"
): Promise<{ slots: ScheduleSlot[]; reason: string; nicheLabel: string }> {
  const fallback = matchNicheOptimalHours(nicheText);
  const ai = await refineHoursWithAI(nicheText || "", platform).catch(() => null);

  const hours = ai?.hours?.length ? ai.hours : fallback.hours;
  const reason =
    ai?.reason ||
    `Berdasarkan niche "${fallback.label}", jam-jam ini biasanya punya tingkat engagement tertinggi untuk Shorts.`;

  const slots = buildUpcomingSlots(hours).map((date) => ({
    date,
    label: formatScheduleLabel(date),
    reason,
  }));

  return { slots, reason, nicheLabel: fallback.label };
}

/** Bangun daftar Date terdekat (hari ini/besok/lusa) untuk tiap jam yang direkomendasikan. */
function buildUpcomingSlots(hours: number[]): Date[] {
  const tz = getSchedulerTimezone();
  const now = new Date();
  const maxDays = getSchedulerMaxDaysAhead();
  const candidates: Date[] = [];

  for (let dayOffset = 0; dayOffset <= Math.min(2, maxDays); dayOffset++) {
    for (const hour of hours) {
      const candidate = zonedDateAt(now, tz, dayOffset, hour, 0);
      if (candidate.getTime() > now.getTime() + 60_000) {
        candidates.push(candidate);
      }
    }
  }

  candidates.sort((a, b) => a.getTime() - b.getTime());
  const uniqueSorted: Date[] = [];
  for (const c of candidates) {
    if (!uniqueSorted.some((u) => Math.abs(u.getTime() - c.getTime()) < 60_000)) {
      uniqueSorted.push(c);
    }
  }
  return uniqueSorted.slice(0, getSchedulerSlotCount());
}

/** Bangun Date absolut untuk "hari ini + dayOffset" pada jam:menit tertentu di timezone target. */
function zonedDateAt(reference: Date, timeZone: string, dayOffset: number, hour: number, minute: number): Date {
  const base = new Date(reference.getTime() + dayOffset * 86_400_000);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(base);
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  const d = Number(parts.find((p) => p.type === "day")?.value);

  // Cari offset UTC timezone target pada tanggal tsb, lalu bangun instant yang
  // tepat menunjukkan `hour:minute` di timezone tersebut.
  const utcGuess = Date.UTC(y, m - 1, d, hour, minute, 0);
  const tzHourAtGuess = Number(
    new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", hour12: false }).format(new Date(utcGuess))
  );
  let diffHours = hour - tzHourAtGuess;
  if (diffHours > 12) diffHours -= 24;
  if (diffHours < -12) diffHours += 24;
  return new Date(utcGuess + diffHours * 3_600_000);
}

/** Format tanggal untuk ditampilkan ke user Telegram, sesuai timezone konfigurasi. */
export function formatScheduleLabel(date: Date): string {
  const tz = getSchedulerTimezone();
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: tz,
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date) + " " + tzAbbreviation(tz);
}

function tzAbbreviation(tz: string): string {
  if (tz.includes("Jakarta")) return "WIB";
  if (tz.includes("Makassar")) return "WITA";
  if (tz.includes("Jayapura")) return "WIT";
  return tz;
}

/** Parse input custom jam dari user, mis. "19:30", "besok 09:00", "2025-06-01 19:30". */
export function parseCustomScheduleInput(
  raw: string
): { date: Date; error?: undefined } | { date?: undefined; error: string } {
  const text = raw.trim().toLowerCase();
  const tz = getSchedulerTimezone();
  const now = new Date();
  const maxDays = getSchedulerMaxDaysAhead();

  // Format: YYYY-MM-DD HH:MM
  const fullMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})[ t](\d{1,2}):(\d{2})$/);
  if (fullMatch) {
    const [, y, m, d, h, min] = fullMatch;
    const date = zonedDateAt(
      new Date(Date.UTC(Number(y), Number(m) - 1, Number(d))),
      tz,
      0,
      Number(h),
      Number(min)
    );
    return validateFutureDate(date, now, maxDays);
  }

  // Format: "besok HH:MM" atau "besok jam HH:MM"
  const tomorrowMatch = text.match(/^besok(?:\s+jam)?\s+(\d{1,2})[:.](\d{2})$/);
  if (tomorrowMatch) {
    const [, h, min] = tomorrowMatch;
    const date = zonedDateAt(now, tz, 1, Number(h), Number(min));
    return validateFutureDate(date, now, maxDays);
  }

  // Format: "HH:MM" atau "HH.MM" atau "jam HH:MM" → hari ini kalau masih bisa, kalau tidak otomatis besok
  const hourMatch = text.match(/^(?:jam\s+)?(\d{1,2})[:.](\d{2})$/);
  if (hourMatch) {
    const [, h, min] = hourMatch;
    const hourNum = Number(h);
    const minNum = Number(min);
    if (hourNum > 23 || minNum > 59) return { error: "Format jam tidak valid. Gunakan 00:00 - 23:59." };
    let date = zonedDateAt(now, tz, 0, hourNum, minNum);
    if (date.getTime() <= now.getTime() + 60_000) {
      date = zonedDateAt(now, tz, 1, hourNum, minNum);
    }
    return validateFutureDate(date, now, maxDays);
  }

  // Format: "+N jam" / "+N menit"
  const relativeMatch = text.match(/^\+(\d+)\s*(jam|menit|j|m)$/);
  if (relativeMatch) {
    const [, amountRaw, unitRaw] = relativeMatch;
    const amount = Number(amountRaw);
    const ms = unitRaw.startsWith("j") ? amount * 3_600_000 : amount * 60_000;
    const date = new Date(now.getTime() + ms);
    return validateFutureDate(date, now, maxDays);
  }

  return {
    error:
      "Format tidak dikenali. Contoh yang valid: `19:30`, `besok 09:00`, `2025-06-01 19:30`, atau `+3 jam`.",
  };
}

function validateFutureDate(
  date: Date,
  now: Date,
  maxDays: number
): { date: Date; error?: undefined } | { date?: undefined; error: string } {
  if (date.getTime() <= now.getTime() + 30_000) {
    return { error: "Jam yang dipilih sudah lewat. Pilih jam di masa depan." };
  }
  if (date.getTime() > now.getTime() + maxDays * 86_400_000) {
    return { error: `Maksimal penjadwalan adalah ${maxDays} hari ke depan.` };
  }
  return { date };
}

// ─── CRUD scheduled_uploads ──────────────────────────────────────────────

export async function createScheduledUpload(params: {
  jobId: string;
  telegramUserId: string;
  telegramChatId: string;
  mode: ScheduleMode;
  scheduledAt: Date;
  recommendationReason?: string | null;
}): Promise<ScheduledUploadRow> {
  await ensureScheduledUploadsTable();
  const rows = await db
    .insert(scheduledUploads)
    .values({
      jobId: params.jobId,
      telegramUserId: params.telegramUserId,
      telegramChatId: params.telegramChatId,
      mode: params.mode,
      scheduledAt: params.scheduledAt,
      recommendationReason: params.recommendationReason || null,
      status: "pending",
    })
    .returning();
  return rows[0];
}

export async function getScheduledUploadByJobId(jobId: string): Promise<ScheduledUploadRow | null> {
  await ensureScheduledUploadsTable();
  const rows = await db.select().from(scheduledUploads).where(eq(scheduledUploads.jobId, jobId));
  return rows[0] || null;
}

export async function getPendingScheduledUploadsForUser(userId: string): Promise<ScheduledUploadRow[]> {
  await ensureScheduledUploadsTable();
  return db
    .select()
    .from(scheduledUploads)
    .where(and(eq(scheduledUploads.telegramUserId, userId), eq(scheduledUploads.status, "pending")))
    .orderBy(asc(scheduledUploads.scheduledAt));
}

export async function getDueScheduledUploads(limit: number = 10): Promise<ScheduledUploadRow[]> {
  await ensureScheduledUploadsTable();
  return db
    .select()
    .from(scheduledUploads)
    .where(and(eq(scheduledUploads.status, "pending"), lte(scheduledUploads.scheduledAt, new Date())))
    .orderBy(asc(scheduledUploads.scheduledAt))
    .limit(limit);
}

/** Tandai sebagai "processing" secara atomik (hanya berhasil kalau masih "pending"). */
export async function claimScheduledUpload(id: number): Promise<boolean> {
  const rows = await db
    .update(scheduledUploads)
    .set({ status: "processing", attempts: sql`${scheduledUploads.attempts} + 1`, updatedAt: new Date() })
    .where(and(eq(scheduledUploads.id, id), eq(scheduledUploads.status, "pending")))
    .returning({ id: scheduledUploads.id });
  return rows.length > 0;
}

export async function completeScheduledUpload(
  id: number,
  ok: boolean,
  errorMessage?: string
): Promise<void> {
  await db
    .update(scheduledUploads)
    .set({
      status: ok ? "done" : "error",
      errorMessage: errorMessage || null,
      processedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(scheduledUploads.id, id));
}

export async function cancelScheduledUpload(id: number, userId: string): Promise<boolean> {
  const rows = await db
    .update(scheduledUploads)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(
      and(
        eq(scheduledUploads.id, id),
        eq(scheduledUploads.telegramUserId, userId),
        eq(scheduledUploads.status, "pending")
      )
    )
    .returning({ id: scheduledUploads.id });
  return rows.length > 0;
}
