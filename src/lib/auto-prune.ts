/**
 * ✂️ AUTO-PRUNE KLIP GAGAL — LOGIKA UTAMA (FITUR BARU! bagian dari AI Analytics Loop)
 * =====================================================================
 * Dipanggil oleh worker analytics (src/lib/analytics-worker.ts) SETELAH views
 * terbaru ditarik dan Auto-Title Doctor selesai. Alurnya per user:
 *
 *   1. Cari klip yang: tayang > N hari (14), views < ambang (50), statistiknya
 *      baru & terbaca, dan sudah pernah di-retitle sukses ≥ N kali (1) —
 *      lewat tabel `clip_retitle_log` milik Auto-Title Doctor.
 *   2. Cek ke YouTube (1 panggilan per 50 video) bahwa video masih ada dan
 *      privasinya termasuk yang boleh diusulkan (default public/unlisted).
 *   3. Simpan sebagai USULAN di tabel `clip_prune_suggestion` (dibuat otomatis).
 *   4. Kirim ke Telegram dengan tombol [🙈 Sembunyikan] [🗑 Hapus] [✅ Pertahankan].
 *
 * 🧑‍⚖️ Bot TIDAK pernah menyembunyikan / menghapus apa pun sendiri. Aksi baru
 *    berjalan setelah user menekan tombol (lihat src/lib/auto-prune-telegram.ts
 *    → applyPruneDecision di bawah).
 *
 * Semua pengaturan ada di src/lib/auto-prune-config.ts (env Railway).
 */

