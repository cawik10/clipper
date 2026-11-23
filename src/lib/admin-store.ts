/**
 * 🗄️ ADMIN PANEL — DATA LAYER (FITUR BARU!)
 * =====================================================================
 * Tabel tambahan (dibuat OTOMATIS saat runtime, sama seperti fitur lain —
 * tidak perlu `drizzle-kit push`, dan TIDAK mengubah tabel yang sudah ada):
 *
 *   admin_users       → 1 baris per user yang pernah berinteraksi dengan bot:
 *                       username, status ban, override kuota, last_seen.
 *   admin_broadcasts  → riwayat broadcast.
 *
 * Sumber daftar user = gabungan user_settings + clip_jobs + admin_users,
 * jadi user lama (sebelum fitur ini ada) tetap muncul.
 */

import { sql } from "drizzle-orm";
import { db } from "@/db";
import {
  getAdminTimezone,
  getBroadcastConfig,
  getDefaultQuota,
  getQuotaPeriod,
  getQuotaPeriodLabel,
  isAdmin,
  isAdminExemptFromQuota,
} from "@/lib/admin-config";

type Row = Record<string, unknown>;

async function query<T extends Row = Row>(q: ReturnType<typeof sql>): Promise<T[]> {
  const res = await db.execute(q);
  return res.rows as T[];
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// ─── TABLE BOOTSTRAP ───────────────────────────────────────────────────
let tablesReady: Promise<void> | null = null;
export function ensureAdminTables(): Promise<void> {
  if (!tablesReady) {
    tablesReady = (async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS admin_users (
          telegram_user_id text PRIMARY KEY,
          chat_id text,
          username text,
          first_name text,
          last_name text,
          is_banned boolean NOT NULL DEFAULT false,
          ban_reason text,
          banned_at timestamp,
          banned_by text,
          quota_override integer,
          first_seen timestamp NOT NULL DEFAULT now(),
          last_seen timestamp NOT NULL DEFAULT now()
        )
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS admin_broadcasts (
          id serial PRIMARY KEY,
          admin_id text NOT NULL,
          message text NOT NULL,
          total integer NOT NULL DEFAULT 0,
          sent integer NOT NULL DEFAULT 0,
          failed integer NOT NULL DEFAULT 0,
          created_at timestamp NOT NULL DEFAULT now(),
          finished_at timestamp
        )
      `);
    })().catch((err) => {
      tablesReady = null;
      throw err;
    });
  }
  return tablesReady;
}

// ─── SQL FRAGMENTS ─────────────────────────────────────────────────────
/** Awal periode kuota (hari/bulan) dalam timezone admin → timestamptz. */
function periodStartSql() {
  const period = sql.raw(`'${getQuotaPeriod()}'`); // whitelist: day | month
  const tz = getAdminTimezone();
  return sql`(date_trunc(${period}, now() AT TIME ZONE ${tz}::text) AT TIME ZONE ${tz}::text)`;
}

const ALL_USER_IDS = sql`
  SELECT telegram_user_id AS id FROM user_settings
  UNION SELECT telegram_user_id FROM clip_jobs
  UNION SELECT telegram_user_id FROM admin_users
`;

// ─── TRACK USER ────────────────────────────────────────────────────────
export interface TgUserLike {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export async function trackUser(from: TgUserLike, chatId?: number | string): Promise<void> {
  await ensureAdminTables();
  await db.execute(sql`
    INSERT INTO admin_users (telegram_user_id, chat_id, username, first_name, last_name)
    VALUES (${String(from.id)}, ${chatId !== undefined ? String(chatId) : null},
            ${from.username ?? null}, ${from.first_name ?? null}, ${from.last_name ?? null})
    ON CONFLICT (telegram_user_id) DO UPDATE SET
      chat_id = COALESCE(EXCLUDED.chat_id, admin_users.chat_id),
      username = EXCLUDED.username,
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name,
      last_seen = now()
  `);
}

// ─── BAN & KUOTA ───────────────────────────────────────────────────────
export interface UserControl {
  banned: boolean;
  banReason: string | null;
  quotaOverride: number | null;
}

export async function getUserControl(userId: string): Promise<UserControl> {
  await ensureAdminTables();
  const rows = await query(sql`
    SELECT is_banned, ban_reason, quota_override FROM admin_users WHERE telegram_user_id = ${userId}
  `);
  const r = rows[0];
  return {
    banned: Boolean(r?.is_banned),
    banReason: (r?.ban_reason as string) ?? null,
    quotaOverride: r?.quota_override === null || r?.quota_override === undefined ? null : num(r.quota_override),
  };
}

export async function setBan(userId: string, banned: boolean, by: string, reason?: string): Promise<void> {
  await ensureAdminTables();
  await db.execute(sql`
    INSERT INTO admin_users (telegram_user_id, is_banned, ban_reason, banned_at, banned_by)
    VALUES (${userId}, ${banned}, ${banned ? reason ?? null : null}, ${banned ? sql`now()` : null}, ${banned ? by : null})
    ON CONFLICT (telegram_user_id) DO UPDATE SET
      is_banned = EXCLUDED.is_banned,
      ban_reason = EXCLUDED.ban_reason,
      banned_at = EXCLUDED.banned_at,
      banned_by = EXCLUDED.banned_by
  `);
}

/** value = null → kembali ke kuota default. 0 = tanpa batas. */
export async function setQuota(userId: string, value: number | null): Promise<void> {
  await ensureAdminTables();
  await db.execute(sql`
    INSERT INTO admin_users (telegram_user_id, quota_override)
    VALUES (${userId}, ${value})
    ON CONFLICT (telegram_user_id) DO UPDATE SET quota_override = EXCLUDED.quota_override
  `);
}

export function effectiveQuota(override: number | null): number {
  return override === null ? getDefaultQuota() : override;
}

export async function countUsage(userId: string): Promise<number> {
  const rows = await query(sql`
    SELECT count(*)::int AS c FROM clip_jobs
    WHERE telegram_user_id = ${userId}
      AND status <> 'error'
      AND created_at >= ${periodStartSql()}
  `);
  return num(rows[0]?.c);
}

export interface AccessCheck {
  allowed: boolean;
  reason?: "banned" | "quota";
  banReason?: string | null;
  used: number;
  limit: number; // 0 = tanpa batas
}

/** Cek ban + kuota. Fail-open: kalau DB bermasalah, user tetap boleh pakai bot. */
export async function checkUserAccess(userId: string, opts: { checkQuota?: boolean } = {}): Promise<AccessCheck> {
  const checkQuota = opts.checkQuota !== false;
  try {
    if (isAdmin(userId)) return { allowed: true, used: 0, limit: 0 };
    const ctl = await getUserControl(userId);
    if (ctl.banned) return { allowed: false, reason: "banned", banReason: ctl.banReason, used: 0, limit: 0 };

    const limit = effectiveQuota(ctl.quotaOverride);
    if (!checkQuota || limit <= 0) return { allowed: true, used: 0, limit };

    const used = await countUsage(userId);
    if (used >= limit) return { allowed: false, reason: "quota", used, limit };
    return { allowed: true, used, limit };
  } catch (err) {
    console.error("[admin] checkUserAccess gagal (fail-open):", err);
    return { allowed: true, used: 0, limit: 0 };
  }
}

export { isAdminExemptFromQuota, getQuotaPeriodLabel };

// ─── USER LIST / DETAIL ────────────────────────────────────────────────
export interface AdminUserRow {
  id: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  banned: boolean;
  banReason: string | null;
  quotaOverride: number | null;
  lastSeen: Date | null;
  firstSeen: Date | null;
  totalJobs: number;
  usedInPeriod: number;
  youtubeConnected: boolean;
}

function mapUser(r: Row): AdminUserRow {
  return {
    id: String(r.id),
    username: (r.username as string) ?? null,
    firstName: (r.first_name as string) ?? null,
    lastName: (r.last_name as string) ?? null,
    banned: Boolean(r.is_banned),
    banReason: (r.ban_reason as string) ?? null,
    quotaOverride: r.quota_override === null || r.quota_override === undefined ? null : num(r.quota_override),
    lastSeen: r.last_seen ? new Date(r.last_seen as string) : null,
    firstSeen: r.first_seen ? new Date(r.first_seen as string) : null,
    totalJobs: num(r.total_jobs),
    usedInPeriod: num(r.used),
    youtubeConnected: Boolean(r.yt),
  };
}

const USER_SELECT = sql`
  SELECT i.id, au.username, au.first_name, au.last_name, au.is_banned, au.ban_reason,
         au.quota_override, au.last_seen, au.first_seen,
         (SELECT count(*) FROM clip_jobs j WHERE j.telegram_user_id = i.id) AS total_jobs,
         (SELECT count(*) FROM clip_jobs j WHERE j.telegram_user_id = i.id AND j.status <> 'error'
            AND j.created_at >= ${periodStartSql()}) AS used,
         EXISTS (SELECT 1 FROM youtube_tokens y WHERE y.telegram_user_id = i.id) AS yt
  FROM (${ALL_USER_IDS}) i
  LEFT JOIN admin_users au ON au.telegram_user_id = i.id
`;

export async function listUsers(
  page: number,
  perPage: number
): Promise<{ users: AdminUserRow[]; total: number }> {
  await ensureAdminTables();
  const offset = Math.max(0, page) * perPage;
  const [rows, totalRows] = await Promise.all([
    query(sql`
      ${USER_SELECT}
      ORDER BY COALESCE(au.last_seen, '1970-01-01'::timestamp) DESC, i.id
      LIMIT ${perPage} OFFSET ${offset}
    `),
    query(sql`SELECT count(*)::int AS c FROM (${ALL_USER_IDS}) t`),
  ]);
  return { users: rows.map(mapUser), total: num(totalRows[0]?.c) };
}

export async function getUserDetail(userId: string): Promise<AdminUserRow | null> {
  await ensureAdminTables();
  const rows = await query(sql`${USER_SELECT} WHERE i.id = ${userId}`);
  return rows[0] ? mapUser(rows[0]) : null;
}

/** "123456" atau "@username" → telegram_user_id. */
export async function resolveUserId(arg: string): Promise<string | null> {
  const a = arg.trim();
  if (/^\d+$/.test(a)) return a;
  if (a.startsWith("@") && a.length > 1) {
    await ensureAdminTables();
    const rows = await query(sql`
      SELECT telegram_user_id FROM admin_users WHERE lower(username) = ${a.slice(1).toLowerCase()} LIMIT 1
    `);
    return rows[0] ? String(rows[0].telegram_user_id) : null;
  }
  return null;
}

export function displayName(u: Pick<AdminUserRow, "id" | "username" | "firstName" | "lastName">): string {
  if (u.username) return `@${u.username}`;
  const n = [u.firstName, u.lastName].filter(Boolean).join(" ");
  return n || u.id;
}

// ─── GLOBAL STATS ──────────────────────────────────────────────────────
export interface GlobalStats {
  totalUsers: number;
  newUsers24h: number;
  newUsers7d: number;
  active24h: number;
  bannedUsers: number;
  youtubeConnected: number;
  jobsTotal: number;
  jobs24h: number;
  jobsPeriod: number;
  jobsByStatus: Array<{ status: string; count: number }>;
  errors24h: number;
  totalClips: number;
  uploadsDone: number;
  topUsers: Array<{ id: string; label: string; jobs: number }>;
  errorSamples: Array<{ jobId: string; message: string; at: Date }>;
}

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch (err) {
    console.error("[admin] query statistik gagal:", err);
    return fallback;
  }
}

export async function getGlobalStats(): Promise<GlobalStats> {
  await ensureAdminTables();
  const one = async (q: ReturnType<typeof sql>) => num((await query(q))[0]?.c);

  const [
    totalUsers,
    newUsers24h,
    newUsers7d,
    active24h,
    bannedUsers,
    youtubeConnected,
    jobsTotal,
    jobs24h,
    jobsPeriod,
    errors24h,
    totalClips,
    uploadsDone,
    byStatus,
    top,
    errs,
  ] = await Promise.all([
    safe(one(sql`SELECT count(*)::int AS c FROM (${ALL_USER_IDS}) t`), 0),
    safe(one(sql`SELECT count(*)::int AS c FROM user_settings WHERE created_at > now() - interval '24 hours'`), 0),
    safe(one(sql`SELECT count(*)::int AS c FROM user_settings WHERE created_at > now() - interval '7 days'`), 0),
    safe(
      one(sql`
        SELECT count(*)::int AS c FROM (
          SELECT telegram_user_id FROM clip_jobs WHERE created_at > now() - interval '24 hours'
          UNION SELECT telegram_user_id FROM admin_users WHERE last_seen > now() - interval '24 hours'
        ) t`),
      0
    ),
    safe(one(sql`SELECT count(*)::int AS c FROM admin_users WHERE is_banned`), 0),
    safe(one(sql`SELECT count(*)::int AS c FROM youtube_tokens`), 0),
    safe(one(sql`SELECT count(*)::int AS c FROM clip_jobs`), 0),
    safe(one(sql`SELECT count(*)::int AS c FROM clip_jobs WHERE created_at > now() - interval '24 hours'`), 0),
    safe(one(sql`SELECT count(*)::int AS c FROM clip_jobs WHERE created_at >= ${periodStartSql()}`), 0),
    safe(one(sql`SELECT count(*)::int AS c FROM clip_jobs WHERE status = 'error' AND updated_at > now() - interval '24 hours'`), 0),
    safe(
      one(sql`SELECT COALESCE(sum(jsonb_array_length(clips)), 0)::int AS c FROM clip_jobs WHERE jsonb_typeof(clips) = 'array'`),
      0
    ),
    safe(one(sql`SELECT count(*)::int AS c FROM uploaded_videos WHERE upload_status = 'done'`), 0),
    safe(query(sql`SELECT status, count(*)::int AS c FROM clip_jobs GROUP BY status ORDER BY c DESC`), [] as Row[]),
    safe(
      query(sql`
        SELECT j.telegram_user_id AS id, au.username, au.first_name, count(*)::int AS c
        FROM clip_jobs j LEFT JOIN admin_users au ON au.telegram_user_id = j.telegram_user_id
        WHERE j.created_at >= ${periodStartSql()}
        GROUP BY j.telegram_user_id, au.username, au.first_name
        ORDER BY c DESC LIMIT 5`),
      [] as Row[]
    ),
    safe(
      query(sql`
        SELECT job_id, error_message, updated_at FROM clip_jobs
        WHERE status = 'error' ORDER BY updated_at DESC LIMIT 3`),
      [] as Row[]
    ),
  ]);

  return {
    totalUsers,
    newUsers24h,
    newUsers7d,
    active24h,
    bannedUsers,
    youtubeConnected,
    jobsTotal,
    jobs24h,
    jobsPeriod,
    jobsByStatus: byStatus.map((r) => ({ status: String(r.status), count: num(r.c) })),
    errors24h,
    totalClips,
    uploadsDone,
    topUsers: top.map((r) => ({
      id: String(r.id),
      label: displayName({
        id: String(r.id),
        username: (r.username as string) ?? null,
        firstName: (r.first_name as string) ?? null,
        lastName: null,
      }),
      jobs: num(r.c),
    })),
    errorSamples: errs.map((r) => ({
      jobId: String(r.job_id),
      message: String(r.error_message ?? ""),
      at: new Date(r.updated_at as string),
    })),
  };
}

// ─── BROADCAST ─────────────────────────────────────────────────────────
export interface Recipient {
  userId: string;
  chatId: string;
}

export async function getBroadcastRecipients(): Promise<Recipient[]> {
  await ensureAdminTables();
  const includeBanned = getBroadcastConfig().includeBanned;
  const rows = await query(sql`
    SELECT i.id AS user_id, COALESCE(au.chat_id, i.id) AS chat_id
    FROM (${ALL_USER_IDS}) i
    LEFT JOIN admin_users au ON au.telegram_user_id = i.id
    WHERE ${includeBanned ? sql`true` : sql`COALESCE(au.is_banned, false) = false`}
      AND i.id ~ '^[0-9]+$'
  `);
  return rows.map((r) => ({ userId: String(r.user_id), chatId: String(r.chat_id) }));
}

export async function createBroadcastLog(adminId: string, message: string, total: number): Promise<number> {
  await ensureAdminTables();
  const rows = await query(sql`
    INSERT INTO admin_broadcasts (admin_id, message, total) VALUES (${adminId}, ${message}, ${total})
    RETURNING id
  `);
  return num(rows[0]?.id);
}

export async function finishBroadcastLog(id: number, sent: number, failed: number): Promise<void> {
  await db.execute(sql`
    UPDATE admin_broadcasts SET sent = ${sent}, failed = ${failed}, finished_at = now() WHERE id = ${id}
  `);
}
