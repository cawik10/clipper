/**
 * 🛡️ SOURCE CREDIT & COPYRIGHT GUARD — LOGIKA INTI (FITUR BARU!)
 * =====================================================================
 * Semua logika fitur ada di file ini; env var & default ada di
 * src/lib/source-guard-config.ts. File lain hanya memanggil 3 fungsi:
 *
 *   runSourceGuard(job)                → dipanggil job-processor SEBELUM download.
 *                                        Cek whitelist, Content ID, batas klip/hari.
 *   trimClipsToQuota(outcome, clips)   → dipanggil setelah AI memilih klip (mode block).
 *   applySourceCreditToClips(...)      → dipanggil job-processor SEBELUM upload YouTube,
 *                                        menambah "Source: <judul> — <channel> <link>".
 *
 * Mudah diganti:
 *   - Penanda Content ID      → DEFAULT_CONTENT_ID_KEYWORDS (config) / env
 *   - Cara mengambil metadata → fetchSourceMetadata() di bawah (yt-dlp)
 *   - Format kredit           → SOURCE_CREDIT_TEMPLATE
 *
 * Catatan jujur soal Content ID: YouTube tidak menyediakan API publik untuk
 * melihat klaim Content ID milik video orang lain. Deteksi di sini berbasis
 * SINYAL (metadata musik berlisensi, deskripsi "Provided to YouTube by",
 * pesan error "blocked on copyright grounds", kata kunci kustom). Ini mengurangi
 * risiko, bukan menjaminnya — whitelist tetap pengaman terkuat.
 */

import fs from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { clipJobs, sourceGuardLog, sourceWhitelist, youtubeTokens, type SourceGuardLogRow } from "@/db/schema";
import { normalizeSourceUrl } from "@/lib/duplicate-filter";
import {
  getContentIdKeywords,
  getCopyrightGuardMode,
  getCopyrightGuardScope,
  getEnvWhitelist,
  getGuardTimezone,
  getMaxClipsPerSourcePerDay,
  getPreflightTimeoutMs,
  getSourceCreditPosition,
  getSourceCreditTemplate,
  isMusicSignalEnabled,
  isOwnChannelAllowed,
  isSkipContentIdEnabled,
  isSourceCreditEnabled,
  isWhitelistRequired,
  type CopyrightGuardMode,
  type SourceCreditPosition,
} from "@/lib/source-guard-config";

const execFileAsync = promisify(execFile);

// ─── TIPE ────────────────────────────────────────────────────────────────
export type GuardViolationCode = "not_whitelisted" | "unverified" | "content_id" | "daily_limit";

export interface GuardViolation {
  code: GuardViolationCode;
  message: string;
}

export interface SourceMeta {
  id: string;
  title: string;
  channelId: string | null;
  channelName: string | null;
  channelUrl: string | null;
  uploader: string | null;
  uploaderId: string | null;
  uploaderUrl: string | null;
  description: string;
  track: string | null;
  artist: string | null;
  album: string | null;
  webpageUrl: string | null;
}

export interface GuardJobInput {
  jobId: string;
  sourceUrl: string;
  telegramUserId: string;
  sourceMonitorId?: number | null;
}

export interface GuardOutcome {
  /** false = guard tidak berlaku untuk job ini (mode off / scope monitor + link manual). */
  active: boolean;
  mode: CopyrightGuardMode;
  blocked: boolean;
  violations: GuardViolation[];
  meta: SourceMeta | null;
  sourceKey: string;
  quota: { limit: number; used: number; remaining: number | null };
}

export class SourceGuardBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceGuardBlockedError";
  }
}

export function isSourceGuardBlockedError(err: unknown): boolean {
  return err instanceof Error && err.name === "SourceGuardBlockedError";
}

