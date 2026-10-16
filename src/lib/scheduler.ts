/**
 * 📅 SCHEDULER / QUEUE POSTING — CORE LOGIC
 * ===========================================
 * Fitur BARU (additive, tidak mengubah src/lib/job-processor.ts yang lama).
 *
 * Alur singkat:
 *   1. User menjalankan /schedule di Telegram setelah sebuah job selesai.
 *   2. Bot menampilkan klip-klip hasil job tsb + pilihan jam (AI rekomendasi
 *      berdasarkan niche, atau manual) → tersimpan sebagai baris di tabel
 *      `scheduled_posts` (lihat src/db/schema.ts) dengan status "pending".
 *   3. Worker background (src/lib/scheduler-worker.ts) memanggil
 *      `runDueScheduledPosts()` setiap interval (lihat scheduler-config.ts)
 *      untuk mengeksekusi antrean yang sudah jatuh tempo.
 *   4. Eksekusi:
 *      - YouTube: kalau klip sudah ter-upload sebagai Draft (private) saat
 *        job diproses, scheduler tinggal mem-publish draft tsb (update
 *        privacyStatus) tepat di jam terjadwal — cepat & tidak butuh file
 *        video lokal lagi. Kalau belum pernah ter-upload tapi file klip
 *        masih ada di disk, scheduler akan meng-upload-nya saat itu juga.
 *      - TikTok: upload klip (butuh file masih ada di disk + akun TikTok
 *        sudah terhubung lewat Content Posting API).
 *
 * Semua helper di file ini dipakai bersama oleh: Telegram bot
 * (src/lib/telegram-bot.ts), API routes (src/app/api/schedule/*), dan
 * dashboard (src/app/page.tsx) — satu sumber kebenaran, mudah dirawat.
 */

import fs from "fs";
import { db } from "@/db";
import { scheduledPosts, clipJobs, youtubeTokens, ClipResult, ScheduledPostRow } from "@/db/schema";
import { and, asc, desc, eq, lte, inArray } from "drizzle-orm";
import { google } from "googleapis";
import {
  isTokenExpired,
  refreshAccessToken,
  uploadClipsToYouTube,
} from "@/lib/youtube-uploader";
import {
  getSchedulerGraceMinutes,
  getSchedulerMaxAttempts,
  getSchedulerPublishPrivacy,
  type SchedulePlatform,
} from "@/lib/scheduler-config";

export type { SchedulePlatform };

// ─── CREATE ───────────────────────────────────────────────────────────────

export interface CreateScheduledPostInput {
  telegramUserId: string;
  telegramChatId: string;
  jobId: string;
  clipIndex: number;
  platform: SchedulePlatform;
  scheduledAt: Date;
  source: "manual" | "ai" | "preset";
  niche?: string | null;
}

export async function createScheduledPost(input: CreateScheduledPostInput): Promise<ScheduledPostRow> {
  const jobRows = await db.select().from(clipJobs).where(eq(clipJobs.jobId, input.jobId));
  const job = jobRows[0];
  const clip = (job?.clips as ClipResult[] | null)?.[input.clipIndex];

  const rows = await db
    .insert(scheduledPosts)
    .values({
      telegramUserId: input.telegramUserId,
      telegramChatId: input.telegramChatId,
      jobId: input.jobId,
      clipIndex: input.clipIndex,
      platform: input.platform,
      title: clip?.title || null,
      niche: input.niche || null,
      scheduledAt: input.scheduledAt,
      source: input.source,
      status: "pending",
    })
    .returning();

  return rows[0];
}

// ─── READ ─────────────────────────────────────────────────────────────────

export async function listScheduledPostsForUser(telegramUserId: string): Promise<ScheduledPostRow[]> {
  return db
    .select()
    .from(scheduledPosts)
    .where(eq(scheduledPosts.telegramUserId, telegramUserId))
    .orderBy(asc(scheduledPosts.scheduledAt));
}

