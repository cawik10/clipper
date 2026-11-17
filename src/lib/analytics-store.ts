/**
 * 📈 AI ANALYTICS — DATA LAYER (FITUR BARU!)
 * =====================================================================
 * - Membuat tabel analytics otomatis saat runtime (tanpa drizzle-kit push)
 * - Menemukan klip yang sudah diupload ke YouTube (dari `clip_jobs.clips`)
 * - Menarik views/likes/comments dari YouTube Data API
 * - Klasifikasi niche per klip + agregasi (klip teratas, ranking niche)
 *
 * Konfigurasi: src/lib/analytics-config.ts
 */

import { db } from "@/db";
import {
  clipJobs,
  clipPerformance,
  analyticsUserState,
  userSettings,
  youtubeTokens,
  type ClipResult,
  type ClipPerformanceRow,
  type AnalyticsUserStateRow,
} from "@/db/schema";
import { and, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import { NICHE_PRESETS } from "@/lib/niche-prompt";
import {
  NICHE_KEYWORDS,
  NICHE_MIN_KEYWORD_HITS,
  NICHE_UNKNOWN_LABEL,
  getTrackDays,
} from "@/lib/analytics-config";
import { getYoutubeApiKey } from "@/lib/channel-monitor-config";
import { isTokenExpired, refreshAccessToken } from "@/lib/youtube-uploader";

// ─── TABEL (dibuat otomatis) ─────────────────────────────────────────────

let tablesReady: Promise<void> | null = null;

export function ensureAnalyticsTables(): Promise<void> {
  if (!tablesReady) {
    tablesReady = (async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS clip_performance (
          id serial PRIMARY KEY,
          youtube_video_id text NOT NULL UNIQUE,
          job_id text NOT NULL,
          telegram_user_id text NOT NULL,
          clip_index integer,
          title text NOT NULL,
          niche text NOT NULL DEFAULT 'Umum',
          viral_score integer,
          duration integer,
          hook text,
          source_title text,
          views integer NOT NULL DEFAULT 0,
          likes integer NOT NULL DEFAULT 0,
          comments integer NOT NULL DEFAULT 0,
          views_baseline integer NOT NULL DEFAULT 0,
          stats_source text,
          last_synced_at timestamp,
          sync_error text,
          uploaded_at timestamp NOT NULL DEFAULT now(),
          created_at timestamp NOT NULL DEFAULT now()
        )
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS clip_performance_user_idx ON clip_performance (telegram_user_id)
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS analytics_user_state (
          id serial PRIMARY KEY,
          telegram_user_id text NOT NULL UNIQUE,
          telegram_chat_id text,
          weekly_report_enabled boolean NOT NULL DEFAULT true,
          learning_enabled boolean NOT NULL DEFAULT true,
          learned_prompt text,
          learned_insights text,
          learned_at timestamp,
          learned_sample_size integer,
          last_report_key text,
          last_report_at timestamp,
          created_at timestamp NOT NULL DEFAULT now(),
          updated_at timestamp NOT NULL DEFAULT now()
        )
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS analytics_learning_log (
          id serial PRIMARY KEY,
          telegram_user_id text NOT NULL,
          previous_prompt text,
          new_prompt text NOT NULL,
          insights text,
          sample_size integer NOT NULL DEFAULT 0,
          top_niche text,
          method text NOT NULL DEFAULT 'ai',
          applied boolean NOT NULL DEFAULT true,
          created_at timestamp NOT NULL DEFAULT now()
        )
      `);
    })().catch((err) => {
      tablesReady = null;
      throw err;
    });
  }
  return tablesReady;
}

// ─── STATE PER USER ──────────────────────────────────────────────────────

/** Ambil (atau buat) state analytics milik user. */
export async function getOrCreateUserState(userId: string, chatId?: string | null): Promise<AnalyticsUserStateRow> {
  await ensureAnalyticsTables();
  await db
    .insert(analyticsUserState)
    .values({ telegramUserId: userId, telegramChatId: chatId ?? null })
    .onConflictDoNothing();
  const rows = await db.select().from(analyticsUserState).where(eq(analyticsUserState.telegramUserId, userId));
  const row = rows[0];
  if (chatId && row.telegramChatId !== chatId) {
    await db
      .update(analyticsUserState)
      .set({ telegramChatId: chatId, updatedAt: new Date() })
      .where(eq(analyticsUserState.telegramUserId, userId));
    row.telegramChatId = chatId;
  }
  return row;
}

export async function patchUserState(
  userId: string,
  patch: Partial<Omit<AnalyticsUserStateRow, "id" | "telegramUserId" | "createdAt" | "updatedAt">>
): Promise<void> {
  await ensureAnalyticsTables();
  await db
    .update(analyticsUserState)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(analyticsUserState.telegramUserId, userId));
}

/** Cari chat Telegram tujuan untuk satu user (state → job terakhir → user id itu sendiri). */
export async function resolveChatId(userId: string): Promise<string> {
  const state = await getOrCreateUserState(userId);
  if (state.telegramChatId) return state.telegramChatId;
  const jobs = await db
    .select({ chatId: clipJobs.telegramChatId })
    .from(clipJobs)
    .where(eq(clipJobs.telegramUserId, userId))
    .orderBy(desc(clipJobs.createdAt))
    .limit(1);
  return jobs[0]?.chatId || userId;
}

// ─── KLASIFIKASI NICHE ───────────────────────────────────────────────────

export interface NicheClassifyInput {
  title?: string | null;
  description?: string | null;
  tags?: string[] | null;
  reason?: string | null;
  hook?: string | null;
}

/**
 * Tentukan niche klip: (1) skor kata kunci dari konten klip, (2) kalau tidak
 * ada yang cocok → pakai preset yang sama dengan niche prompt user, (3) "Umum".
 */
export function classifyClipNiche(input: NicheClassifyInput, nichePrompt?: string | null): string {
  const text = [input.title, input.description, (input.tags || []).join(" "), input.reason, input.hook]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  let best: string | null = null;
  let bestHits = 0;
  for (const preset of NICHE_PRESETS) {
    const keywords = NICHE_KEYWORDS[preset.label] ?? [];
    const hits = keywords.filter((k) => text.includes(k.toLowerCase())).length;
    if (hits > bestHits) {
      best = preset.label;
      bestHits = hits;
    }
  }
  if (best && bestHits >= NICHE_MIN_KEYWORD_HITS) return best;

  const prompt = (nichePrompt || "").trim();
  if (prompt) {
    const preset = NICHE_PRESETS.find((p) => p.prompt === prompt);
    if (preset) return preset.label;
  }
  return NICHE_UNKNOWN_LABEL;
}

// ─── PENEMUAN KLIP ───────────────────────────────────────────────────────

/**
 * Pindai `clip_jobs` untuk klip yang sudah punya `youtubeVideoId` dan daftarkan
 * ke `clip_performance` (idempoten). Return jumlah klip baru.
 */
export async function discoverUploadedClips(userId?: string): Promise<number> {
  await ensureAnalyticsTables();
  const cutoff = new Date(Date.now() - getTrackDays() * 86_400_000);
  const conditions = [gte(clipJobs.updatedAt, cutoff), isNotNull(clipJobs.clips)];
  if (userId) conditions.push(eq(clipJobs.telegramUserId, userId));

  const jobs = await db
    .select()
    .from(clipJobs)
    .where(and(...conditions));

  const promptRows = await db
    .select({ userId: userSettings.telegramUserId, prompt: userSettings.nichePrompt })
    .from(userSettings);
  const promptByUser = new Map(promptRows.map((r) => [r.userId, r.prompt]));

  let inserted = 0;
  for (const job of jobs) {
    const clips = (job.clips as ClipResult[] | null) || [];
    for (const clip of clips) {
      if (!clip.youtubeVideoId) continue;
      const res = await db
        .insert(clipPerformance)
        .values({
          youtubeVideoId: clip.youtubeVideoId,
          jobId: job.jobId,
          telegramUserId: job.telegramUserId,
          clipIndex: clip.index ?? null,
          title: (clip.title || "Tanpa judul").slice(0, 200),
          niche: classifyClipNiche(clip, promptByUser.get(job.telegramUserId)),
          viralScore: typeof clip.viralScore === "number" ? Math.round(clip.viralScore) : null,
          duration: clip.duration ? Math.round(clip.duration) : null,
          hook: clip.hook || null,
          sourceTitle: job.videoTitle || null,
          uploadedAt: job.updatedAt,
        })
        .onConflictDoNothing()
        .returning({ id: clipPerformance.id });
      if (res.length) inserted++;
    }
  }
  return inserted;
}

// ─── SINKRONISASI VIEWS DARI YOUTUBE ─────────────────────────────────────

interface VideoStat {
  views: number;
  likes: number;
  comments: number;
}

type StatMap = Map<string, VideoStat>;

function parseStat(s: { viewCount?: string | null; likeCount?: string | null; commentCount?: string | null } | undefined): VideoStat {
  return {
    views: parseInt(s?.viewCount || "0", 10) || 0,
    likes: parseInt(s?.likeCount || "0", 10) || 0,
    comments: parseInt(s?.commentCount || "0", 10) || 0,
  };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Baca statistik via OAuth milik user (bisa membaca video private/draft jika scope youtube.readonly diizinkan). */
async function fetchStatsViaOAuth(userId: string, ids: string[]): Promise<{ stats: StatMap; error?: string }> {
  const stats: StatMap = new Map();
  const tokenRows = await db.select().from(youtubeTokens).where(eq(youtubeTokens.telegramUserId, userId));
  if (!tokenRows.length) return { stats, error: "YouTube belum terhubung" };
  const tokenRow = tokenRows[0];

  let accessToken = tokenRow.accessToken;
  if (isTokenExpired(tokenRow.expiresAt)) {
    try {
      const fresh = await refreshAccessToken(tokenRow.refreshToken);
      accessToken = fresh.accessToken;
      await db
        .update(youtubeTokens)
        .set({ accessToken: fresh.accessToken, expiresAt: fresh.expiresAt, updatedAt: new Date() })
        .where(eq(youtubeTokens.telegramUserId, userId));
    } catch (err) {
      return { stats, error: `Refresh token gagal: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  try {
    const { google } = await import("googleapis");
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    auth.setCredentials({ access_token: accessToken, refresh_token: tokenRow.refreshToken });
    const youtube = google.youtube({ version: "v3", auth });
    for (const batch of chunk(ids, 50)) {
      const res = await youtube.videos.list({ part: ["statistics"], id: batch, maxResults: 50 });
      for (const item of res.data.items || []) {
        if (item.id) stats.set(item.id, parseStat(item.statistics ?? undefined));
      }
    }
    return { stats };
  } catch (err) {
    return { stats, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Fallback: baca statistik video public/unlisted lewat YOUTUBE_API_KEY. */
async function fetchStatsViaApiKey(ids: string[]): Promise<{ stats: StatMap; error?: string }> {
  const stats: StatMap = new Map();
  const key = getYoutubeApiKey();
  if (!key) return { stats, error: "YOUTUBE_API_KEY belum diset" };
  try {
    for (const batch of chunk(ids, 50)) {
      const url =
        `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${batch.join(",")}` +
        `&maxResults=50&key=${encodeURIComponent(key)}`;
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return { stats, error: `YouTube API ${res.status}: ${body.slice(0, 160)}` };
      }
      const data = (await res.json()) as {
        items?: Array<{ id: string; statistics?: { viewCount?: string; likeCount?: string; commentCount?: string } }>;
      };
      for (const item of data.items || []) stats.set(item.id, parseStat(item.statistics));
    }
    return { stats };
  } catch (err) {
    return { stats, error: err instanceof Error ? err.message : String(err) };
  }
}

export interface SyncSummary {
  tracked: number;
  updated: number;
  unreadable: number;
  newClips: number;
  note?: string;
}

/** Temukan klip baru + tarik statistik terbaru untuk satu user. */
export async function syncUserStats(userId: string): Promise<SyncSummary> {
  await ensureAnalyticsTables();
  const newClips = await discoverUploadedClips(userId);
  const cutoff = new Date(Date.now() - getTrackDays() * 86_400_000);
  const rows = await db
    .select()
    .from(clipPerformance)
    .where(and(eq(clipPerformance.telegramUserId, userId), gte(clipPerformance.uploadedAt, cutoff)));

  if (!rows.length) return { tracked: 0, updated: 0, unreadable: 0, newClips };

  const ids = rows.map((r) => r.youtubeVideoId);
  const found: StatMap = new Map();
  const notes: string[] = [];

  const oauth = await fetchStatsViaOAuth(userId, ids);
  oauth.stats.forEach((v, k) => found.set(k, v));
  if (oauth.error) notes.push(`OAuth: ${oauth.error}`);

  const missing = ids.filter((id) => !found.has(id));
  if (missing.length && getYoutubeApiKey()) {
    const viaKey = await fetchStatsViaApiKey(missing);
    viaKey.stats.forEach((v, k) => found.set(k, v));
    if (viaKey.error) notes.push(`API key: ${viaKey.error}`);
  }

  const now = new Date();
  let updated = 0;
  let unreadable = 0;
  for (const row of rows) {
    const stat = found.get(row.youtubeVideoId);
    if (stat) {
      await db
        .update(clipPerformance)
        .set({
          views: stat.views,
          likes: stat.likes,
          comments: stat.comments,
          statsSource: "api",
          lastSyncedAt: now,
          syncError: null,
        })
        .where(eq(clipPerformance.id, row.id));
      updated++;
    } else {
      if (row.statsSource === "manual") continue; // views manual tidak ditandai error
      unreadable++;
      await db
        .update(clipPerformance)
        .set({
          syncError: "Statistik tidak terbaca (video private/dihapus, atau izin YouTube belum cukup)",
        })
        .where(eq(clipPerformance.id, row.id));
    }
  }

  return {
    tracked: rows.length,
    updated,
    unreadable,
    newClips,
    note: unreadable > 0 ? notes.join(" | ") || undefined : undefined,
  };
}

/** Isi views secara manual (untuk video private yang tidak bisa dibaca API). */
export async function setManualViews(userId: string, videoId: string, views: number): Promise<boolean> {
  await ensureAnalyticsTables();
  const res = await db
    .update(clipPerformance)
    .set({ views, statsSource: "manual", lastSyncedAt: new Date(), syncError: null })
    .where(and(eq(clipPerformance.telegramUserId, userId), eq(clipPerformance.youtubeVideoId, videoId)))
    .returning({ id: clipPerformance.id });
  return res.length > 0;
}

// ─── AGREGASI ────────────────────────────────────────────────────────────

/** Ambil baris performa (semua user kalau userId kosong), opsional dibatasi N hari terakhir (berdasar tanggal upload). */
export async function getPerformanceRows(userId?: string | null, days?: number | null): Promise<ClipPerformanceRow[]> {
  await ensureAnalyticsTables();
  const trackCutoff = new Date(Date.now() - getTrackDays() * 86_400_000);
  const cutoff = days && days > 0 ? new Date(Date.now() - days * 86_400_000) : trackCutoff;
  const conditions = [gte(clipPerformance.uploadedAt, cutoff)];
  if (userId) conditions.push(eq(clipPerformance.telegramUserId, userId));
  return db
    .select()
    .from(clipPerformance)
    .where(and(...conditions))
    .orderBy(desc(clipPerformance.views));
}

/** Hanya klip yang statistiknya sudah pernah berhasil dibaca (API atau manual). */
export function withStats(rows: ClipPerformanceRow[]): ClipPerformanceRow[] {
  return rows.filter((r) => r.lastSyncedAt !== null && r.statsSource !== null);
}

export interface NicheStat {
  niche: string;
  emoji: string;
  clips: number;
  views: number;
  gain: number;
  avgViews: number;
}

export function nicheEmoji(label: string): string {
  return NICHE_PRESETS.find((p) => p.label === label)?.emoji ?? "🎬";
}

/** Ranking niche berdasarkan total views (terbanyak di atas). */
export function buildNicheBreakdown(rows: ClipPerformanceRow[]): NicheStat[] {
  const map = new Map<string, NicheStat>();
  for (const r of withStats(rows)) {
    const cur =
      map.get(r.niche) ??
      ({ niche: r.niche, emoji: nicheEmoji(r.niche), clips: 0, views: 0, gain: 0, avgViews: 0 } as NicheStat);
    cur.clips += 1;
    cur.views += r.views;
    cur.gain += Math.max(0, r.views - r.viewsBaseline);
    map.set(r.niche, cur);
  }
  const list = Array.from(map.values());
  list.forEach((n) => (n.avgViews = n.clips ? Math.round(n.views / n.clips) : 0));
  return list.sort((a, b) => b.views - a.views);
}

export interface PerformanceTotals {
  tracked: number;
  withData: number;
  views: number;
  gain: number;
  likes: number;
  comments: number;
  avgViews: number;
}

export function buildTotals(rows: ClipPerformanceRow[]): PerformanceTotals {
  const data = withStats(rows);
  const views = data.reduce((s, r) => s + r.views, 0);
  return {
    tracked: rows.length,
    withData: data.length,
    views,
    gain: data.reduce((s, r) => s + Math.max(0, r.views - r.viewsBaseline), 0),
    likes: data.reduce((s, r) => s + r.likes, 0),
    comments: data.reduce((s, r) => s + r.comments, 0),
    avgViews: data.length ? Math.round(views / data.length) : 0,
  };
}

/** Simpan views saat ini sebagai baseline → laporan berikutnya menampilkan pertumbuhan sejak sekarang. */
export async function markReportBaseline(userId: string): Promise<void> {
  await ensureAnalyticsTables();
  await db
    .update(clipPerformance)
    .set({ viewsBaseline: sql`${clipPerformance.views}` })
    .where(eq(clipPerformance.telegramUserId, userId));
}

/** Daftar user yang punya klip terlacak. */
export async function listTrackedUserIds(): Promise<string[]> {
  await ensureAnalyticsTables();
  const rows = await db
    .select({ userId: clipPerformance.telegramUserId })
    .from(clipPerformance)
    .groupBy(clipPerformance.telegramUserId);
  return rows.map((r) => r.userId);
}

/** Waktu sinkronisasi terakhir (paling baru) untuk satu user, atau null kalau belum pernah. */
export async function getLastSyncAt(userId: string): Promise<Date | null> {
  await ensureAnalyticsTables();
  const rows = await db
    .select({ at: sql<Date | null>`max(${clipPerformance.lastSyncedAt})` })
    .from(clipPerformance)
    .where(eq(clipPerformance.telegramUserId, userId));
  const at = rows[0]?.at;
  return at ? new Date(at) : null;
}