// ─── TABLE BOOTSTRAP (Railway-friendly, pola sama dgn fitur lain) ─────────
let tablesReady: Promise<void> | null = null;
export function ensureSourceGuardTables(): Promise<void> {
  if (!tablesReady) {
    tablesReady = (async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS source_guard_log (
          id serial PRIMARY KEY,
          job_id text NOT NULL,
          telegram_user_id text NOT NULL,
          source_key text NOT NULL,
          source_url text NOT NULL,
          source_title text,
          channel_id text,
          channel_name text,
          monitor_id integer,
          mode text NOT NULL DEFAULT 'warn',
          decision text NOT NULL DEFAULT 'allowed',
          violations jsonb,
          clips_count integer NOT NULL DEFAULT 0,
          created_at timestamp NOT NULL DEFAULT now()
        )
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS source_guard_log_source_idx ON source_guard_log (source_key, created_at)
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS source_guard_log_job_idx ON source_guard_log (job_id)
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS source_whitelist (
          id serial PRIMARY KEY,
          telegram_user_id text NOT NULL,
          entry text NOT NULL,
          label text,
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

function rowsOf<T = Record<string, unknown>>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return ((result as { rows?: T[] })?.rows ?? []) as T[];
}

// ─── NORMALISASI IDENTITAS CHANNEL ───────────────────────────────────────
/** Ubah ID/@handle/nama/URL channel jadi token pembanding (huruf kecil, tanpa @). */
export function normalizeChannelToken(raw: string): string {
  let value = (raw || "").trim();
  if (!value) return "";

  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      const parts = url.pathname.split("/").filter(Boolean);
      const channelIdx = parts.findIndex((p) => p.toLowerCase() === "channel");
      if (channelIdx >= 0 && parts[channelIdx + 1]) {
        value = parts[channelIdx + 1];
      } else {
        const handle = parts.find((p) => p.startsWith("@"));
        if (handle) value = handle;
        else {
          const nameIdx = parts.findIndex((p) => ["c", "user"].includes(p.toLowerCase()));
          value = nameIdx >= 0 && parts[nameIdx + 1] ? parts[nameIdx + 1] : parts[0] || url.hostname;
        }
      }
    } catch {
      /* pakai nilai apa adanya */
    }
  }

  try {
    value = decodeURIComponent(value);
  } catch {
    /* ignore */
  }
  return value.replace(/^@+/, "").replace(/\/+$/, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function metaTokens(meta: SourceMeta): Set<string> {
  const out = new Set<string>();
  for (const v of [meta.channelId, meta.channelName, meta.uploader, meta.uploaderId, meta.channelUrl, meta.uploaderUrl]) {
    if (!v) continue;
    const token = normalizeChannelToken(v);
    if (token) out.add(token);
  }
  return out;
}

function describeChannel(meta: SourceMeta | null): string {
  if (!meta) return "tidak diketahui";
  return meta.channelName || meta.uploader || meta.channelId || meta.uploaderId || "tidak diketahui";
}

// ─── METADATA SUMBER (yt-dlp, tanpa download) ────────────────────────────
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() && v !== "NA" ? v.trim() : null;
}

async function runYtDlpInfo(url: string, extra: string[]): Promise<Record<string, unknown>> {
  const args = ["--dump-json", "--no-playlist", "--skip-download", "--no-warnings", ...extra];
  if (fs.existsSync("cookies.txt")) args.push("--cookies", "cookies.txt");
  args.push(url);
  const { stdout } = await execFileAsync("yt-dlp", args, {
    timeout: getPreflightTimeoutMs(),
    maxBuffer: 1024 * 1024 * 64,
  });
  return JSON.parse(stdout.trim().split("\n")[0]);
}

/**
 * Ganti fungsi ini kalau ingin sumber metadata lain (mis. YouTube Data API).
 * Mengembalikan SourceMeta atau melempar error (pesan error ikut dianalisis
 * untuk deteksi "diblokir karena hak cipta").
 */
export async function fetchSourceMetadata(url: string): Promise<SourceMeta> {
  let info: Record<string, unknown>;
  try {
    // Klien web default → membawa panel "Music in this video" (track/artist/album).
    info = await runYtDlpInfo(url, []);
  } catch (firstErr) {
    const firstMsg = firstErr instanceof Error ? firstErr.message : String(firstErr);
    // Pesan hak cipta tidak perlu dicoba ulang — itu sendiri sudah jawabannya.
    if (COPYRIGHT_ERROR_PATTERN.test(firstMsg)) throw firstErr;
    info = await runYtDlpInfo(url, ["--extractor-args", "youtube:player_client=web_safari,web_embedded,-tv_downgraded"]);
  }

  return {
    id: str(info.id) || "",
    title: str(info.title) || "",
    channelId: str(info.channel_id),
    channelName: str(info.channel),
    channelUrl: str(info.channel_url),
    uploader: str(info.uploader),
    uploaderId: str(info.uploader_id),
    uploaderUrl: str(info.uploader_url),
    description: typeof info.description === "string" ? info.description : "",
    track: str(info.track),
    artist: str(info.artist) || (Array.isArray(info.artists) ? str(info.artists[0]) : null),
    album: str(info.album),
    webpageUrl: str(info.webpage_url),
  };
}

const COPYRIGHT_ERROR_PATTERN =
  /copyright|who has blocked it|blocked it on|contains content from|content id/i;

// ─── DETEKSI CONTENT ID ──────────────────────────────────────────────────
export function detectContentIdSignals(meta: SourceMeta | null, preflightError?: string | null): string[] {
  const reasons: string[] = [];

  if (preflightError && COPYRIGHT_ERROR_PATTERN.test(preflightError)) {
    reasons.push("YouTube melaporkan video ini terkena klaim/blokir hak cipta");
  }
  if (!meta) return reasons;

  if (isMusicSignalEnabled() && (meta.track || meta.artist || meta.album)) {
    const label = [meta.artist, meta.track].filter(Boolean).join(" – ") || meta.album;
    reasons.push(`memuat musik berlisensi (“${label}”)`);
  }

  const haystack = `${meta.title}\n${meta.description}\n${meta.channelName || ""}\n${meta.uploader || ""}`.toLowerCase();
  const hits = getContentIdKeywords().filter((k) => k && haystack.includes(k));
  if (hits.length) reasons.push(`penanda: ${hits.slice(0, 3).map((h) => `“${h}”`).join(", ")}`);

  const name = `${meta.channelName || ""} ${meta.uploader || ""}`;
  if (/ - topic$/i.test((meta.channelName || meta.uploader || "").trim())) {
    reasons.push("channel “Topic” (rilis musik auto-generated)");
  } else if (/vevo$/i.test(name.trim())) {
    reasons.push("channel VEVO (label musik)");
  }

  return reasons;
}

// ─── WHITELIST ───────────────────────────────────────────────────────────
export async function listUserWhitelist(telegramUserId: string) {
  await ensureSourceGuardTables();
  return db
    .select()
    .from(sourceWhitelist)
    .where(eq(sourceWhitelist.telegramUserId, telegramUserId))
    .orderBy(sourceWhitelist.id);
}

export async function addWhitelistEntry(
  telegramUserId: string,
  raw: string
): Promise<{ added: boolean; entry: string }> {
  await ensureSourceGuardTables();
  const entry = normalizeChannelToken(raw);
  if (!entry) throw new Error("Channel kosong / tidak valid");
  const existing = await db
    .select()
    .from(sourceWhitelist)
    .where(and(eq(sourceWhitelist.telegramUserId, telegramUserId), eq(sourceWhitelist.entry, entry)));
  if (existing.length) return { added: false, entry };
  await db.insert(sourceWhitelist).values({ telegramUserId, entry, label: raw.trim().slice(0, 200) });
  return { added: true, entry };
}

/** `target` boleh nomor urut (dari /whitelist list) atau channel/URL/@handle. */
export async function removeWhitelistEntry(telegramUserId: string, target: string): Promise<string | null> {
  const rows = await listUserWhitelist(telegramUserId);
  let row = /^\d+$/.test(target.trim()) ? rows[parseInt(target.trim(), 10) - 1] : undefined;
  if (!row) {
    const token = normalizeChannelToken(target);
    row = rows.find((r) => r.entry === token);
  }
  if (!row) return null;
  await db.delete(sourceWhitelist).where(eq(sourceWhitelist.id, row.id));
  return row.label || row.entry;
}

const ownChannelCache = new Map<string, { at: number; tokens: string[] }>();
const OWN_CHANNEL_TTL_MS = 6 * 60 * 60 * 1000;

/** Channel YouTube milik user (dari akun yang di-/connect). Best-effort; gagal = daftar kosong. */
export async function getOwnChannelTokens(telegramUserId: string): Promise<string[]> {
  const cached = ownChannelCache.get(telegramUserId);
  if (cached && Date.now() - cached.at < OWN_CHANNEL_TTL_MS) return cached.tokens;

  let tokens: string[] = [];
  try {
    const rows = await db.select().from(youtubeTokens).where(eq(youtubeTokens.telegramUserId, telegramUserId));
    const tokenRow = rows[0];
    const scope = tokenRow?.scope || "";
    // channels.list(mine=true) butuh scope baca (readonly / force-ssl / youtube penuh).
    if (tokenRow && /youtube\.readonly|youtube\.force-ssl|auth\/youtube(\s|$)/.test(scope)) {
      const { google } = await import("googleapis");
      const auth = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
      );
      auth.setCredentials({ access_token: tokenRow.accessToken, refresh_token: tokenRow.refreshToken });
      const yt = google.youtube({ version: "v3", auth });
      const res = await yt.channels.list({ part: ["id", "snippet"], mine: true });
      for (const item of res.data.items || []) {
        for (const v of [item.id, item.snippet?.title, item.snippet?.customUrl]) {
          const t = v ? normalizeChannelToken(v) : "";
          if (t) tokens.push(t);
        }
      }
    }
  } catch (err) {
    console.warn("[source-guard] Gagal membaca channel milik sendiri:", err instanceof Error ? err.message : err);
    tokens = [];
  }
  ownChannelCache.set(telegramUserId, { at: Date.now(), tokens });
  return tokens;
}

// ─── BATAS KLIP PER VIDEO SUMBER PER HARI ────────────────────────────────
export async function countClipsFromSourceToday(sourceKey: string): Promise<number> {
  await ensureSourceGuardTables();
  const tz = getGuardTimezone();
  const result = await db.execute(sql`
    SELECT COALESCE(SUM(clips_count), 0)::int AS used
    FROM source_guard_log
    WHERE source_key = ${sourceKey}
      AND decision <> 'blocked'
      AND created_at >= (date_trunc('day', now() AT TIME ZONE ${tz}) AT TIME ZONE ${tz})
  `);
  const row = rowsOf<{ used: number }>(result)[0];
  return Number(row?.used ?? 0);
}

// ─── ENTRY POINT GUARD ───────────────────────────────────────────────────
export async function runSourceGuard(job: GuardJobInput): Promise<GuardOutcome> {
  const mode = getCopyrightGuardMode();
  const scope = getCopyrightGuardScope();
  const sourceKey = normalizeSourceUrl(job.sourceUrl);
  const limit = getMaxClipsPerSourcePerDay();
  const active = mode !== "off" && (scope === "all" || !!job.sourceMonitorId);

  const empty: GuardOutcome = {
    active,
    mode,
    blocked: false,
    violations: [],
    meta: null,
    sourceKey,
    quota: { limit, used: 0, remaining: null },
  };

  // Tidak ada yang perlu dicek maupun dikredit.
  if (!active && !isSourceCreditEnabled()) return empty;

  try {
    await ensureSourceGuardTables();
  } catch (err) {
    console.error("[source-guard] Gagal menyiapkan tabel (guard dilewati):", err);
    return { ...empty, active: false };
  }

  // 1) Metadata sumber
  let meta: SourceMeta | null = null;
  let preflightError: string | null = null;
  try {
    meta = await fetchSourceMetadata(job.sourceUrl);
  } catch (err) {
    preflightError = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    console.warn(`[source-guard] Metadata sumber gagal diambil (${job.sourceUrl}):`, preflightError);
  }

  const violations: GuardViolation[] = [];
  let used = 0;

  if (active) {
    // 2) Whitelist
    const userEntries = (await listUserWhitelist(job.telegramUserId).catch(() => [])).map((r) => r.entry);
    const envEntries = getEnvWhitelist().map(normalizeChannelToken).filter(Boolean);
    const allowed = new Set([...envEntries, ...userEntries]);
    const whitelistActive = allowed.size > 0 || isWhitelistRequired();
    const copyrightBlockedAtSource = !!preflightError && COPYRIGHT_ERROR_PATTERN.test(preflightError);

    if (whitelistActive && !copyrightBlockedAtSource) {
      if (!meta) {
        violations.push({
          code: "unverified",
          message: "Channel sumber tidak bisa diverifikasi (metadata video gagal diambil), jadi tidak bisa dicocokkan dengan whitelist.",
        });
      } else {
        const tokens = metaTokens(meta);
        let ok = Array.from(tokens).some((t) => allowed.has(t));
        if (!ok && isOwnChannelAllowed()) {
          const own = await getOwnChannelTokens(job.telegramUserId);
          ok = own.some((t) => tokens.has(t));
        }
        if (!ok) {
          violations.push({
            code: "not_whitelisted",
            message: `Channel “${describeChannel(meta)}” tidak ada di whitelist & bukan channel milikmu. Tambahkan dengan /whitelist add <channel> atau COPYRIGHT_WHITELIST_CHANNELS.`,
          });
        }
      }
    }

    // 3) Content ID
    if (isSkipContentIdEnabled()) {
      const reasons = detectContentIdSignals(meta, preflightError);
      if (reasons.length) {
        violations.push({
          code: "content_id",
          message: `Terindikasi Content ID — ${reasons.join("; ")}.`,
        });
      }
    }

    // 4) Batas klip per video sumber per hari
    if (limit > 0) {
      used = await countClipsFromSourceToday(sourceKey).catch(() => 0);
      if (used >= limit) {
        violations.push({
          code: "daily_limit",
          message: `Batas ${limit} klip/hari untuk video sumber ini sudah tercapai (${used} klip hari ini).`,
        });
      }
    }
  }

  const blocked = mode === "block" && active && violations.length > 0;
  const enforceQuota = mode === "block" && active && limit > 0;
  const outcome: GuardOutcome = {
    active,
    mode,
    blocked,
    violations,
    meta,
    sourceKey,
    quota: { limit, used, remaining: enforceQuota ? Math.max(0, limit - used) : null },
  };

  await recordGuardDecision(job, outcome).catch((err) =>
    console.error("[source-guard] Gagal mencatat log guard:", err)
  );
  return outcome;
}

/** Hilangkan karakter Markdown Telegram (_ * ` [ ]) supaya pesan progress tidak gagal tampil. */
export function safeForTelegram(text: string): string {
  return (text || "").replace(/[_*`[\]]/g, " ").replace(/\s{2,}/g, " ").trim();
}

/** Pesan satu-baris-per-pelanggaran untuk progress Telegram / pesan error. */
export function formatViolations(outcome: GuardOutcome): string[] {
  return outcome.violations.map((v) => safeForTelegram(v.message));
}

export function buildBlockedMessage(outcome: GuardOutcome): string {
  return `🛡️ Diblokir Source Guard — ${formatViolations(outcome).join(" ")}`;
}

/** Pangkas daftar klip sesuai sisa kuota harian (hanya mode block). Klip viral tertinggi dipertahankan. */
export function trimClipsToQuota<T extends { viralScore?: number }>(
  outcome: GuardOutcome,
  clips: T[]
): { clips: T[]; trimmed: number } {
  const remaining = outcome.quota.remaining;
  if (remaining === null || clips.length <= remaining) return { clips, trimmed: 0 };
  const kept = [...clips].sort((a, b) => (b.viralScore ?? 0) - (a.viralScore ?? 0)).slice(0, remaining);
  const keptSet = new Set(kept);
  // pertahankan urutan asli
  const ordered = clips.filter((c) => keptSet.has(c));
  return { clips: ordered, trimmed: clips.length - ordered.length };
}

// ─── LOG ─────────────────────────────────────────────────────────────────
async function recordGuardDecision(job: GuardJobInput, outcome: GuardOutcome): Promise<void> {
  await db.delete(sourceGuardLog).where(eq(sourceGuardLog.jobId, job.jobId)); // aman untuk retry job
  await db.insert(sourceGuardLog).values({
    jobId: job.jobId,
    telegramUserId: job.telegramUserId,
    sourceKey: outcome.sourceKey,
    sourceUrl: job.sourceUrl,
    sourceTitle: outcome.meta?.title || null,
    channelId: outcome.meta?.channelId || outcome.meta?.uploaderId || null,
    channelName: outcome.meta?.channelName || outcome.meta?.uploader || null,
    monitorId: job.sourceMonitorId ?? null,
    mode: outcome.mode,
    decision: outcome.blocked ? "blocked" : outcome.violations.length ? "warned" : "allowed",
    violations: outcome.violations,
    clipsCount: 0,
  });
}

/** Catat jumlah klip yang benar-benar jadi — dasar penghitung batas harian. */
export async function recordGuardClips(jobId: string, clipsCount: number): Promise<void> {
  try {
    await ensureSourceGuardTables();
    await db.update(sourceGuardLog).set({ clipsCount }).where(eq(sourceGuardLog.jobId, jobId));
  } catch (err) {
    console.error("[source-guard] Gagal mencatat jumlah klip:", err);
  }
}

// ─── SOURCE CREDIT ───────────────────────────────────────────────────────
function cleanForDescription(text: string, max: number): string {
  // YouTube menolak karakter < dan > di deskripsi.
  const t = (text || "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function canonicalSourceUrl(sourceKey: string, fallback: string): string {
  if (sourceKey.startsWith("youtube:")) return `https://www.youtube.com/watch?v=${sourceKey.slice(8)}`;
  return fallback;
}

export function buildSourceCredit(params: {
  title: string;
  channel?: string | null;
  url: string;
  template?: string;
}): string {
  const title = cleanForDescription(params.title || "Video sumber", 120);
  const channel = cleanForDescription(params.channel || "", 80);
  let template = params.template || getSourceCreditTemplate();
  if (!channel) template = template.replace(/\s*[—–-]+\s*\{channel\}/g, "").replace(/\{channel\}/g, "");
  return template
    .replace(/\{title\}/g, title)
    .replace(/\{channel\}/g, channel)
    .replace(/\{url\}/g, params.url)
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function insertCreditIntoDescription(
  description: string,
  credit: string,
  position: SourceCreditPosition = getSourceCreditPosition()
): string {
  const desc = (description || "").trim();
  if (!credit || desc.includes(credit)) return desc;

  let result: string;
  if (position === "top") {
    result = [credit, desc].filter(Boolean).join("\n\n");
  } else {
    // Sisipkan sebelum baris hashtag di akhir supaya hashtag tetap paling bawah.
    const tagLine = /^\s*(?:#[\p{L}\p{N}_]+\s*)+$/u;
    const lines = desc.split("\n");
    const tail: string[] = [];
    while (lines.length && (tagLine.test(lines[lines.length - 1]) || lines[lines.length - 1].trim() === "")) {
      tail.unshift(lines.pop() as string);
    }
    const body = lines.join("\n").trim();
    const tags = tail.join("\n").trim();
    result = [body, credit, tags].filter(Boolean).join("\n\n");
  }

  // Batas deskripsi YouTube 5000 karakter — kredit harus selalu selamat.
  if (result.length > 4900) {
    const overflow = result.length - 4900;
    const idx = result.indexOf(credit);
    const head = result.slice(0, idx);
    const trimmedHead = head.slice(0, Math.max(0, head.length - overflow - 1)).trimEnd();
    result = `${trimmedHead}${trimmedHead ? "\n\n" : ""}${result.slice(idx)}`.slice(0, 4999);
  }
  return result;
}

/**
 * Tambahkan kredit sumber ke deskripsi tiap klip (mutasi in-place, sehingga
 * deskripsi yang tersimpan di DB juga sudah berkredit). Tidak pernah melempar error.
 */
export async function applySourceCreditToClips(
  jobId: string,
  clips: Array<{ description: string }>
): Promise<{ applied: boolean; credit: string | null }> {
  if (!isSourceCreditEnabled() || !clips.length) return { applied: false, credit: null };
  try {
    await ensureSourceGuardTables();
    const [logRows, jobRows] = await Promise.all([
      db.select().from(sourceGuardLog).where(eq(sourceGuardLog.jobId, jobId)).orderBy(desc(sourceGuardLog.id)).limit(1),
      db.select().from(clipJobs).where(eq(clipJobs.jobId, jobId)).limit(1),
    ]);
    const log: SourceGuardLogRow | undefined = logRows[0];
    const job = jobRows[0];
    if (!job && !log) return { applied: false, credit: null };

    const sourceUrl = log?.sourceUrl || job?.sourceUrl || "";
    const sourceKey = log?.sourceKey || normalizeSourceUrl(sourceUrl);
    const credit = buildSourceCredit({
      title: log?.sourceTitle || job?.videoTitle || "Video sumber",
      channel: log?.channelName,
      url: canonicalSourceUrl(sourceKey, sourceUrl),
    });
    if (!credit) return { applied: false, credit: null };

    for (const clip of clips) {
      clip.description = insertCreditIntoDescription(clip.description || "", credit);
    }
    return { applied: true, credit };
  } catch (err) {
    console.error("[source-guard] Gagal menambah kredit sumber (diabaikan):", err);
    return { applied: false, credit: null };
  }
}

// ─── STATISTIK (dashboard & Telegram) ────────────────────────────────────
export async function getSourceGuardStats(): Promise<{
  last24h: { allowed: number; warned: number; blocked: number };
  total: number;
  recent: SourceGuardLogRow[];
}> {
  await ensureSourceGuardTables();
  const result = await db.execute(sql`
    SELECT decision, COUNT(*)::int AS n
    FROM source_guard_log
    WHERE created_at >= now() - interval '24 hours'
    GROUP BY decision
  `);
  const counts = { allowed: 0, warned: 0, blocked: 0 };
  for (const r of rowsOf<{ decision: string; n: number }>(result)) {
    if (r.decision in counts) counts[r.decision as keyof typeof counts] = Number(r.n);
  }
  const totalRes = await db.execute(sql`SELECT COUNT(*)::int AS n FROM source_guard_log`);
  const recent = await db.select().from(sourceGuardLog).orderBy(desc(sourceGuardLog.id)).limit(6);
  return { last24h: counts, total: Number(rowsOf<{ n: number }>(totalRes)[0]?.n ?? 0), recent };
}
