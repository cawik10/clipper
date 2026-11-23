/**
 * 💰 COST TRACKER — LOGIKA INTI (FITUR BARU!)
 * =====================================================================
 * Semua logika pelacakan biaya AI ada di file ini; env var & tabel harga ada di
 * src/lib/cost-config.ts; tampilan Telegram di cost-report.ts / cost-telegram.ts.
 *
 * Cara kerja singkat:
 *   1. `processClipsOnly` (job-processor) membungkus job dengan
 *      `runWithCostContext({ jobId, userId })` → setiap panggilan AI di dalam job
 *      otomatis tahu job & user-nya (AsyncLocalStorage, tanpa ubah signature fungsi).
 *   2. Titik panggilan AI (ai-analyzer, video-processor/Whisper, ai-provider,
 *      scheduler) memanggil `recordAiUsage(...)` setelah respons → hitung biaya dari
 *      token/durasi audio × harga model → simpan ke tabel `ai_cost_log`.
 *   3. Sebelum job / panggilan AI di luar job, `checkAiBudget()` membandingkan biaya
 *      HARI INI dengan DAILY_BUDGET_USD (& USER_DAILY_BUDGET_USD). Lewat batas →
 *      AI dijeda (lihat COST_BUDGET_MODE). Job yang SUDAH berjalan dibiarkan selesai.
 *
 * `recordAiUsage` & `checkAiBudget` tidak pernah melempar error ke pemanggil
 * (fail-open): kalau DB bermasalah, bot tetap jalan seperti biasa.
 */

import fs from "fs";
import { AsyncLocalStorage } from "async_hooks";
import { execFile } from "child_process";
import { promisify } from "util";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { aiCostLog } from "@/db/schema";
import { notifyAdmins, escapeHtmlText } from "@/lib/admin-notify";
import {
  MIN_BILLED_AUDIO_SECONDS,
  getBudgetMode,
  getBudgetWarnPercent,
  getCostTimezone,
  getDailyBudgetUsd,
  getIdrRate,
  getUserDailyBudgetUsd,
  isCostTrackerEnabled,
  resolvePrice,
  shouldNotifyAdminOnBudget,
  type CostBudgetMode,
} from "@/lib/cost-config";

const execFileAsync = promisify(execFile);

// ─── FORMAT ──────────────────────────────────────────────────────────────

/** 0.00123 → "$0.0012" · 1.5 → "$1.50" */
export function formatUsd(usd: number): string {
  const v = Number.isFinite(usd) ? usd : 0;
  if (v === 0) return "$0";
  if (v < 0.01) return `$${v.toFixed(4)}`;
  if (v < 1) return `$${Math.abs(v * 100 - Math.round(v * 100)) < 1e-9 ? v.toFixed(2) : v.toFixed(3)}`;
  return `$${v.toFixed(2)}`;
}

/** "$0.123 (≈ Rp 1.968)" — Rupiah disembunyikan kalau COST_IDR_RATE=0. */
export function formatMoney(usd: number): string {
  const rate = getIdrRate();
  if (!rate) return formatUsd(usd);
  return `${formatUsd(usd)} (≈ Rp ${Math.round(usd * rate).toLocaleString("id-ID")})`;
}

// ─── KONTEKS JOB (AsyncLocalStorage) ─────────────────────────────────────

export interface CostContext {
  jobId?: string | null;
  userId?: string | null;
  /** Fitur default untuk panggilan di dalam konteks ini. */
  feature?: string;
  /** true = job ini sudah lolos pengecekan budget saat dimulai → tidak dijeda di tengah jalan. */
  budgetChecked?: boolean;
}

// Disimpan di globalThis supaya satu instance dipakai walau modul ini di-bundle ganda oleh Next.js.
const g = globalThis as typeof globalThis & { __autoclipCostAls?: AsyncLocalStorage<CostContext> };
const als: AsyncLocalStorage<CostContext> = (g.__autoclipCostAls ??= new AsyncLocalStorage<CostContext>());

export function runWithCostContext<T>(ctx: CostContext, fn: () => Promise<T>): Promise<T> {
  return als.run({ ...(als.getStore() || {}), ...ctx }, fn);
}

export function getCostContext(): CostContext {
  return als.getStore() || {};
}

// ─── TABEL ───────────────────────────────────────────────────────────────

let tableReady: Promise<void> | null = null;