export async function listUpcomingScheduledPosts(limit = 20): Promise<ScheduledPostRow[]> {
  return db
    .select()
    .from(scheduledPosts)
    .where(eq(scheduledPosts.status, "pending"))
    .orderBy(asc(scheduledPosts.scheduledAt))
    .limit(limit);
}

export async function getSchedulerQueueStats() {
  const rows = await db.select().from(scheduledPosts);
  const byStatus = { pending: 0, processing: 0, posted: 0, failed: 0, cancelled: 0 } as Record<string, number>;
  for (const row of rows) {
    byStatus[row.status] = (byStatus[row.status] || 0) + 1;
  }
  const recent = [...rows]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 8);
  return { total: rows.length, byStatus, recent };
}

// ─── CANCEL ───────────────────────────────────────────────────────────────

export async function cancelScheduledPost(id: number, telegramUserId?: string): Promise<boolean> {
  const where = telegramUserId
    ? and(eq(scheduledPosts.id, id), eq(scheduledPosts.telegramUserId, telegramUserId))
    : eq(scheduledPosts.id, id);

  const result = await db
    .update(scheduledPosts)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(where, eq(scheduledPosts.status, "pending")))
    .returning();

  return result.length > 0;
}

// ─── EXECUTION ────────────────────────────────────────────────────────────

async function publishOrUploadYouTube(
  clip: ClipResult,
  telegramUserId: string
): Promise<{ url: string }> {
  const tokenRows = await db
    .select()
    .from(youtubeTokens)
    .where(eq(youtubeTokens.telegramUserId, telegramUserId));
  const tokenRow = tokenRows[0];

  if (!tokenRow) {
    throw new Error("Akun YouTube belum terhubung. Jalankan /connect terlebih dahulu.");
  }

  let { accessToken, refreshToken } = tokenRow;
  if (isTokenExpired(tokenRow.expiresAt)) {
    const refreshed = await refreshAccessToken(tokenRow.refreshToken);
    accessToken = refreshed.accessToken;
    await db
      .update(youtubeTokens)
      .set({ accessToken: refreshed.accessToken, expiresAt: refreshed.expiresAt, updatedAt: new Date() })
      .where(eq(youtubeTokens.telegramUserId, telegramUserId));
  }

  // Kasus 1: klip sudah pernah di-upload sebagai Draft (private) oleh
  // job-processor saat pertama kali diproses → tinggal dipublish.
  if (clip.youtubeVideoId) {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    oauth2Client.setCredentials({ access_token: accessToken, refresh_token: refreshToken });
    const youtube = google.youtube({ version: "v3", auth: oauth2Client });

    await youtube.videos.update({
      part: ["status"],
      requestBody: {
        id: clip.youtubeVideoId,
        status: {
          privacyStatus: getSchedulerPublishPrivacy(),
          selfDeclaredMadeForKids: false,
        },
      },
    });

    return { url: clip.youtubeUrl || `https://youtu.be/${clip.youtubeVideoId}` };
  }

  // Kasus 2: belum pernah di-upload (mis. user belum connect YouTube saat
  // job diproses) tapi file klip masih tersedia di disk → upload sekarang.
  if (clip.filePath && fs.existsSync(clip.filePath)) {
    const results = await uploadClipsToYouTube([clip], accessToken, refreshToken, getSchedulerPublishPrivacy());
    const result = results[0];
    if (!result) throw new Error("Upload ke YouTube gagal saat eksekusi jadwal.");
    return { url: result.videoUrl };
  }

  throw new Error(
    "File klip sudah tidak tersedia lagi (disk sementara server mungkin sudah dibersihkan) dan belum ada draft YouTube untuk dipublish. Proses ulang video untuk menjadwalkan lagi."
  );
}

