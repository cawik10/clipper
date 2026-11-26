/**
 * 🚨 POST-UPLOAD CLAIM MONITOR — LOGIKA UTAMA (FITUR BARU!)
 * =====================================================================
 * Dipanggil berkala oleh src/lib/claim-monitor-worker.ts (atau manual lewat
 * /claims run & GET /api/claims/run). Alurnya:
 *
 *   1. DISCOVER  — klip yang sudah diupload ke YouTube (clip_jobs.clips[].youtubeVideoId)
 *                  didaftarkan ke tabel `video_claim_watch` + dicatat source channel-nya
 *                  (dari log Source Guard, atau dari monitor channel).
 *   2. CHECK     — YouTube `videos.list` (part=status,contentDetails; 1 unit kuota per
 *                  50 video) → cari klaim / pembatasan:
 *                    status.uploadStatus=rejected + status.rejectionReason
 *                    contentDetails.licensedContent=true      (Content ID / content partner)
 *                    contentDetails.regionRestriction         (diblokir di sebagian negara)
 *   3. ALERT     — klaim BARU dikirim ke Telegram dengan tombol Hapus / Private / Abaikan.
 *   4. RASIO     — klaim per source channel dihitung; channel yang melewati ambang
 *                  di-AUTO-BLACKLIST (lihat source-blacklist.ts) + monitornya dijeda.
 *
 * 🧑‍⚖️ Bot TIDAK pernah menghapus / memprivatekan video sendiri. Aksi baru berjalan
 *    setelah user menekan tombol (applyClaimDecision di bawah).
 *
 * Semua pengaturan: src/lib/claim-monitor-config.ts (env Railway).
 */