export function ensureCostTable(): Promise<void> {
  if (!tableReady) {
    tableReady = (async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS ai_cost_log (
          id serial PRIMARY KEY,
          job_id text,
          telegram_user_id text,
          feature text NOT NULL DEFAULT 'other',
          provider text NOT NULL,
          model text NOT NULL,
          input_tokens integer NOT NULL DEFAULT 0,
          output_tokens integer NOT NULL DEFAULT 0,
          audio_seconds double precision NOT NULL DEFAULT 0,
          cost_usd double precision NOT NULL DEFAULT 0,
          estimated boolean NOT NULL DEFAULT false,
          created_at timestamp NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')
        )
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS ai_cost_log_created_idx ON ai_cost_log (created_at)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS ai_cost_log_user_idx ON ai_cost_log (telegram_user_id, created_at)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS ai_cost_log_job_idx ON ai_cost_log (job_id)`);
    })().catch((err) => {
      tableReady = null;
      throw err;
    });
  }
  return tableReady;
}

// ─── HITUNG & CATAT BIAYA ────────────────────────────────────────────────

export type AiProviderLabel = "openai" | "gemini" | "groq";

export interface UsageInput {
  provider: AiProviderLabel;
  model: string;
  /** analysis | transcribe | title_doctor | learning | schedule | other (default: dari konteks, lalu "other"). */
  feature?: string;
  userId?: string | null;
  jobId?: string | null;
  /** Token dari respons API (disarankan). */
  inputTokens?: number | null;
  outputTokens?: number | null;
  /** Cadangan kalau API tidak mengembalikan token: dihitung ≈ karakter/4 dan ditandai estimasi. */
  inputChars?: number;
  outputChars?: number;
  /** Isi untuk model transkripsi (Whisper) — biaya dihitung dari durasi audio. */
  audioSeconds?: number;
}

export function calcCost(u: Pick<UsageInput, "provider" | "model" | "audioSeconds"> & { inputTokens: number; outputTokens: number }): {
  cost: number;
  priceEstimated: boolean;
} {
  if (u.audioSeconds !== undefined) {
    const price = resolvePrice(u.model, "audio");
    const seconds = Math.max(u.audioSeconds, MIN_BILLED_AUDIO_SECONDS[u.provider] ?? 0);
    return { cost: (seconds / 3600) * (price.perHour ?? 0), priceEstimated: price.estimated };
  }
  const price = resolvePrice(u.model, "text");
  const cost = (u.inputTokens / 1_000_000) * (price.in ?? 0) + (u.outputTokens / 1_000_000) * (price.out ?? 0);
  return { cost, priceEstimated: price.estimated };
}

/** Catat satu panggilan AI. TIDAK PERNAH melempar error. Mengembalikan biaya (USD). */
export async function recordAiUsage(u: UsageInput): Promise<number> {
  if (!isCostTrackerEnabled()) return 0;
  try {
    const ctx = getCostContext();
    const isAudio = u.audioSeconds !== undefined;
    let inputTokens = Math.max(0, Math.round(u.inputTokens ?? 0));
    let outputTokens = Math.max(0, Math.round(u.outputTokens ?? 0));
    let estimated = false;
    if (!isAudio) {
      if (u.inputTokens == null && u.inputChars != null) {
        inputTokens = Math.ceil(u.inputChars / 4);
        estimated = true;
      }
      if (u.outputTokens == null && u.outputChars != null) {
        outputTokens = Math.ceil(u.outputChars / 4);
        estimated = true;
      }
    }

    const { cost, priceEstimated } = calcCost({
      provider: u.provider,
      model: u.model,
      audioSeconds: u.audioSeconds,
      inputTokens,
      outputTokens,
    });
    const userId = u.userId ?? ctx.userId ?? null;

    await ensureCostTable();
    await db.insert(aiCostLog).values({
      jobId: u.jobId ?? ctx.jobId ?? null,
      telegramUserId: userId,
      feature: u.feature ?? ctx.feature ?? "other",
      provider: u.provider,
      model: u.model || "unknown",
      inputTokens,
      outputTokens,
      audioSeconds: isAudio ? Math.max(0, u.audioSeconds ?? 0) : 0,
      costUsd: cost,
      estimated: estimated || priceEstimated,
      createdAt: new Date(),
    });

    bumpSpendCache(userId, cost);
    void maybeNotifyBudget(userId).catch(() => {});
    return cost;
  } catch (err) {
    console.warn("[cost] Gagal mencatat biaya AI:", err instanceof Error ? err.message : err);
    return 0;
  }
}

/** Durasi audio (detik): ffprobe, cadangan perkiraan dari ukuran file (audio diekstrak 32 kbps). */
export async function getAudioSeconds(audioPath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      ["-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0", audioPath],
      { timeout: 15000 }
    );
    const n = parseFloat(stdout.trim());
    if (Number.isFinite(n) && n > 0) return n;
  } catch {
    /* pakai perkiraan di bawah */
  }
  try {
    return fs.statSync(audioPath).size / 4000; // 32 kbps = 4000 byte/detik
  } catch {
    return 0;
  }
}

// ─── WAKTU (hari lokal) ──────────────────────────────────────────────────

/** Awal hari ini (00:00) di zona waktu COST_TIMEZONE, sebagai Date UTC. */
export function startOfLocalDay(now = new Date(), timeZone = getCostTimezone()): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parseInt(parts.find((p) => p.type === t)?.value ?? "0", 10);
  const y = get("year");
  const mo = get("month");
  const d = get("day");
  const localAsUtc = Date.UTC(y, mo - 1, d, get("hour") % 24, get("minute"), get("second"));
  const offsetMs = localAsUtc - Math.floor(now.getTime() / 1000) * 1000; // waktu lokal − UTC
  return new Date(Date.UTC(y, mo - 1, d) - offsetMs);
}

/** Awal periode "N hari terakhir" (bergulir dari sekarang). */
export function periodStart(days: number): Date {
  return new Date(Date.now() - days * 86_400_000);
}

// ─── BUDGET HARIAN ───────────────────────────────────────────────────────

export interface BudgetStatus {
  /** false = AI harus dijeda (hanya bisa false kalau COST_BUDGET_MODE=pause). */
  allowed: boolean;
  mode: CostBudgetMode;
  /** Batas mana yang terlewati. */
  scope: "global" | "user" | null;
  spentToday: number;
  dailyLimit: number;
  userSpentToday: number | null;
  userLimit: number;
  /** Kapan hitungan harian di-reset (00:00 berikutnya). */
  resetAt: Date;
  /** Persen pemakaian terhadap batas global (0 kalau tanpa batas). */
  percent: number;
}

const TTL_MS = 10_000;
const spendCache = new Map<string, { value: number; at: number; day: number }>();

function cacheKey(userId?: string | null): string {
  return userId ? `u:${userId}` : "g";
}

function bumpSpendCache(userId: string | null, cost: number): void {
  for (const key of ["g", userId ? cacheKey(userId) : ""]) {
    const hit = key ? spendCache.get(key) : undefined;
    if (hit) hit.value += cost;
  }
}

/** Total biaya hari ini (semua user, atau satu user). Cache 10 detik supaya hemat query. */
export async function getSpentToday(userId?: string | null): Promise<number> {
  const day = startOfLocalDay().getTime();
  const key = cacheKey(userId);
  const hit = spendCache.get(key);
  if (hit && hit.day === day && Date.now() - hit.at < TTL_MS) return hit.value;

  await ensureCostTable();
  const since = new Date(day);
  const rows = await db
    .select({ total: sql<number>`coalesce(sum(${aiCostLog.costUsd}), 0)` })
    .from(aiCostLog)
    .where(userId ? and(gte(aiCostLog.createdAt, since), eq(aiCostLog.telegramUserId, userId)) : gte(aiCostLog.createdAt, since));
  const value = Number(rows[0]?.total ?? 0);
  spendCache.set(key, { value, at: Date.now(), day });
  return value;
}

export async function getBudgetStatus(userId?: string | null): Promise<BudgetStatus> {
  const mode = getBudgetMode();
  const dailyLimit = getDailyBudgetUsd();
  const userLimit = getUserDailyBudgetUsd();
  const resetAt = new Date(startOfLocalDay().getTime() + 86_400_000);

  const spentToday = await getSpentToday(null);
  const userSpentToday = userId ? await getSpentToday(userId) : null;

  let scope: BudgetStatus["scope"] = null;
  if (dailyLimit > 0 && spentToday >= dailyLimit) scope = "global";
  else if (userLimit > 0 && userSpentToday !== null && userSpentToday >= userLimit) scope = "user";

  const enforce = isCostTrackerEnabled() && mode === "pause";
  return {
    allowed: !(enforce && scope),
    mode,
    scope,
    spentToday,
    dailyLimit,
    userSpentToday,
    userLimit,
    resetAt,
    percent: dailyLimit > 0 ? (spentToday / dailyLimit) * 100 : 0,
  };
}

function openStatus(): BudgetStatus {
  return {
    allowed: true,
    mode: getBudgetMode(),
    scope: null,
    spentToday: 0,
    dailyLimit: getDailyBudgetUsd(),
    userSpentToday: null,
    userLimit: getUserDailyBudgetUsd(),
    resetAt: new Date(startOfLocalDay().getTime() + 86_400_000),
    percent: 0,
  };
}

/**
 * Apakah AI boleh dipakai sekarang? Fail-open (DB error → boleh).
 * Job yang sudah lolos pengecekan saat dimulai (`budgetChecked`) selalu boleh —
 * jadi job tidak terpotong di tengah jalan hanya karena batas terlewati sesaat.
 */
export async function checkAiBudget(opts: { userId?: string | null } = {}): Promise<BudgetStatus> {
  if (!isCostTrackerEnabled() || getBudgetMode() !== "pause") return openStatus();
  const ctx = getCostContext();
  if (ctx.budgetChecked) return openStatus();
  try {
    return await getBudgetStatus(opts.userId ?? ctx.userId ?? null);
  } catch (err) {
    console.warn("[cost] Cek budget gagal (dianggap boleh):", err instanceof Error ? err.message : err);
    return openStatus();
  }
}

export class AiBudgetExceededError extends Error {
  readonly status: BudgetStatus;
  constructor(status: BudgetStatus) {
    super(budgetBlockedMessage(status));
    this.name = "AiBudgetExceededError";
    this.status = status;
  }
}

export function isAiBudgetExceededError(err: unknown): err is AiBudgetExceededError {
  return err instanceof AiBudgetExceededError || (err as { name?: string })?.name === "AiBudgetExceededError";
}

/** Pesan teks polos (tanpa HTML) — aman disimpan di DB / dikirim sebagai status job. */
export function budgetBlockedMessage(s: BudgetStatus): string {
  const reset = s.resetAt.toLocaleString("id-ID", { timeZone: getCostTimezone(), hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });
  if (s.scope === "user") {
    return `Batas pemakaian AI harianmu sudah tercapai (${formatUsd(s.userSpentToday ?? 0)} dari ${formatUsd(s.userLimit)}). AI dijeda sampai reset ${reset}.`;
  }
  return `Batas biaya AI harian bot sudah tercapai (${formatUsd(s.spentToday)} dari ${formatUsd(s.dailyLimit)}). AI dijeda sampai reset ${reset}, atau admin menaikkan DAILY_BUDGET_USD.`;
}

// ─── NOTIFIKASI ADMIN ────────────────────────────────────────────────────

const notified = new Set<string>();

async function maybeNotifyBudget(userId: string | null): Promise<void> {
  if (!shouldNotifyAdminOnBudget() || getBudgetMode() === "off") return;
  const day = startOfLocalDay().getTime();
  for (const k of notified) if (!k.startsWith(`${day}:`)) notified.delete(k);

  const limit = getDailyBudgetUsd();
  if (limit > 0) {
    const spent = await getSpentToday(null);
    const warnPct = getBudgetWarnPercent();
    const level = spent >= limit ? "limit" : warnPct > 0 && spent >= (limit * warnPct) / 100 ? "warn" : null;
    if (level && !notified.has(`${day}:${level}`)) {
      notified.add(`${day}:${level}`);
      if (level === "limit") notified.add(`${day}:warn`);
      const mode = getBudgetMode();
      await notifyAdmins(
        level === "limit"
          ? `⏸️ <b>Batas biaya AI harian tercapai</b>\nTerpakai ${escapeHtmlText(formatMoney(spent))} dari batas ${escapeHtmlText(formatUsd(limit))}.\n` +
              (mode === "pause"
                ? "AI <b>dijeda</b>: job baru ditolak & fitur AI lain memakai fallback sampai reset tengah malam.\n"
                : "Mode <code>warn</code>: AI tetap berjalan.\n") +
              "Naikkan <code>DAILY_BUDGET_USD</code> di Railway Variables untuk melanjutkan. Detail: /cost"
          : `⚠️ <b>Biaya AI hari ini ${Math.round((spent / limit) * 100)}% dari batas</b>\nTerpakai ${escapeHtmlText(formatMoney(spent))} dari ${escapeHtmlText(formatUsd(limit))}. Detail: /cost`
      );
    }
  }

  const userLimit = getUserDailyBudgetUsd();
  if (userLimit > 0 && userId) {
    const key = `${day}:user:${userId}`;
    if (!notified.has(key) && (await getSpentToday(userId)) >= userLimit) {
      notified.add(key);
      await notifyAdmins(
        `⏸️ <b>User ${escapeHtmlText(userId)}</b> mencapai batas AI harian (${escapeHtmlText(formatUsd(userLimit))}).` +
          (getBudgetMode() === "pause" ? " AI-nya dijeda sampai reset." : "")
      );
    }
  }
}

// ─── QUERY LAPORAN ───────────────────────────────────────────────────────

export interface Totals {
  cost: number;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  audioSeconds: number;
  jobs: number;
  /** Biaya yang terjadi di dalam job (tanpa fitur sistem seperti Title Doctor). */
  jobCost: number;
}

export interface ModelRow {
  provider: string;
  model: string;
  calls: number;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  audioSeconds: number;
  jobs: number;
  estimated: boolean;
}

export interface FeatureRow {
  feature: string;
  calls: number;
  cost: number;
}

export interface UserRow {
  userId: string;
  calls: number;
  cost: number;
  jobs: number;
}

export interface JobCostRow {
  jobId: string;
  userId: string | null;
  cost: number;
  calls: number;
  at: Date;
  title: string | null;
  status: string | null;
  clips: number | null;
}

export interface DayRow {
  day: string;
  cost: number;
}

function whereSince(since: Date, userId?: string | null) {
  return userId ? and(gte(aiCostLog.createdAt, since), eq(aiCostLog.telegramUserId, userId)) : gte(aiCostLog.createdAt, since);
}

const sumCost = sql<number>`coalesce(sum(${aiCostLog.costUsd}), 0)`;
const countAll = sql<number>`count(*)`;
const countJobs = sql<number>`count(distinct ${aiCostLog.jobId})`;

export async function getTotals(since: Date, userId?: string | null): Promise<Totals> {
  await ensureCostTable();
  const [r] = await db
    .select({
      cost: sumCost,
      calls: countAll,
      inputTokens: sql<number>`coalesce(sum(${aiCostLog.inputTokens}), 0)`,
      outputTokens: sql<number>`coalesce(sum(${aiCostLog.outputTokens}), 0)`,
      audioSeconds: sql<number>`coalesce(sum(${aiCostLog.audioSeconds}), 0)`,
      jobs: countJobs,
      jobCost: sql<number>`coalesce(sum(${aiCostLog.costUsd}) filter (where ${aiCostLog.jobId} is not null), 0)`,
    })
    .from(aiCostLog)
    .where(whereSince(since, userId));
  return {
    cost: Number(r?.cost ?? 0),
    calls: Number(r?.calls ?? 0),
    inputTokens: Number(r?.inputTokens ?? 0),
    outputTokens: Number(r?.outputTokens ?? 0),
    audioSeconds: Number(r?.audioSeconds ?? 0),
    jobs: Number(r?.jobs ?? 0),
    jobCost: Number(r?.jobCost ?? 0),
  };
}

export async function getByModel(since: Date, userId?: string | null): Promise<ModelRow[]> {
  await ensureCostTable();
  const rows = await db
    .select({
      provider: aiCostLog.provider,
      model: aiCostLog.model,
      calls: countAll,
      cost: sumCost,
      inputTokens: sql<number>`coalesce(sum(${aiCostLog.inputTokens}), 0)`,
      outputTokens: sql<number>`coalesce(sum(${aiCostLog.outputTokens}), 0)`,
      audioSeconds: sql<number>`coalesce(sum(${aiCostLog.audioSeconds}), 0)`,
      jobs: countJobs,
      estimated: sql<boolean>`bool_or(${aiCostLog.estimated})`,
    })
    .from(aiCostLog)
    .where(whereSince(since, userId))
    .groupBy(aiCostLog.provider, aiCostLog.model)
    .orderBy(sql`sum(${aiCostLog.costUsd}) desc`);
  return rows.map((r) => ({
    provider: r.provider,
    model: r.model,
    calls: Number(r.calls),
    cost: Number(r.cost),
    inputTokens: Number(r.inputTokens),
    outputTokens: Number(r.outputTokens),
    audioSeconds: Number(r.audioSeconds),
    jobs: Number(r.jobs),
    estimated: !!r.estimated,
  }));
}

export async function getByFeature(since: Date, userId?: string | null): Promise<FeatureRow[]> {
  await ensureCostTable();
  const rows = await db
    .select({ feature: aiCostLog.feature, calls: countAll, cost: sumCost })
    .from(aiCostLog)
    .where(whereSince(since, userId))
    .groupBy(aiCostLog.feature)
    .orderBy(sql`sum(${aiCostLog.costUsd}) desc`);
  return rows.map((r) => ({ feature: r.feature, calls: Number(r.calls), cost: Number(r.cost) }));
}

/** Pengguna dengan biaya terbesar. Baris tanpa user (fitur sistem) digabung sebagai "system". */
export async function getByUser(since: Date, limit = 10): Promise<UserRow[]> {
  await ensureCostTable();
  const rows = await db
    .select({
      userId: sql<string>`coalesce(${aiCostLog.telegramUserId}, 'system')`,
      calls: countAll,
      cost: sumCost,
      jobs: countJobs,
    })
    .from(aiCostLog)
    .where(gte(aiCostLog.createdAt, since))
    .groupBy(sql`coalesce(${aiCostLog.telegramUserId}, 'system')`)
    .orderBy(sql`sum(${aiCostLog.costUsd}) desc`)
    .limit(limit);
  return rows.map((r) => ({ userId: r.userId, calls: Number(r.calls), cost: Number(r.cost), jobs: Number(r.jobs) }));
}

/** Biaya per job (terbaru dulu), dilengkapi judul & jumlah klip dari tabel clip_jobs. */
export async function getRecentJobCosts(userId: string | null, limit = 5, since?: Date): Promise<JobCostRow[]> {
  await ensureCostTable();
  const sinceIso = (since ?? new Date(0)).toISOString();
  const userFilter = userId ? sql`AND l.telegram_user_id = ${userId}` : sql``;
  const res = await db.execute(sql`
    SELECT l.job_id AS job_id,
           max(l.telegram_user_id) AS user_id,
           sum(l.cost_usd) AS cost,
           count(*) AS calls,
           to_char(min(l.created_at), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS at,
           max(j.video_title) AS title,
           max(j.status) AS status,
           max(CASE WHEN jsonb_typeof(j.clips) = 'array' THEN jsonb_array_length(j.clips) END) AS clips
    FROM ai_cost_log l
    LEFT JOIN clip_jobs j ON j.job_id = l.job_id
    WHERE l.job_id IS NOT NULL AND l.created_at >= ${sinceIso}::timestamp ${userFilter}
    GROUP BY l.job_id
    ORDER BY min(l.created_at) DESC
    LIMIT ${limit}
  `);
  const rows = res.rows as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    jobId: String(r.job_id),
    userId: r.user_id ? String(r.user_id) : null,
    cost: Number(r.cost ?? 0),
    calls: Number(r.calls ?? 0),
    at: new Date(String(r.at)),
    title: r.title ? String(r.title) : null,
    status: r.status ? String(r.status) : null,
    clips: r.clips === null || r.clips === undefined ? null : Number(r.clips),
  }));
}

/** Biaya per hari (zona waktu COST_TIMEZONE) untuk grafik batang. Hari tanpa biaya diisi 0. */
export async function getDailySeries(days: number, userId?: string | null): Promise<DayRow[]> {
  await ensureCostTable();
  const tz = getCostTimezone();
  const todayStart = startOfLocalDay();
  const since = new Date(todayStart.getTime() - (days - 1) * 86_400_000);
  const userFilter = userId ? sql`AND telegram_user_id = ${userId}` : sql``;
  const res = await db.execute(sql`
    SELECT to_char((created_at AT TIME ZONE 'UTC') AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS day,
           sum(cost_usd) AS cost
    FROM ai_cost_log
    WHERE created_at >= ${since.toISOString()}::timestamp ${userFilter}
    GROUP BY 1
  `);
  const map = new Map<string, number>();
  for (const r of res.rows as Array<Record<string, unknown>>) map.set(String(r.day), Number(r.cost ?? 0));

  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  const out: DayRow[] = [];
  for (let i = 0; i < days; i++) {
    const key = fmt.format(new Date(since.getTime() + i * 86_400_000 + 12 * 3_600_000));
    out.push({ day: key, cost: map.get(key) ?? 0 });
  }
  return out;
}
