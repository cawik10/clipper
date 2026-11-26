/**
 * ⛔ SOURCE CHANNEL BLACKLIST (FITUR BARU! bagian dari Post-Upload Claim Monitor)
 * =====================================================================
 * Penyimpanan + pencocokan blacklist source channel. Dipakai oleh:
 *   - Claim Monitor (src/lib/claim-monitor.ts)  → auto-blacklist dari rasio klaim
 *   - Source Guard  (src/lib/source-guard.ts)   → tolak/peringatkan job dari channel blacklist
 *   - Auto-Monitor  (src/lib/channel-monitor-worker.ts) → lewati monitor channel blacklist
 *   - Perintah /blacklist (src/lib/claim-monitor-telegram.ts)
 *
 * Sumber blacklist:
 *   1. Tabel `source_blacklist` (per user Telegram) — auto atau manual (/blacklist add)
 *   2. Env CLAIM_BLACKLIST_CHANNELS (global, semua user)
 *
 * Pencocokan memakai "token" channel yang sama seperti whitelist Source Guard
 * (ID UCxxx / @handle / nama / URL → huruf kecil, tanpa @) — lihat
 * normalizeChannelToken di source-guard.ts. File ini sengaja TIDAK diimpor
 * statis oleh source-guard.ts (dipakai lewat dynamic import) agar tidak circular.
 */

import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { sourceBlacklist, type SourceBlacklistRow } from "@/db/schema";
import { getEnvBlacklist } from "@/lib/claim-monitor-config";
import { normalizeChannelToken } from "@/lib/source-guard";

// ─── TABEL (dibuat otomatis) ─────────────────────────────────────────────

let tableReady: Promise<void> | null = null;

export function ensureBlacklistTable(): Promise<void> {
  if (!tableReady) {
    tableReady = (async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS source_blacklist (
          id serial PRIMARY KEY,
          telegram_user_id text NOT NULL,
          channel_key text NOT NULL,
          channel_name text,
          tokens text NOT NULL DEFAULT '[]',
          origin text NOT NULL DEFAULT 'manual',
          reason text,
          claims integer NOT NULL DEFAULT 0,
          clips integer NOT NULL DEFAULT 0,
          ratio_percent integer NOT NULL DEFAULT 0,
          created_at timestamp NOT NULL DEFAULT now()
        )
      `);
      await db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS source_blacklist_user_key_idx ON source_blacklist (telegram_user_id, channel_key)
      `);
    })().catch((err) => {
      tableReady = null;
      throw err;
    });
  }
  return tableReady;
}

// ─── TOKEN ───────────────────────────────────────────────────────────────

/** Gabungkan beberapa identitas channel (id/nama/handle/URL) jadi daftar token unik. */
export function buildChannelTokens(values: Array<string | null | undefined>): string[] {
  const out = new Set<string>();
  for (const v of values) {
    if (!v) continue;
    const t = normalizeChannelToken(v);
    if (t) out.add(t);
  }
  return Array.from(out);
}

export function parseTokens(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string" && !!t) : [];
  } catch {
    return [];
  }
}

// ─── CRUD ────────────────────────────────────────────────────────────────

/** Blacklist AKTIF milik user (entri "released" = auto-blacklist yang sudah dilepas user, tidak ikut). */
export async function listBlacklist(userId: string): Promise<SourceBlacklistRow[]> {
  await ensureBlacklistTable();
  return db
    .select()
    .from(sourceBlacklist)
    .where(and(eq(sourceBlacklist.telegramUserId, userId), ne(sourceBlacklist.origin, "released")))
    .orderBy(sourceBlacklist.id);
}

/**
 * Entri auto-blacklist yang sudah DILEPAS user (tombol "Keluarkan" / /blacklist remove).
 * Disimpan sebagai penanda supaya channel tidak langsung di-blacklist lagi oleh rasio lama —
 * baru dipertimbangkan lagi kalau ada klaim BARU setelah dilepas.
 */
export async function findReleasedEntry(userId: string, tokens: string[]): Promise<SourceBlacklistRow | null> {
  await ensureBlacklistTable();
  const rows = await db
    .select()
    .from(sourceBlacklist)
    .where(and(eq(sourceBlacklist.telegramUserId, userId), eq(sourceBlacklist.origin, "released")));
  return rows.find((r) => parseTokens(r.tokens).some((t) => tokens.includes(t)) || tokens.includes(r.channelKey)) ?? null;
}

/** Cepat: apakah ada isi blacklist sama sekali (env atau milik user)? Dipakai Source Guard agar hemat. */
export async function hasAnyBlacklist(userId: string): Promise<boolean> {
  if (getEnvBlacklist().length > 0) return true;
  return (await listBlacklist(userId)).length > 0;
}

export async function getBlacklistEntry(userId: string, id: number): Promise<SourceBlacklistRow | null> {
  await ensureBlacklistTable();
  const rows = await db
    .select()
    .from(sourceBlacklist)
    .where(and(eq(sourceBlacklist.id, id), eq(sourceBlacklist.telegramUserId, userId)));
  return rows[0] ?? null;
}