/** Eksekusi satu antrean (dipanggil oleh worker atau trigger manual/API). */
export async function executeScheduledPost(row: ScheduledPostRow): Promise<void> {
  await db
    .update(scheduledPosts)
    .set({ status: "processing", attempts: row.attempts + 1, updatedAt: new Date() })
    .where(eq(scheduledPosts.id, row.id));

  try {
    const jobRows = await db.select().from(clipJobs).where(eq(clipJobs.jobId, row.jobId));
    const job = jobRows[0];
    const clip = (job?.clips as ClipResult[] | null)?.[row.clipIndex];
    if (!clip) throw new Error("Klip tidak ditemukan (job mungkin sudah dihapus).");

    let resultUrl: string;
    if (row.platform === "youtube") {
      const result = await publishOrUploadYouTube(clip, row.telegramUserId);
      resultUrl = result.url;
    } else {
      throw new Error(
        `Platform "${row.platform}" belum terhubung (butuh koneksi akun TikTok via Content Posting API).`
      );
    }

    await db
      .update(scheduledPosts)
      .set({ status: "posted", resultUrl, errorMessage: null, updatedAt: new Date() })
      .where(eq(scheduledPosts.id, row.id));

    await notifyUser(row, `✅ *Jadwal berhasil diposting!*\n\n🎬 ${row.title || "Klip"}\n🔗 ${resultUrl}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const maxAttempts = getSchedulerMaxAttempts();
    const willRetry = row.attempts + 1 < maxAttempts;

    await db
      .update(scheduledPosts)
      .set({
        status: willRetry ? "pending" : "failed",
        errorMessage: message,
        updatedAt: new Date(),
      })
      .where(eq(scheduledPosts.id, row.id));

    if (!willRetry) {
      await notifyUser(
        row,
        `❌ *Jadwal gagal diposting* (percobaan ke-${row.attempts + 1}/${maxAttempts})\n\n🎬 ${row.title || "Klip"}\nAlasan: ${message}`
      );
    }
  }
}

/** Ambil semua antrean yang sudah jatuh tempo & masih dalam batas toleransi, lalu eksekusi berurutan. */
export async function runDueScheduledPosts(): Promise<{ processed: number }> {
  const now = new Date();
  const graceMs = getSchedulerGraceMinutes() * 60 * 1000;
  const cutoff = new Date(now.getTime() - graceMs);

  const due = await db
    .select()
    .from(scheduledPosts)
    .where(and(eq(scheduledPosts.status, "pending"), lte(scheduledPosts.scheduledAt, now)));

  // Tandai yang sudah terlalu lama terlewat (lebih dari grace period) sebagai gagal,
  // supaya tidak menumpuk/di-retry selamanya (mis. server sempat down lama).
  const expired = due.filter((row) => new Date(row.scheduledAt).getTime() < cutoff.getTime());
  if (expired.length) {
    await db
      .update(scheduledPosts)
      .set({ status: "failed", errorMessage: "Lewat batas toleransi waktu (server tidak aktif saat jadwal tiba).", updatedAt: new Date() })
      .where(inArray(scheduledPosts.id, expired.map((r) => r.id)));
  }

  const toRun = due.filter((row) => new Date(row.scheduledAt).getTime() >= cutoff.getTime());
  for (const row of toRun) {
    await executeScheduledPost(row);
  }

  return { processed: toRun.length };
}

// ─── TELEGRAM NOTIFICATION (lazy import untuk hindari circular dependency) ─

async function notifyUser(row: ScheduledPostRow, text: string): Promise<void> {
  try {
    const { bot } = await import("@/lib/telegram-bot");
    await bot.api.sendMessage(row.telegramChatId, text, { parse_mode: "Markdown" });
  } catch (err) {
    console.warn("[scheduler] Gagal mengirim notifikasi Telegram:", err);
  }
}

export async function getRecentCompletedJobsForUser(telegramUserId: string, limit = 5) {
  return db
    .select()
    .from(clipJobs)
    .where(and(eq(clipJobs.telegramUserId, telegramUserId), eq(clipJobs.status, "done")))
    .orderBy(desc(clipJobs.createdAt))
    .limit(limit);
}