import { google, type youtube_v3 } from "googleapis";
import { and, desc, eq, gte, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { InlineKeyboard } from "grammy";
import { db } from "@/db";
import {
  clipJobs,
  monitoredChannels,
  sourceGuardLog,
  videoClaimWatch,
  type ClipResult,
  type VideoClaimWatchRow,
} from "@/db/schema";
import { escapeHtml } from "@/lib/analytics-report";
import { classifyError, getYoutubeClient } from "@/lib/auto-title-doctor";
import { getYoutubeApiKey } from "@/lib/channel-monitor-config";
import { ensureChannelMonitorTables, listMonitorsForUser, setMonitorEnabled } from "@/lib/channel-monitor";
import {
  CLAIM_BATCH_SIZE,
  CLAIM_REQUIRED_SCOPES,
  CLAIM_TEXT,
  REJECTION_LABELS,
  describeBlacklistRule,
  getBlacklistMinClaims,
  getBlacklistMinClips,
  getBlacklistRatioPercent,
  getClaimActions,
  getClaimFreshDays,
  getClaimHideTo,
  getClaimMaxAlertsPerCycle,
  getClaimOldRecheckHours,
  getClaimReminderHours,
  getClaimSignals,
  getClaimTrackDays,
  isAutoBlacklistEnabled,
  isBlacklistNotifyEnabled,
  isClaimMonitorEnabled,
  isClaimNotifyEnabled,
  shouldCountIgnoredClaims,
  shouldPauseBlacklistedMonitors,
  type ClaimSignalType,
} from "@/lib/claim-monitor-config";
import {
  addBlacklistEntry,
  buildChannelTokens,
  findBlacklistMatch,
  findReleasedEntry,
  parseTokens,
} from "@/lib/source-blacklist";
import {
  ensureSourceGuardTables,
  getOwnChannelTokens,
  listUserWhitelist,
  normalizeChannelToken,
} from "@/lib/source-guard";
import { getEnvWhitelist, isOwnChannelAllowed } from "@/lib/source-guard-config";

const HOUR = 3_600_000;
const DAY = 86_400_000;

// ─── TABEL (dibuat otomatis) ─────────────────────────────────────────────

let tableReady: Promise<void> | null = null;

export function ensureClaimTables(): Promise<void> {
  if (!tableReady) {
    tableReady = (async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS video_claim_watch (
          id serial PRIMARY KEY,
          youtube_video_id text NOT NULL UNIQUE,
          job_id text NOT NULL,
          telegram_user_id text NOT NULL,
          title text NOT NULL,
          source_url text,
          source_title text,
          channel_key text NOT NULL DEFAULT 'unknown',
          channel_name text,
          channel_tokens text,
          claim_state text NOT NULL DEFAULT 'ok',
          action_status text NOT NULL DEFAULT 'none',
          signals text,
          privacy_status text,
          first_claim_at timestamp,
          last_checked_at timestamp,
          last_notified_at timestamp,
          notified_count integer NOT NULL DEFAULT 0,
          decided_at timestamp,
          last_error text,
          uploaded_at timestamp NOT NULL DEFAULT now(),
          created_at timestamp NOT NULL DEFAULT now(),
          updated_at timestamp NOT NULL DEFAULT now()
        )
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS video_claim_watch_user_idx ON video_claim_watch (telegram_user_id, claim_state)
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS video_claim_watch_channel_idx ON video_claim_watch (telegram_user_id, channel_key)
      `);
    })().catch((err) => {
      tableReady = null;
      throw err;
    });
  }
  return tableReady;
}

// ─── TIPE ────────────────────────────────────────────────────────────────

export interface ClaimSignal {
  type: ClaimSignalType;
  detail: string;
}

export interface ClaimRunSummary {
  enabled: boolean;
  discovered: number;
  users: number;
  checked: number;
  newClaims: number;
  cleared: number;
  missing: number;
  alerted: number;
  blacklisted: number;
  errors: string[];
}

export interface ChannelClaimStat {
  channelKey: string;
  channelName: string;
  tokens: string[];
  /** Klip dari channel ini yang sudah berhasil dicek. */
  clips: number;
  /** Klip yang pernah kena klaim / pembatasan. */
  claims: number;
  ratioPercent: number;
  blacklisted: boolean;
}

export type ClaimDecision = "delete" | "private" | "ignore";

export interface ClaimDecisionResult {
  ok: boolean;
  status?: string;
  message: string;
  row?: VideoClaimWatchRow;
}

// ─── DETEKSI KLAIM / PEMBATASAN ──────────────────────────────────────────

/** Ubah respons videos.list jadi daftar sinyal klaim/pembatasan (hanya sinyal yang diaktifkan). */
export function detectClaimSignals(
  video: youtube_v3.Schema$Video,
  enabled: ClaimSignalType[] = getClaimSignals()
): ClaimSignal[] {
  const out: ClaimSignal[] = [];
  const status = video.status;
  const details = video.contentDetails;

  if (enabled.includes("rejected")) {
    const reason = status?.rejectionReason || "";
    if (status?.uploadStatus === "rejected" || reason) {
      out.push({
        type: "rejected",
        detail: REJECTION_LABELS[reason] || `Ditolak YouTube${reason ? ` (${reason})` : ""}`,
      });
    }
  }

  if (enabled.includes("licensed") && details?.licensedContent === true) {
    out.push({ type: "licensed", detail: "Konten berlisensi — diklaim content partner (Content ID)" });
  }

  if (enabled.includes("region")) {
    const rr = details?.regionRestriction;
    if (rr?.blocked && rr.blocked.length > 0) {
      out.push({
        type: "region",
        detail: `Diblokir di ${rr.blocked.length} negara (${rr.blocked.slice(0, 6).join(", ")}${rr.blocked.length > 6 ? ", …" : ""})`,
      });
    } else if (Array.isArray(rr?.allowed)) {
      out.push({
        type: "region",
        detail: rr.allowed.length === 0 ? "Diblokir di semua negara" : `Hanya tersedia di ${rr.allowed.length} negara`,
      });
    }
  }

  if (enabled.includes("age") && details?.contentRating?.ytRating === "ytAgeRestricted") {
    out.push({ type: "age", detail: "Dibatasi usia (age-restricted)" });
  }

  return out;
}

function parseSignals(raw: string | null | undefined): ClaimSignal[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ClaimSignal[]) : [];
  } catch {
    return [];
  }
}

// ─── DISCOVER: daftarkan klip yang sudah diupload ────────────────────────

interface SourceIdentity {
  key: string;
  name: string | null;
  tokens: string[];
}

const UNKNOWN_SOURCE: SourceIdentity = { key: "unknown", name: null, tokens: [] };

function identityFrom(channelId: string | null | undefined, channelName: string | null | undefined): SourceIdentity | null {
  const tokens = buildChannelTokens([channelId, channelName]);
  if (!tokens.length) return null;
  const key = (channelId && normalizeChannelToken(channelId)) || tokens[0];
  return { key, name: channelName || channelId || null, tokens };
}

/** Daftarkan klip baru (yang sudah punya youtubeVideoId) ke tabel pantauan. Return jumlah baris baru. */
export async function discoverClaimWatch(userId?: string): Promise<number> {
  await ensureClaimTables();
  const cutoff = new Date(Date.now() - getClaimTrackDays() * DAY);
  const conditions = [gte(clipJobs.updatedAt, cutoff), isNotNull(clipJobs.clips)];
  if (userId) conditions.push(eq(clipJobs.telegramUserId, userId));
  const jobs = await db.select().from(clipJobs).where(and(...conditions));
  if (!jobs.length) return 0;

  const known = new Set((await db.select({ id: videoClaimWatch.youtubeVideoId }).from(videoClaimWatch)).map((r) => r.id));
  const fresh = jobs.filter((j) => ((j.clips as ClipResult[] | null) || []).some((c) => c.youtubeVideoId && !known.has(c.youtubeVideoId)));
  if (!fresh.length) return 0;

  // Source channel dari log Source Guard (satu baris per job)
  const guardByJob = new Map<string, SourceIdentity>();
  try {
    await ensureSourceGuardTables();
    const logs = await db
      .select()
      .from(sourceGuardLog)
      .where(inArray(sourceGuardLog.jobId, fresh.map((j) => j.jobId)));
    for (const l of logs) {
      const id = identityFrom(l.channelId, l.channelName);
      if (id) guardByJob.set(l.jobId, id);
    }
  } catch (err) {
    console.warn("[claim-monitor] gagal membaca log Source Guard:", err instanceof Error ? err.message : err);
  }

  // Cadangan: monitor channel yang membuat job ini
  const monitorById = new Map<number, SourceIdentity>();
  try {
    const monitorIds = Array.from(new Set(fresh.map((j) => j.sourceMonitorId).filter((v): v is number => typeof v === "number")));
    if (monitorIds.length) {
      await ensureChannelMonitorTables();
      const monitors = await db.select().from(monitoredChannels).where(inArray(monitoredChannels.id, monitorIds));
      for (const m of monitors) {
        if (m.sourceType !== "channel") continue;
        const id = identityFrom(m.externalId, m.title);
        if (id) monitorById.set(m.id, id);
      }
    }
  } catch (err) {
    console.warn("[claim-monitor] gagal membaca monitor channel:", err instanceof Error ? err.message : err);
  }

  let inserted = 0;
  for (const job of fresh) {
    const source =
      guardByJob.get(job.jobId) || (job.sourceMonitorId != null ? monitorById.get(job.sourceMonitorId) : undefined) || UNKNOWN_SOURCE;
    for (const clip of (job.clips as ClipResult[] | null) || []) {
      if (!clip.youtubeVideoId || known.has(clip.youtubeVideoId)) continue;
      const res = await db
        .insert(videoClaimWatch)
        .values({
          youtubeVideoId: clip.youtubeVideoId,
          jobId: job.jobId,
          telegramUserId: job.telegramUserId,
          title: (clip.title || "Tanpa judul").slice(0, 200),
          sourceUrl: job.sourceUrl,
          sourceTitle: job.videoTitle || null,
          channelKey: source.key,
          channelName: source.name,
          channelTokens: JSON.stringify(source.tokens),
          uploadedAt: job.updatedAt,
        })
        .onConflictDoNothing()
        .returning({ id: videoClaimWatch.id });
      known.add(clip.youtubeVideoId);
      if (res.length) inserted++;
    }
  }
  return inserted;
}

// ─── CHECK: videos.list ──────────────────────────────────────────────────

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const VIDEO_PARTS = ["status", "contentDetails"];

interface FetchOutcome {
  videos: Map<string, youtube_v3.Schema$Video>;
  /** id yang BERHASIL dicek lewat OAuth pemilik (video tidak ada di respons = benar-benar hilang). */
  authoritative: Set<string>;
  /** id yang berhasil dicek (OAuth atau API key). */
  checked: Set<string>;
  errors: string[];
}

async function fetchVideoStates(userId: string, ids: string[]): Promise<FetchOutcome> {
  const out: FetchOutcome = { videos: new Map(), authoritative: new Set(), checked: new Set(), errors: [] };

  // 1) OAuth pemilik channel — bisa baca status.rejectionReason & video private
  try {
    const client = await getYoutubeClient(userId);
    if (!("youtube" in client)) {
      out.errors.push(`OAuth: ${client.error}`);
    } else {
      for (const batch of chunk(ids, CLAIM_BATCH_SIZE)) {
        try {
          const res = await client.youtube.videos.list({ part: VIDEO_PARTS, id: batch, maxResults: CLAIM_BATCH_SIZE });
          for (const item of res.data.items || []) if (item.id) out.videos.set(item.id, item);
          for (const id of batch) {
            out.authoritative.add(id);
            out.checked.add(id);
          }
        } catch (err) {
          out.errors.push(`OAuth: ${classifyError(err).message.slice(0, 160)}`);
        }
      }
    }
  } catch (err) {
    out.errors.push(`OAuth: ${err instanceof Error ? err.message.slice(0, 160) : String(err)}`);
  }

  // 2) Cadangan: API key (hanya video public/unlisted; tanpa rejectionReason)
  const missing = ids.filter((id) => !out.checked.has(id));
  const apiKey = getYoutubeApiKey();
  if (missing.length && apiKey) {
    const yt = google.youtube({ version: "v3", auth: apiKey });
    for (const batch of chunk(missing, CLAIM_BATCH_SIZE)) {
      try {
        const res = await yt.videos.list({ part: VIDEO_PARTS, id: batch, maxResults: CLAIM_BATCH_SIZE });
        for (const item of res.data.items || []) {
          if (!item.id) continue;
          out.videos.set(item.id, item);
          out.checked.add(item.id);
        }
      } catch (err) {
        out.errors.push(`API key: ${classifyError(err).message.slice(0, 160)}`);
      }
    }
  }
  return out;
}

function isDue(row: VideoClaimWatchRow, now: number, force: boolean): boolean {
  if (row.claimState === "missing" || row.actionStatus === "deleted") return false;
  if (force || !row.lastCheckedAt) return true;
  const age = now - row.uploadedAt.getTime();
  if (age < getClaimFreshDays() * DAY) return true;
  return now - row.lastCheckedAt.getTime() >= getClaimOldRecheckHours() * HOUR;
}

interface UserCheckResult {
  checked: number;
  newClaims: number;
  cleared: number;
  missing: number;
  errors: string[];
}

async function checkUserVideos(userId: string, rows: VideoClaimWatchRow[]): Promise<UserCheckResult> {
  const result: UserCheckResult = { checked: 0, newClaims: 0, cleared: 0, missing: 0, errors: [] };
  const fetched = await fetchVideoStates(userId, rows.map((r) => r.youtubeVideoId));
  const unique = Array.from(new Set(fetched.errors));
  result.errors.push(...unique);
  const now = new Date();

  for (const row of rows) {
    const video = fetched.videos.get(row.youtubeVideoId);

    if (!video) {
      if (fetched.authoritative.has(row.youtubeVideoId)) {
        // Pemilik channel tidak lagi melihat video ini → sudah dihapus / dibuang YouTube.
        await db
          .update(videoClaimWatch)
          .set({ claimState: "missing", lastCheckedAt: now, lastError: null, updatedAt: now })
          .where(eq(videoClaimWatch.id, row.id));
        result.missing++;
      } else if (!fetched.checked.has(row.youtubeVideoId)) {
        await db
          .update(videoClaimWatch)
          .set({ lastError: (unique[0] || "Video tidak terbaca (butuh /connect ulang atau YOUTUBE_API_KEY)").slice(0, 300), updatedAt: now })
          .where(eq(videoClaimWatch.id, row.id));
      }
      continue;
    }

    result.checked++;
    const signals = detectClaimSignals(video);
    const patch: Partial<typeof videoClaimWatch.$inferInsert> = {
      lastCheckedAt: now,
      lastError: null,
      privacyStatus: video.status?.privacyStatus || row.privacyStatus,
      signals: signals.length ? JSON.stringify(signals) : null,
      updatedAt: now,
    };

    if (signals.length) {
      patch.claimState = "claimed";
      if (!row.firstClaimAt) patch.firstClaimAt = now;
      if (row.actionStatus === "none") {
        patch.actionStatus = "pending";
        result.newClaims++;
      }
    } else if (row.claimState === "claimed") {
      // Klaim sudah dilepas / tidak lagi terdeteksi
      patch.claimState = "ok";
      if (row.actionStatus === "pending" || row.actionStatus === "ignored") patch.actionStatus = "none";
      result.cleared++;
    } else {
      patch.claimState = "ok";
    }

    await db.update(videoClaimWatch).set(patch).where(eq(videoClaimWatch.id, row.id));
  }
  return result;
}

// ─── RASIO KLAIM PER SOURCE CHANNEL ──────────────────────────────────────

/** Hitung rasio klaim per source channel (channel "unknown" tidak dihitung). */
export async function getChannelClaimStats(userId: string | null): Promise<ChannelClaimStat[]> {
  await ensureClaimTables();
  const where = userId
    ? and(eq(videoClaimWatch.telegramUserId, userId), isNotNull(videoClaimWatch.lastCheckedAt), ne(videoClaimWatch.channelKey, "unknown"))
    : and(isNotNull(videoClaimWatch.lastCheckedAt), ne(videoClaimWatch.channelKey, "unknown"));
  const rows = await db.select().from(videoClaimWatch).where(where);

  const countIgnored = shouldCountIgnoredClaims();
  const map = new Map<string, ChannelClaimStat & { owner: string }>();
  for (const r of rows) {
    const mapKey = `${r.telegramUserId}|${r.channelKey}`;
    let s = map.get(mapKey);
    if (!s) {
      s = {
        channelKey: r.channelKey,
        channelName: r.channelName || r.channelKey,
        tokens: parseTokens(r.channelTokens),
        clips: 0,
        claims: 0,
        ratioPercent: 0,
        blacklisted: false,
        owner: r.telegramUserId,
      };
      map.set(mapKey, s);
    }
    s.clips++;
    if (r.firstClaimAt && (countIgnored || r.actionStatus !== "ignored")) s.claims++;
  }

  const stats: ChannelClaimStat[] = [];
  for (const s of map.values()) {
    const blacklisted = !!(await findBlacklistMatch(s.owner, s.tokens.length ? s.tokens : [s.channelKey]).catch(() => null));
    stats.push({
      channelKey: s.channelKey,
      channelName: s.channelName,
      tokens: s.tokens,
      clips: s.clips,
      claims: s.claims,
      ratioPercent: s.clips ? Math.round((s.claims / s.clips) * 100) : 0,
      blacklisted,
    });
  }
  stats.sort((a, b) => b.ratioPercent - a.ratioPercent || b.claims - a.claims || b.clips - a.clips);
  return stats;
}

/** Channel yang dilindungi (whitelist / milik sendiri) TIDAK PERNAH di-auto-blacklist. */
async function isProtectedChannel(userId: string, tokens: string[]): Promise<boolean> {
  const set = new Set(tokens);
  const envEntries = getEnvWhitelist().map(normalizeChannelToken).filter(Boolean);
  if (envEntries.some((t) => set.has(t))) return true;
  const mine = await listUserWhitelist(userId).catch(() => []);
  if (mine.some((r) => set.has(r.entry))) return true;
  if (isOwnChannelAllowed()) {
    const own = await getOwnChannelTokens(userId).catch(() => [] as string[]);
    if (own.some((t) => set.has(t))) return true;
  }
  return false;
}

/** Jeda Auto-Monitor milik user yang menunjuk channel ini. Return jumlah monitor yang dijeda. */
export async function pauseMonitorsForChannel(userId: string, tokens: string[]): Promise<number> {
  if (!shouldPauseBlacklistedMonitors() || !tokens.length) return 0;
  try {
    const monitors = await listMonitorsForUser(userId);
    const set = new Set(tokens);
    let paused = 0;
    for (const m of monitors) {
      if (m.sourceType !== "channel" || !m.enabled) continue;
      const mt = buildChannelTokens([m.externalId, m.title]);
      if (mt.some((t) => set.has(t))) {
        if (await setMonitorEnabled(m.id, userId, false)) paused++;
      }
    }
    return paused;
  } catch (err) {
    console.warn("[claim-monitor] gagal menjeda monitor:", err instanceof Error ? err.message : err);
    return 0;
  }
}

/** Tambah channel ke blacklist (manual) + jeda monitornya. */
export async function blacklistChannelManually(
  userId: string,
  raw: string
): Promise<{ added: boolean; label: string; pausedMonitors: number }> {
  // Perluas token dari riwayat (mis. @handle → ID UCxxx) supaya cocok dengan metadata sumber.
  const identities: string[] = [raw];
  const token = normalizeChannelToken(raw);
  let label = raw;
  if (token) {
    await ensureClaimTables();
    const rows = await db
      .select({ name: videoClaimWatch.channelName, tokens: videoClaimWatch.channelTokens })
      .from(videoClaimWatch)
      .where(eq(videoClaimWatch.telegramUserId, userId));
    for (const r of rows) {
      const tokens = parseTokens(r.tokens);
      if (tokens.includes(token)) {
        identities.push(...tokens);
        if (r.name) label = r.name;
        break;
      }
    }
  }
  const res = await addBlacklistEntry(userId, { identities, label, origin: "manual", reason: "Ditambahkan manual lewat /blacklist" });
  const pausedMonitors = res.added ? await pauseMonitorsForChannel(userId, res.tokens) : 0;
  return { added: res.added, label: res.row?.channelName || label, pausedMonitors };
}

/** Evaluasi rasio klaim user → auto-blacklist channel yang melewati ambang. */
export async function evaluateAutoBlacklist(userId: string): Promise<Array<{ id: number; stat: ChannelClaimStat; pausedMonitors: number }>> {
  if (!isAutoBlacklistEnabled()) return [];
  const minClips = getBlacklistMinClips();
  const minClaims = getBlacklistMinClaims();
  const ratio = getBlacklistRatioPercent();

  const stats = await getChannelClaimStats(userId);
  const out: Array<{ id: number; stat: ChannelClaimStat; pausedMonitors: number }> = [];
  for (const s of stats) {
    if (s.blacklisted) continue;
    if (s.clips < minClips || s.claims < minClaims || s.ratioPercent < ratio) continue;
    const identities = s.tokens.length ? s.tokens : [s.channelKey];
    if (await isProtectedChannel(userId, identities)) continue;
    // Sudah dilepas user → hanya blacklist lagi kalau ada klaim BARU sejak dilepas
    const released = await findReleasedEntry(userId, identities);
    if (released && s.claims <= released.claims) continue;

    const res = await addBlacklistEntry(userId, {
      identities,
      label: s.channelName,
      origin: "auto",
      reason: `Rasio klaim ${s.ratioPercent}% (${s.claims}/${s.clips} klip)`,
      claims: s.claims,
      clips: s.clips,
      ratioPercent: s.ratioPercent,
    });
    if (!res.added || !res.row) continue;
    const pausedMonitors = await pauseMonitorsForChannel(userId, res.tokens);
    out.push({ id: res.row.id, stat: { ...s, blacklisted: true }, pausedMonitors });
  }
  return out;
}

// ─── TELEGRAM ────────────────────────────────────────────────────────────

export function buildClaimKeyboard(id: number): InlineKeyboard {
  const actions = getClaimActions();
  const kb = new InlineKeyboard();
  if (actions.includes("delete")) kb.text("🗑 Hapus", `claim:d:${id}`);
  if (actions.includes("private")) kb.text(`🔒 ${getClaimHideTo() === "unlisted" ? "Unlisted" : "Private"}`, `claim:p:${id}`);
  kb.text("🙈 Abaikan", `claim:i:${id}`);
  return kb;
}

export function buildClaimMessage(row: VideoClaimWatchRow, stat?: ChannelClaimStat | null): string {
  const signals = parseSignals(row.signals);
  const source =
    row.channelKey !== "unknown"
      ? `\n📡 Sumber: <b>${escapeHtml((row.channelName || row.channelKey).slice(0, 80))}</b>` +
        (stat ? ` — ${stat.claims}/${stat.clips} klip kena klaim (${stat.ratioPercent}%)${stat.blacklisted ? " ⛔ blacklist" : ""}` : "")
      : "";
  return (
    `🎬 <a href="https://youtu.be/${row.youtubeVideoId}">${escapeHtml(row.title.slice(0, 100))}</a>` +
    source +
    (row.privacyStatus ? `\n👁 Privasi saat ini: <code>${escapeHtml(row.privacyStatus)}</code>` : "") +
    (signals.length ? `\n${signals.map((s) => `⚠️ ${escapeHtml(s.detail)}`).join("\n")}` : "") +
    (row.lastError ? `\n❗ <i>${escapeHtml(row.lastError.slice(0, 160))}</i>` : "")
  );
}

async function resolveClaimChatId(userId: string): Promise<string> {
  const jobs = await db
    .select({ chatId: clipJobs.telegramChatId })
    .from(clipJobs)
    .where(eq(clipJobs.telegramUserId, userId))
    .orderBy(desc(clipJobs.createdAt))
    .limit(1);
  return jobs[0]?.chatId || userId;
}

export async function sendClaimTelegram(userId: string, text: string, keyboard?: InlineKeyboard): Promise<void> {
  const chatId = await resolveClaimChatId(userId);
  const { bot } = await import("@/lib/telegram-bot");
  await bot.api.sendMessage(chatId, text.slice(0, 4000), {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...(keyboard ? { reply_markup: keyboard } : {}),
  });
}

/** Kirim alert (dengan tombol) untuk daftar baris. Return jumlah yang terkirim. */
export async function sendClaimAlerts(userId: string, rows: VideoClaimWatchRow[], totalPending: number): Promise<number> {
  if (!rows.length) return 0;
  const stats = await getChannelClaimStats(userId).catch(() => [] as ChannelClaimStat[]);
  const statByKey = new Map(stats.map((s) => [s.channelKey, s]));

  await sendClaimTelegram(
    userId,
    `${CLAIM_TEXT.header}\n${CLAIM_TEXT.headerHint}\n\n` +
      `🚩 <b>${totalPending}</b> klip menunggu keputusan` +
      (rows.length < totalPending ? `\nMenampilkan ${rows.length} dulu; sisanya lihat <code>/claims list</code>.` : "")
  );
  let sent = 0;
  for (const row of rows) {
    try {
      await sendClaimTelegram(userId, buildClaimMessage(row, statByKey.get(row.channelKey)), buildClaimKeyboard(row.id));
      await db
        .update(videoClaimWatch)
        .set({ notifiedCount: sql`${videoClaimWatch.notifiedCount} + 1`, lastNotifiedAt: new Date(), updatedAt: new Date() })
        .where(eq(videoClaimWatch.id, row.id));
      sent++;
    } catch (err) {
      console.warn("[claim-monitor] alert Telegram gagal:", err instanceof Error ? err.message : err);
      break;
    }
  }
  return sent;
}

async function sendBlacklistNotice(userId: string, added: Array<{ id: number; stat: ChannelClaimStat; pausedMonitors: number }>): Promise<void> {
  for (const a of added) {
    const kb = new InlineKeyboard().text("↩️ Keluarkan dari blacklist", `bl:rm:${a.id}`);
    await sendClaimTelegram(
      userId,
      `${CLAIM_TEXT.blacklisted}\n\n` +
        `📡 <b>${escapeHtml(a.stat.channelName.slice(0, 80))}</b>\n` +
        `📊 ${a.stat.claims} dari ${a.stat.clips} klip kena klaim (<b>${a.stat.ratioPercent}%</b>)\n` +
        `<i>Aturan: ${escapeHtml(describeBlacklistRule())}</i>\n\n` +
        `Video dari channel ini tidak akan diproses lagi.` +
        (a.pausedMonitors ? `\n⏸ ${a.pausedMonitors} Auto-Monitor untuk channel ini dijeda.` : "") +
        `\nKelola: <code>/blacklist</code>`,
      kb
    ).catch((err) => console.warn("[claim-monitor] notifikasi blacklist gagal:", err instanceof Error ? err.message : err));
  }
}

// ─── DATA (untuk Telegram & dashboard) ───────────────────────────────────

export async function getPendingClaims(userId: string | null, limit = 10): Promise<VideoClaimWatchRow[]> {
  await ensureClaimTables();
  const cond = and(eq(videoClaimWatch.actionStatus, "pending"), eq(videoClaimWatch.claimState, "claimed"));
  const where = userId ? and(cond, eq(videoClaimWatch.telegramUserId, userId)) : cond;
  return db.select().from(videoClaimWatch).where(where).orderBy(desc(videoClaimWatch.firstClaimAt)).limit(limit);
}

export async function getClaimHistory(userId: string | null, limit = 5): Promise<VideoClaimWatchRow[]> {
  await ensureClaimTables();
  const decided = and(isNotNull(videoClaimWatch.decidedAt), ne(videoClaimWatch.actionStatus, "pending"));
  const where = userId ? and(decided, eq(videoClaimWatch.telegramUserId, userId)) : decided;
  return db.select().from(videoClaimWatch).where(where).orderBy(desc(videoClaimWatch.decidedAt)).limit(limit);
}

export async function getClaimCounts(userId: string | null): Promise<{
  tracked: number;
  checked: number;
  claimed: number;
  pending: number;
  ignored: number;
  privated: number;
  deleted: number;
  lastCheckedAt: Date | null;
}> {
  await ensureClaimTables();
  const rows = userId
    ? await db.select().from(videoClaimWatch).where(eq(videoClaimWatch.telegramUserId, userId))
    : await db.select().from(videoClaimWatch);
  const everClaimed = rows.filter((r) => !!r.firstClaimAt);
  const last = rows.reduce<Date | null>((acc, r) => (r.lastCheckedAt && (!acc || r.lastCheckedAt > acc) ? r.lastCheckedAt : acc), null);
  return {
    tracked: rows.length,
    checked: rows.filter((r) => !!r.lastCheckedAt).length,
    claimed: rows.filter((r) => r.claimState === "claimed").length,
    pending: rows.filter((r) => r.actionStatus === "pending" && r.claimState === "claimed").length,
    ignored: everClaimed.filter((r) => r.actionStatus === "ignored").length,
    privated: everClaimed.filter((r) => r.actionStatus === "private" || r.actionStatus === "unlisted").length,
    deleted: everClaimed.filter((r) => r.actionStatus === "deleted").length,
    lastCheckedAt: last,
  };
}

export async function getOwnedClaim(userId: string, id: number): Promise<VideoClaimWatchRow | null> {
  await ensureClaimTables();
  const rows = await db.select().from(videoClaimWatch).where(eq(videoClaimWatch.id, id));
  const row = rows[0];
  return row && row.telegramUserId === userId ? row : null;
}

// ─── KEPUTUSAN USER (dipanggil dari tombol Telegram) ─────────────────────

async function setAction(id: number, action: string, error: string | null = null): Promise<VideoClaimWatchRow> {
  const [row] = await db
    .update(videoClaimWatch)
    .set({
      actionStatus: action,
      lastError: error,
      decidedAt: action === "pending" ? null : new Date(),
      ...(action === "deleted" ? { claimState: "missing" } : {}),
      updatedAt: new Date(),
    })
    .where(eq(videoClaimWatch.id, id))
    .returning();
  return row;
}

async function recordError(id: number, message: string): Promise<VideoClaimWatchRow> {
  const [row] = await db
    .update(videoClaimWatch)
    .set({ lastError: message.slice(0, 300), updatedAt: new Date() })
    .where(eq(videoClaimWatch.id, id))
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

function hasClaimScope(scope: string | null | undefined): boolean | null {
  if (!scope || !scope.trim()) return null; // tidak diketahui → coba saja
  const granted = scope.split(/[\s,]+/);
  return CLAIM_REQUIRED_SCOPES.some((s) => granted.includes(s));
}

/**
 * Jalankan keputusan user atas satu alert.
 *  - ignore  → tandai diabaikan (tidak dialert lagi sampai klaim lepas lalu muncul lagi)
 *  - private → ubah privasi video (CLAIM_MONITOR_HIDE_TO, default private)
 *  - delete  → hapus video dari YouTube (videos.delete)
 * Kalau gagal (mis. izin kurang), alert tetap "pending" supaya bisa dicoba lagi.
 */
export async function applyClaimDecision(userId: string, id: number, decision: ClaimDecision): Promise<ClaimDecisionResult> {
  const row = await getOwnedClaim(userId, id);
  if (!row) return { ok: false, message: "Alert tidak ditemukan." };
  if (row.actionStatus !== "pending") {
    return { ok: false, status: row.actionStatus, row, message: `Alert ini sudah diputuskan (${row.actionStatus}).` };
  }

  if (decision === "ignore") {
    const updated = await setAction(id, "ignored");
    return { ok: true, status: "ignored", row: updated, message: CLAIM_TEXT.ignored };
  }

  if (!getClaimActions().includes(decision)) {
    return { ok: false, row, message: `Aksi "${decision}" dimatikan lewat CLAIM_MONITOR_ACTIONS.` };
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
  if (hasClaimScope(client.scope) === false) {
    const msg = "Izin YouTube belum cukup untuk mengubah video (butuh youtube.force-ssl). Kirim /connect sekali lagi.";
    const updated = await recordError(id, msg);
    return { ok: false, row: updated, message: msg };
  }
  const { youtube } = client;

  try {
    if (decision === "delete") {
      try {
        await youtube.videos.delete({ id: row.youtubeVideoId });
      } catch (err) {
        const status = Number((err as { code?: number | string })?.code ?? (err as { response?: { status?: number } })?.response?.status);
        if (status !== 404) throw err; // 404 = sudah tidak ada → anggap berhasil
      }
      const updated = await setAction(id, "deleted");
      return { ok: true, status: "deleted", row: updated, message: CLAIM_TEXT.deleted };
    }

    // private/unlisted: videos.update part=status — field status lain dipertahankan supaya tidak ter-reset
    const current = await youtube.videos.list({ part: ["status"], id: [row.youtubeVideoId] });
    const status = current.data.items?.[0]?.status;
    if (!status) {
      const updated = await setAction(id, "deleted", "Video tidak ditemukan di YouTube (mungkin sudah dihapus)");
      return { ok: true, status: "deleted", row: updated, message: "ℹ️ Video sudah tidak ada di YouTube." };
    }
    const hideTo = getClaimHideTo();
    if (status.privacyStatus !== hideTo) {
      const { uploadStatus, failureReason, rejectionReason, madeForKids, publishAt, ...editable } = status;
      await youtube.videos.update({
        part: ["status"],
        requestBody: { id: row.youtubeVideoId, status: { ...editable, privacyStatus: hideTo } },
      });
    }
    const updated = await setAction(id, hideTo);
    await db.update(videoClaimWatch).set({ privacyStatus: hideTo }).where(eq(videoClaimWatch.id, id));
    return { ok: true, status: hideTo, row: { ...updated, privacyStatus: hideTo }, message: hideTo === "private" ? CLAIM_TEXT.privated : CLAIM_TEXT.unlisted };
  } catch (err) {
    const c = classifyError(err);
    const updated = await recordError(id, c.message);
    return { ok: false, row: updated, message: friendlyError(c.message, c.kind) };
  }
}

// ─── INTI: DISCOVER → CHECK → ALERT → BLACKLIST ──────────────────────────

const globalForClaims = globalThis as typeof globalThis & { __claimMonitorRunning?: boolean };

export interface RunClaimOptions {
  /** Batasi ke satu user. */
  userId?: string;
  /** Abaikan jeda pengecekan (cek semua video sekarang). */
  force?: boolean;
  /** false = jangan kirim alert Telegram (default: ikut CLAIM_MONITOR_NOTIFY). */
  notify?: boolean;
  /** true = kirim ulang semua alert yang masih menunggu. */
  resend?: boolean;
}

export async function runClaimMonitor(opts: RunClaimOptions = {}): Promise<ClaimRunSummary> {
  const summary: ClaimRunSummary = {
    enabled: isClaimMonitorEnabled(),
    discovered: 0,
    users: 0,
    checked: 0,
    newClaims: 0,
    cleared: 0,
    missing: 0,
    alerted: 0,
    blacklisted: 0,
    errors: [],
  };
  if (!summary.enabled) return summary;
  if (globalForClaims.__claimMonitorRunning) {
    summary.errors.push("Siklus sebelumnya masih berjalan");
    return summary;
  }
  globalForClaims.__claimMonitorRunning = true;

  try {
    await ensureClaimTables();
    summary.discovered = await discoverClaimWatch(opts.userId);

    const cutoff = new Date(Date.now() - getClaimTrackDays() * DAY);
    const conditions = [gte(videoClaimWatch.uploadedAt, cutoff), ne(videoClaimWatch.claimState, "missing")];
    if (opts.userId) conditions.push(eq(videoClaimWatch.telegramUserId, opts.userId));
    const rows = await db.select().from(videoClaimWatch).where(and(...conditions));

    const now = Date.now();
    const byUser = new Map<string, VideoClaimWatchRow[]>();
    for (const r of rows) {
      if (!isDue(r, now, !!opts.force)) continue;
      const list = byUser.get(r.telegramUserId) || [];
      list.push(r);
      byUser.set(r.telegramUserId, list);
    }
    // user yang punya alert menunggu juga diproses (untuk pengingat), walau tak ada video due
    if (opts.resend || getClaimReminderHours() > 0) {
      for (const r of await getPendingClaims(opts.userId ?? null, 500)) if (!byUser.has(r.telegramUserId)) byUser.set(r.telegramUserId, []);
    }
    summary.users = byUser.size;

    for (const [userId, due] of byUser) {
      try {
        if (due.length) {
          const r = await checkUserVideos(userId, due);
          summary.checked += r.checked;
          summary.newClaims += r.newClaims;
          summary.cleared += r.cleared;
          summary.missing += r.missing;
          for (const e of r.errors) summary.errors.push(`user ${userId}: ${e}`);
        }

        // Rasio klaim → auto-blacklist
        const added = await evaluateAutoBlacklist(userId);
        summary.blacklisted += added.length;

        // Alert klaim (baru, atau pengingat)
        const notify = opts.notify ?? isClaimNotifyEnabled();
        if (notify) {
          const pending = await getPendingClaims(userId, 500);
          const reminderMs = getClaimReminderHours() * HOUR;
          const dueAlerts = pending.filter((p) => {
            if (opts.resend) return true;
            if (!p.lastNotifiedAt) return true;
            return reminderMs > 0 && Date.now() - p.lastNotifiedAt.getTime() >= reminderMs;
          });
          const batch = dueAlerts.slice(0, getClaimMaxAlertsPerCycle());
          if (batch.length) {
            try {
              summary.alerted += await sendClaimAlerts(userId, batch, dueAlerts.length);
            } catch (err) {
              summary.errors.push(`Telegram: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
        }
        if (added.length && isBlacklistNotifyEnabled() && (opts.notify ?? isClaimNotifyEnabled())) {
          await sendBlacklistNotice(userId, added);
        }
      } catch (err) {
        summary.errors.push(`user ${userId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } catch (err) {
    summary.errors.push(err instanceof Error ? err.message : String(err));
  } finally {
    globalForClaims.__claimMonitorRunning = false;
  }
  return summary;
}