import { and, desc, eq, gte, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { InlineKeyboard } from "grammy";
import { db } from "@/db";
import {
  clipPerformance,
  clipPruneSuggestion,
  clipRetitleLog,
  type ClipPerformanceRow,
  type ClipPruneSuggestionRow,
} from "@/db/schema";
import { ensureAnalyticsTables, resolveChatId } from "@/lib/analytics-store";
import { escapeHtml } from "@/lib/analytics-report";
import { ensureRetitleTable, classifyError, getYoutubeClient, hasRequiredScope } from "@/lib/auto-title-doctor";
import {
  PRUNE_TEXT,
  describePruneRules,
  getPruneActions,
  getPruneAllowedPrivacy,
  getPruneHideTo,
  getPruneKeepSnoozeDays,
  getPruneMaxPerNotify,
  getPruneMaxStaleHours,
  getPruneMinAgeDays,
  getPruneMinRetitles,
  getPruneReminderDays,
  getPruneRetitleGraceDays,
  getPruneViewsThreshold,
  isAutoPruneEnabled,
  isPruneNotifyEnabled,
  type PruneAction,
} from "@/lib/auto-prune-config";

const HOUR = 3_600_000;
const DAY = 86_400_000;

// ─── TABEL (dibuat otomatis) ─────────────────────────────────────────────

let tableReady: Promise<void> | null = null;

export function ensurePruneTable(): Promise<void> {
  if (!tableReady) {
    tableReady = (async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS clip_prune_suggestion (
          id serial PRIMARY KEY,
          youtube_video_id text NOT NULL UNIQUE,
          telegram_user_id text NOT NULL,
          title text NOT NULL,
          views integer NOT NULL DEFAULT 0,
          age_days integer NOT NULL DEFAULT 0,
          retitle_count integer NOT NULL DEFAULT 0,
          status text NOT NULL DEFAULT 'pending',
          last_error text,
          notified_count integer NOT NULL DEFAULT 0,
          last_notified_at timestamp,
          decided_at timestamp,
          created_at timestamp NOT NULL DEFAULT now(),
          updated_at timestamp NOT NULL DEFAULT now()
        )
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS clip_prune_suggestion_user_idx ON clip_prune_suggestion (telegram_user_id, status)
      `);
    })().catch((err) => {
      tableReady = null;
      throw err;
    });
  }
  return tableReady;
}

// ─── TIPE ────────────────────────────────────────────────────────────────

export interface PruneSummary {
  userId: string;
  enabled: boolean;
  /** Klip yang memenuhi semua kriteria (termasuk yang sudah pernah diusulkan & menunggu keputusan). */
  candidates: number;
  /** Usulan baru yang dibuat di siklus ini. */
  suggested: number;
  /** Jumlah klip yang dikirim ke Telegram di siklus ini. */
  notified: number;
  skipped?: string;
  errors: string[];
}

export type PruneDecision = "hide" | "delete" | "keep";

export interface PruneDecisionResult {
  ok: boolean;
  /** Status akhir usulan (kalau ok) atau status yang sudah ada (kalau sudah diputuskan). */
  status?: string;
  message: string;
  row?: ClipPruneSuggestionRow;
}

// ─── CARI KANDIDAT ───────────────────────────────────────────────────────

interface Candidate {
  clip: ClipPerformanceRow;
  retitleCount: number;
  ageDays: number;
}

/** Klip user yang memenuhi kriteria "gagal" (belum memperhitungkan status usulan & privasi). */
async function findCandidates(userId: string): Promise<{ candidates: Candidate[]; readableCount: number }> {
  const now = Date.now();
  const readable = await db
    .select()
    .from(clipPerformance)
    .where(
      and(
        eq(clipPerformance.telegramUserId, userId),
        isNotNull(clipPerformance.lastSyncedAt),
        isNull(clipPerformance.syncError)
      )
    );

  const minAgeMs = getPruneMinAgeDays() * DAY;
  const threshold = getPruneViewsThreshold();
  const staleMs = getPruneMaxStaleHours() * HOUR;
  const minRetitles = getPruneMinRetitles();
  const graceMs = getPruneRetitleGraceDays() * DAY;

  // Riwayat retitle SUKSES (simulasi/dry-run & gagal tidak dihitung)
  const retitles = new Map<string, { count: number; last: number }>();
  if (minRetitles > 0) {
    await ensureRetitleTable();
    const logs = await db
      .select()
      .from(clipRetitleLog)
      .where(and(eq(clipRetitleLog.telegramUserId, userId), eq(clipRetitleLog.status, "success")));
    for (const l of logs) {
      const cur = retitles.get(l.youtubeVideoId) ?? { count: 0, last: 0 };
      cur.count++;
      cur.last = Math.max(cur.last, l.createdAt.getTime());
      retitles.set(l.youtubeVideoId, cur);
    }
  }

  const candidates: Candidate[] = [];
  for (const clip of readable) {
    const age = now - clip.uploadedAt.getTime();
    if (age < minAgeMs) continue;
    if (clip.views >= threshold) continue;
    if (!clip.lastSyncedAt || now - clip.lastSyncedAt.getTime() > staleMs) continue;
    const r = retitles.get(clip.youtubeVideoId);
    if (minRetitles > 0) {
      if (!r || r.count < minRetitles) continue;
      if (now - r.last < graceMs) continue;
    }
    candidates.push({ clip, retitleCount: r?.count ?? 0, ageDays: Math.floor(age / DAY) });
  }
  candidates.sort((a, b) => a.clip.views - b.clip.views || b.ageDays - a.ageDays);
  return { candidates, readableCount: readable.length };
}

/** Ambil privasi video dari YouTube (batch 50). Map kosong / video tidak ada di map = tidak diketahui. */
async function fetchPrivacy(userId: string, videoIds: string[]): Promise<{ privacy: Map<string, string>; checked: boolean; error?: string }> {
  const privacy = new Map<string, string>();
  if (!videoIds.length) return { privacy, checked: true };
  try {
    const client = await getYoutubeClient(userId);
    if (!("youtube" in client)) return { privacy, checked: false, error: client.error };
    for (let i = 0; i < videoIds.length; i += 50) {
      const res = await client.youtube.videos.list({ part: ["status"], id: videoIds.slice(i, i + 50), maxResults: 50 });
      for (const item of res.data.items || []) {
        if (item.id && item.status?.privacyStatus) privacy.set(item.id, item.status.privacyStatus);
      }
    }
    return { privacy, checked: true };
  } catch (err) {
    return { privacy, checked: false, error: classifyError(err).message };
  }
}

// ─── TELEGRAM ────────────────────────────────────────────────────────────

export function buildPruneKeyboard(id: number): InlineKeyboard {
  const actions = getPruneActions();
  const kb = new InlineKeyboard();
  if (actions.includes("hide")) kb.text(`🙈 Sembunyikan${getPruneHideTo() === "unlisted" ? " (unlisted)" : ""}`, `prune:h:${id}`);
  if (actions.includes("delete")) kb.text("🗑 Hapus", `prune:d:${id}`);
  kb.row().text("✅ Pertahankan", `prune:k:${id}`);
  return kb;
}

export function buildPruneMessage(row: ClipPruneSuggestionRow): string {
  return (
    `🎬 <a href="https://youtu.be/${row.youtubeVideoId}">${escapeHtml(row.title.slice(0, 100))}</a>\n` +
    `👁 <b>${row.views.toLocaleString("id-ID")}</b> views · 📅 ${row.ageDays} hari tayang` +
    (row.retitleCount > 0 ? ` · ✏️ sudah di-retitle ${row.retitleCount}x` : "") +
    (row.lastError ? `\n⚠️ <i>${escapeHtml(row.lastError.slice(0, 160))}</i>` : "")
  );
}

async function sendTelegram(userId: string, text: string, keyboard?: InlineKeyboard): Promise<void> {
  const chatId = await resolveChatId(userId);
  const { bot } = await import("@/lib/telegram-bot");
  await bot.api.sendMessage(chatId, text.slice(0, 4000), {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...(keyboard ? { reply_markup: keyboard } : {}),
  });
}

/** Kirim usulan (dengan tombol) ke Telegram untuk satu daftar baris. Mengembalikan jumlah yang terkirim. */
export async function sendPruneSuggestions(
  userId: string,
  rows: ClipPruneSuggestionRow[],
  ctx: { totalPending: number; readableCount: number }
): Promise<number> {
  if (!rows.length) return 0;
  const share = ctx.readableCount > 0 ? Math.round((ctx.totalPending / ctx.readableCount) * 100) : 0;
  await sendTelegram(
    userId,
    `${PRUNE_TEXT.header}\n${PRUNE_TEXT.headerHint}\n\n` +
      `📉 <b>${ctx.totalPending}</b> klip sepi menunggu keputusan` +
      (ctx.readableCount > 0 ? ` (±${share}% dari ${ctx.readableCount} klip terlacak)` : "") +
      (rows.length < ctx.totalPending ? `\nMenampilkan ${rows.length} dulu; sisanya menyusul / lihat <code>/prune list</code>.` : "") +
      `\n<i>Aturan: ${escapeHtml(describePruneRules())}</i>`
  );
  let sent = 0;
  for (const row of rows) {
    try {
      await sendTelegram(userId, buildPruneMessage(row), buildPruneKeyboard(row.id));
      await db
        .update(clipPruneSuggestion)
        .set({ notifiedCount: sql`${clipPruneSuggestion.notifiedCount} + 1`, lastNotifiedAt: new Date(), updatedAt: new Date() })
        .where(eq(clipPruneSuggestion.id, row.id));
      sent++;
    } catch (err) {
      console.warn("[auto-prune] notifikasi Telegram gagal:", err instanceof Error ? err.message : err);
      break;
    }
  }
  return sent;
}

// ─── INTI: CARI & USULKAN ────────────────────────────────────────────────

export async function runAutoPrune(userId: string, opts: { notify?: boolean; resend?: boolean } = {}): Promise<PruneSummary> {
  const summary: PruneSummary = { userId, enabled: isAutoPruneEnabled(), candidates: 0, suggested: 0, notified: 0, errors: [] };
  if (!summary.enabled) {
    summary.skipped = "AUTO_PRUNE_ENABLED=false";
    return summary;
  }

  await ensureAnalyticsTables();
  await ensurePruneTable();

  const { candidates, readableCount } = await findCandidates(userId);
  const existing = await db.select().from(clipPruneSuggestion).where(eq(clipPruneSuggestion.telegramUserId, userId));
  const byVideo = new Map(existing.map((r) => [r.youtubeVideoId, r]));
  const now = Date.now();
  const threshold = getPruneViewsThreshold();

  // Usulan menunggu yang klipnya sudah pulih (views ≥ ambang) → tidak perlu lagi, hapus.
  const pending = existing.filter((r) => r.status === "pending");
  if (pending.length) {
    const recovered = await db
      .select({ id: clipPerformance.youtubeVideoId })
      .from(clipPerformance)
      .where(and(inArray(clipPerformance.youtubeVideoId, pending.map((p) => p.youtubeVideoId)), gte(clipPerformance.views, threshold)));
    if (recovered.length) {
      await db.delete(clipPruneSuggestion).where(
        and(
          eq(clipPruneSuggestion.status, "pending"),
          inArray(clipPruneSuggestion.youtubeVideoId, recovered.map((r) => r.id))
        )
      );
      for (const r of recovered) byVideo.delete(r.id);
    }
  }

  // Tentukan mana yang perlu dibuatkan usulan baru
  const snoozeMs = getPruneKeepSnoozeDays() * DAY;
  const fresh: Candidate[] = [];
  const refresh: Candidate[] = []; // usulan lama (pending) → perbarui angka views
  for (const c of candidates) {
    const row = byVideo.get(c.clip.youtubeVideoId);
    if (!row) fresh.push(c);
    else if (row.status === "pending") refresh.push(c);
    else if (row.status === "kept" && snoozeMs > 0 && row.decidedAt && now - row.decidedAt.getTime() >= snoozeMs) fresh.push(c);
    // hidden / deleted / kept (tanpa snooze) → dilewati
  }

  // Cek privasi di YouTube hanya untuk klip yang baru akan diusulkan
  let eligible = fresh;
  if (fresh.length) {
    const check = await fetchPrivacy(userId, fresh.map((c) => c.clip.youtubeVideoId));
    if (!check.checked) {
      summary.errors.push(`Tidak bisa cek privasi video: ${check.error}`);
    } else {
      const allowed = getPruneAllowedPrivacy();
      eligible = fresh.filter((c) => {
        const p = check.privacy.get(c.clip.youtubeVideoId);
        return p ? allowed.includes(p) : false; // tidak ditemukan di YouTube = sudah dihapus → lewati
      });
    }
  }

  for (const c of eligible) {
    const base = {
      title: c.clip.title,
      views: c.clip.views,
      ageDays: c.ageDays,
      retitleCount: c.retitleCount,
      updatedAt: new Date(),
    };
    const old = byVideo.get(c.clip.youtubeVideoId);
    if (old) {
      // "Dipertahankan" yang sudah lewat masa snooze → buka lagi
      await db
        .update(clipPruneSuggestion)
        .set({ ...base, status: "pending", decidedAt: null, lastError: null, lastNotifiedAt: null })
        .where(eq(clipPruneSuggestion.id, old.id));
    } else {
      await db
        .insert(clipPruneSuggestion)
        .values({ youtubeVideoId: c.clip.youtubeVideoId, telegramUserId: userId, ...base })
        .onConflictDoNothing();
    }
    summary.suggested++;
  }
  for (const c of refresh) {
    await db
      .update(clipPruneSuggestion)
      .set({ title: c.clip.title, views: c.clip.views, ageDays: c.ageDays, retitleCount: c.retitleCount, updatedAt: new Date() })
      .where(eq(clipPruneSuggestion.youtubeVideoId, c.clip.youtubeVideoId));
  }

  // Semua usulan menunggu milik user yang masih memenuhi kriteria
  const candidateIds = new Set(candidates.map((c) => c.clip.youtubeVideoId));
  const pendingRows = (await getPendingSuggestions(userId, 200)).filter((r) => candidateIds.has(r.youtubeVideoId));
  summary.candidates = pendingRows.length;

  // Notifikasi: yang belum pernah dikirim (atau sudah waktunya diingatkan)
  if ((opts.notify ?? true) && isPruneNotifyEnabled() && pendingRows.length) {
    const reminderMs = getPruneReminderDays() * DAY;
    const due = pendingRows.filter((r) => {
      if (opts.resend) return true;
      if (!r.lastNotifiedAt) return true;
      return reminderMs > 0 && now - r.lastNotifiedAt.getTime() >= reminderMs;
    });
    const batch = due.slice(0, getPruneMaxPerNotify());
    if (batch.length) {
      try {
        summary.notified = await sendPruneSuggestions(userId, batch, { totalPending: due.length, readableCount });
      } catch (err) {
        summary.errors.push(`Telegram: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
  if (!summary.candidates) summary.skipped = "tidak ada klip yang memenuhi kriteria";
  return summary;
}

export async function runAutoPruneForUsers(userIds: string[], opts: { notify?: boolean } = {}): Promise<PruneSummary[]> {
  const out: PruneSummary[] = [];
  for (const id of userIds) {
    try {
      out.push(await runAutoPrune(id, opts));
    } catch (err) {
      out.push({
        userId: id,
        enabled: isAutoPruneEnabled(),
        candidates: 0,
        suggested: 0,
        notified: 0,
        errors: [err instanceof Error ? err.message : String(err)],
      });
    }
  }
  return out;
}

// ─── KEPUTUSAN USER (dipanggil dari tombol Telegram) ─────────────────────

export async function getOwnedSuggestion(userId: string, id: number): Promise<ClipPruneSuggestionRow | null> {
  await ensurePruneTable();
  const rows = await db.select().from(clipPruneSuggestion).where(eq(clipPruneSuggestion.id, id));
  const row = rows[0];
  return row && row.telegramUserId === userId ? row : null;
}

async function setStatus(id: number, status: string, error: string | null = null): Promise<ClipPruneSuggestionRow> {
  const [row] = await db
    .update(clipPruneSuggestion)
    .set({ status, lastError: error, decidedAt: status === "pending" ? null : new Date(), updatedAt: new Date() })
    .where(eq(clipPruneSuggestion.id, id))
    .returning();
  return row;
}

async function recordError(id: number, message: string): Promise<ClipPruneSuggestionRow> {
  const [row] = await db
    .update(clipPruneSuggestion)
    .set({ lastError: message.slice(0, 300), updatedAt: new Date() })
    .where(eq(clipPruneSuggestion.id, id))
    .returning();
  return row;
}

function friendlyError(message: string, kind: string): string {
  if (kind === "permission") {
    return `Izin YouTube belum cukup untuk mengubah video. Kirim /connect sekali lagi lalu coba tombolnya lagi. (${message.slice(0, 120)})`;
  }
  if (kind === "quota") return "Kuota YouTube API hari ini habis. Coba lagi besok.";
  return message.slice(0, 200);
}

/**
 * Jalankan keputusan user atas satu usulan.
 *  - keep   → tandai dipertahankan (tidak diusulkan lagi)
 *  - hide   → ubah privasi video (AUTO_PRUNE_HIDE_TO, default private)
 *  - delete → hapus video dari YouTube (videos.delete)
 * Kalau gagal (mis. izin kurang), usulan tetap "pending" supaya bisa dicoba lagi.
 */
export async function applyPruneDecision(userId: string, id: number, decision: PruneDecision): Promise<PruneDecisionResult> {
  const row = await getOwnedSuggestion(userId, id);
  if (!row) return { ok: false, message: "Usulan tidak ditemukan." };
  if (row.status !== "pending") {
    return { ok: false, status: row.status, row, message: `Usulan ini sudah diputuskan (${row.status}).` };
  }

  if (decision === "keep") {
    const updated = await setStatus(id, "kept");
    return { ok: true, status: "kept", row: updated, message: PRUNE_TEXT.kept };
  }

  const action: PruneAction = decision;
  if (!getPruneActions().includes(action)) {
    return { ok: false, row, message: `Aksi "${action}" dimatikan lewat AUTO_PRUNE_ACTIONS.` };
  }

  let client: Awaited<ReturnType<typeof getYoutubeClient>>;
  try {
    client = await getYoutubeClient(userId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, row: await recordError(id, msg), message: friendlyError(msg, "youtube") };
  }
  if (!("youtube" in client)) {
    const updated = await recordError(id, client.error);
    return { ok: false, row: updated, message: friendlyError(client.error, client.kind) };
  }
  if (hasRequiredScope(client.scope) === false) {
    const msg = "Izin YouTube belum cukup untuk mengubah video (butuh youtube.force-ssl). Kirim /connect sekali lagi.";
    const updated = await recordError(id, msg);
    return { ok: false, row: updated, message: msg };
  }
  const { youtube } = client;

  try {
    if (action === "delete") {
      try {
        await youtube.videos.delete({ id: row.youtubeVideoId });
      } catch (err) {
        const status = Number((err as { code?: number | string })?.code ?? (err as { response?: { status?: number } })?.response?.status);
        if (status !== 404) throw err; // 404 = sudah tidak ada → anggap berhasil
      }
      const updated = await setStatus(id, "deleted");
      return { ok: true, status: "deleted", row: updated, message: PRUNE_TEXT.deleted };
    }

    // hide: videos.update part=status — field status lain dipertahankan supaya tidak ter-reset
    const current = await youtube.videos.list({ part: ["status"], id: [row.youtubeVideoId] });
    const status = current.data.items?.[0]?.status;
    if (!status) {
      const updated = await setStatus(id, "deleted", "Video tidak ditemukan di YouTube (mungkin sudah dihapus)");
      return { ok: true, status: "deleted", row: updated, message: "ℹ️ Video sudah tidak ada di YouTube." };
    }
    const hideTo = getPruneHideTo();
    if (status.privacyStatus !== hideTo) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { uploadStatus, failureReason, rejectionReason, madeForKids, publishAt, ...editable } = status;
      await youtube.videos.update({
        part: ["status"],
        requestBody: { id: row.youtubeVideoId, status: { ...editable, privacyStatus: hideTo } },
      });
    }
    const updated = await setStatus(id, "hidden");
    return {
      ok: true,
      status: "hidden",
      row: updated,
      message: `${PRUNE_TEXT.hidden} (${hideTo === "private" ? "Privat" : "Tidak terdaftar"})`,
    };
  } catch (err) {
    const c = classifyError(err);
    const updated = await recordError(id, c.message);
    return { ok: false, row: updated, message: friendlyError(c.message, c.kind) };
  }
}

// ─── DATA (untuk Telegram & dashboard) ───────────────────────────────────

export async function getPendingSuggestions(userId: string | null, limit = 10): Promise<ClipPruneSuggestionRow[]> {
  await ensurePruneTable();
  const where = userId
    ? and(eq(clipPruneSuggestion.status, "pending"), eq(clipPruneSuggestion.telegramUserId, userId))
    : eq(clipPruneSuggestion.status, "pending");
  return db.select().from(clipPruneSuggestion).where(where).orderBy(clipPruneSuggestion.views, desc(clipPruneSuggestion.ageDays)).limit(limit);
}

export async function getPruneHistory(userId: string | null, limit = 5): Promise<ClipPruneSuggestionRow[]> {
  await ensurePruneTable();
  const decided = sql`${clipPruneSuggestion.status} <> 'pending'`;
  const where = userId ? and(decided, eq(clipPruneSuggestion.telegramUserId, userId)) : decided;
  return db.select().from(clipPruneSuggestion).where(where).orderBy(desc(clipPruneSuggestion.decidedAt)).limit(limit);
}

export async function getPruneCounts(userId?: string | null): Promise<{ pending: number; hidden: number; deleted: number; kept: number }> {
  await ensurePruneTable();
  const rows = userId
    ? await db.select({ status: clipPruneSuggestion.status }).from(clipPruneSuggestion).where(eq(clipPruneSuggestion.telegramUserId, userId))
    : await db.select({ status: clipPruneSuggestion.status }).from(clipPruneSuggestion);
  const n = (s: string) => rows.filter((r) => r.status === s).length;
  return { pending: n("pending"), hidden: n("hidden"), deleted: n("deleted"), kept: n("kept") };
}