export interface AddBlacklistInput {
  /** Identitas channel (id/nama/handle/URL) — semua dijadikan token pembanding. */
  identities: Array<string | null | undefined>;
  /** Nama tampilan. */
  label?: string | null;
  origin: "auto" | "manual";
  reason?: string | null;
  claims?: number;
  clips?: number;
  ratioPercent?: number;
}

/** Tambah ke blacklist user. Idempotent: kalau channel (token mana pun) sudah ada → added=false. */
export async function addBlacklistEntry(
  userId: string,
  input: AddBlacklistInput
): Promise<{ added: boolean; row: SourceBlacklistRow | null; tokens: string[] }> {
  await ensureBlacklistTable();
  const tokens = buildChannelTokens(input.identities);
  if (!tokens.length) return { added: false, row: null, tokens };

  const existing = await listBlacklist(userId);
  const dup = existing.find((r) => parseTokens(r.tokens).some((t) => tokens.includes(t)) || tokens.includes(r.channelKey));
  if (dup) return { added: false, row: dup, tokens };

  // Pernah dilepas user → pakai ulang barisnya (kunci unik user+channel)
  const released = await findReleasedEntry(userId, tokens);
  if (released) {
    const [row] = await db
      .update(sourceBlacklist)
      .set({
        origin: input.origin,
        channelName: input.label?.trim() || released.channelName,
        tokens: JSON.stringify(Array.from(new Set([...parseTokens(released.tokens), ...tokens]))),
        reason: input.reason?.slice(0, 300) ?? null,
        claims: input.claims ?? 0,
        clips: input.clips ?? 0,
        ratioPercent: input.ratioPercent ?? 0,
        createdAt: new Date(),
      })
      .where(eq(sourceBlacklist.id, released.id))
      .returning();
    return { added: !!row, row: row ?? null, tokens };
  }

  const [row] = await db
    .insert(sourceBlacklist)
    .values({
      telegramUserId: userId,
      channelKey: tokens[0],
      channelName: input.label?.trim() || null,
      tokens: JSON.stringify(tokens),
      origin: input.origin,
      reason: input.reason?.slice(0, 300) ?? null,
      claims: input.claims ?? 0,
      clips: input.clips ?? 0,
      ratioPercent: input.ratioPercent ?? 0,
    })
    .onConflictDoNothing()
    .returning();
  return { added: !!row, row: row ?? null, tokens };
}

/** Hapus dari blacklist user — target = nomor urut (dari /blacklist) atau channel (id/nama/handle/URL). */
export async function removeBlacklistEntry(userId: string, target: string): Promise<SourceBlacklistRow | null> {
  const rows = await listBlacklist(userId);
  const trimmed = target.trim();
  let hit: SourceBlacklistRow | undefined;
  if (/^\d+$/.test(trimmed)) {
    hit = rows[parseInt(trimmed, 10) - 1];
  } else {
    const token = normalizeChannelToken(trimmed);
    hit = rows.find((r) => r.channelKey === token || parseTokens(r.tokens).includes(token));
  }
  if (!hit) return null;
  await releaseOrDelete(hit);
  return hit;
}

/** Entri auto → ditandai "released" (agar tidak langsung di-blacklist ulang); entri manual → dihapus. */
async function releaseOrDelete(row: SourceBlacklistRow): Promise<void> {
  if (row.origin === "auto") {
    await db.update(sourceBlacklist).set({ origin: "released" }).where(eq(sourceBlacklist.id, row.id));
  } else {
    await db.delete(sourceBlacklist).where(eq(sourceBlacklist.id, row.id));
  }
}

export async function removeBlacklistById(userId: string, id: number): Promise<SourceBlacklistRow | null> {
  const row = await getBlacklistEntry(userId, id);
  if (!row || row.origin === "released") return null;
  await releaseOrDelete(row);
  return row;
}

// ─── PENCOCOKAN ──────────────────────────────────────────────────────────

export interface BlacklistMatch {
  scope: "env" | "user";
  label: string;
  origin?: string;
  claims?: number;
  clips?: number;
  ratioPercent?: number;
}

/** Cocokkan token channel dengan blacklist (env global + milik user). null = tidak di-blacklist. */
export async function findBlacklistMatch(userId: string, tokens: string[]): Promise<BlacklistMatch | null> {
  const wanted = new Set(tokens.filter(Boolean));
  if (!wanted.size) return null;

  for (const raw of getEnvBlacklist()) {
    const t = normalizeChannelToken(raw);
    if (t && wanted.has(t)) return { scope: "env", label: raw };
  }

  const rows = await listBlacklist(userId);
  for (const r of rows) {
    const own = new Set([r.channelKey, ...parseTokens(r.tokens)]);
    if (Array.from(own).some((t) => wanted.has(t))) {
      return {
        scope: "user",
        label: r.channelName || r.channelKey,
        origin: r.origin,
        claims: r.claims,
        clips: r.clips,
        ratioPercent: r.ratioPercent,
      };
    }
  }
  return null;
}
