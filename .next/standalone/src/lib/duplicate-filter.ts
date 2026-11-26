/**
 * 🧹 DUPLICATE / REPETITIVE CLIP FILTER
 * =====================================================================
 * Menghindari AutoClip membuat klip dengan konten yang mirip/berulang
 * ketika source video yang sama (atau mirip) diproses berkali-kali.
 *
 * Cara kerja singkat:
 *  1. Setiap kali AI Analysis selesai memilih momen-momen viral, daftar
 *     kandidat klip dicek terhadap "sidik jari" (fingerprint) klip-klip
 *     yang sudah pernah dibuat sebelumnya (lihat tabel `clip_fingerprints`
 *     di src/db/schema.ts).
 *  2. Sebuah klip dianggap DUPLIKAT jika:
 *       a) Kemiripan teks (judul + deskripsi + alasan AI) terhadap klip
 *          lama ≥ DUPLICATE_FILTER_TEXT_THRESHOLD, ATAU
 *       b) Berasal dari source video yang sama DAN rentang waktunya
 *          overlap ≥ DUPLICATE_FILTER_TIME_OVERLAP_THRESHOLD dengan klip
 *          lama dari source yang sama.
 *     Klip juga dibandingkan terhadap klip LAIN dalam batch yang sama,
 *     supaya AI yang kebetulan memilih dua momen yang nyaris identik
 *     dalam satu run juga tetap tersaring.
 *  3. Klip yang lolos tetap diproses seperti biasa (FFmpeg, watermark,
 *     upload, dst — tidak ada perubahan pada langkah-langkah itu).
 *  4. Setelah klip BERHASIL dipotong, sidik jarinya disimpan untuk jadi
 *     pembanding di masa depan.
 *
 * Semua ambang batas & cakupan pembanding mudah diubah lewat Railway
 * Variables — lihat src/lib/duplicate-filter-config.ts.
 *
 * Fitur ini sepenuhnya ADDITIVE: tidak mengubah tabel/kolom yang sudah
 * ada, tidak mengubah format clipJobs.clips, dan bisa dimatikan total
 * dengan DUPLICATE_FILTER_ENABLED=false tanpa efek samping.
 */

import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { clipFingerprints, duplicateClipSkips } from "@/db/schema";
import {
  getDuplicateFilterConfig,
  type DuplicateFilterConfig,
  type DuplicateFilterScope,
} from "@/lib/duplicate-filter-config";

export interface ClipCandidate {
  index?: number;
  startTime: number;
  endTime: number;
  duration?: number;
  title: string;
  description?: string;
  reason?: string;
  viralScore?: number;
}

export interface DuplicateSkipInfo<T extends ClipCandidate = ClipCandidate> {
  clip: T;
  reason: string;
  textScore: number;
  timeScore: number;
  combinedScore: number;
  matchedTitle?: string;
  matchedJobId?: string;
}

export interface DuplicateFilterResult<T extends ClipCandidate = ClipCandidate> {
  accepted: T[];
  skipped: DuplicateSkipInfo<T>[];
  config: DuplicateFilterConfig;
}

interface FingerprintLike {
  jobId: string;
  title: string;
  description?: string | null;
  reason?: string | null;
  startTime: number;
  endTime: number;
  sameSource: boolean;
}

// ─── DB BOOTSTRAP ────────────────────────────────────────────────────────
// Tabel dibuat otomatis saat runtime (pola sama seperti ensureDriveTable di
// src/lib/drive-uploader.ts) supaya deploy di Railway tidak wajib menjalankan
// `drizzle-kit push` lebih dulu.

let tablesReady: Promise<void> | null = null;

export function ensureDuplicateFilterTables(): Promise<void> {
  if (!tablesReady) {
    tablesReady = (async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS clip_fingerprints (
          id serial PRIMARY KEY,
          source_key text NOT NULL,
          source_url text NOT NULL,
          telegram_user_id text NOT NULL,
          job_id text NOT NULL,
          clip_index integer,
          title text NOT NULL,
          description text,
          reason text,
          start_time integer NOT NULL,
          end_time integer NOT NULL,
          created_at timestamp NOT NULL DEFAULT now()
        )
      `);
      await db.execute(
        sql`CREATE INDEX IF NOT EXISTS clip_fingerprints_source_key_idx ON clip_fingerprints (source_key)`
      );
      await db.execute(
        sql`CREATE INDEX IF NOT EXISTS clip_fingerprints_user_idx ON clip_fingerprints (telegram_user_id)`
      );
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS duplicate_clip_skips (
          id serial PRIMARY KEY,
          job_id text NOT NULL,
          telegram_user_id text NOT NULL,
          source_key text NOT NULL,
          source_url text NOT NULL,
          candidate_title text NOT NULL,
          candidate_start integer NOT NULL,
          candidate_end integer NOT NULL,
          matched_job_id text,
          matched_title text,
          text_score integer,
          time_score integer,
          combined_score integer,
          reason text NOT NULL,
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

// ─── URL NORMALIZATION ───────────────────────────────────────────────────

/**
 * Menormalisasi URL source video supaya link yang sama (dengan query
 * string/parameter tracking berbeda, mis. `?si=...`) tetap dikenali
 * sebagai source yang identik ketika diproses ulang.
 */
export function normalizeSourceUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl.trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, "");

    // YouTube: ambil video id saja (v=, youtu.be/<id>, /shorts/<id>)
    if (host.includes("youtube.com") || host === "youtu.be") {
      let videoId = url.searchParams.get("v");
      if (!videoId) {
        const parts = url.pathname.split("/").filter(Boolean);
        if (host === "youtu.be") videoId = parts[0] || null;
        else if (parts[0] === "shorts" || parts[0] === "live") videoId = parts[1] || null;
      }
      if (videoId) return `youtube:${videoId}`;
    }

    // TikTok: /@user/video/<id>
    if (host.includes("tiktok.com")) {
      const match = url.pathname.match(/\/video\/(\d+)/);
      if (match) return `tiktok:${match[1]}`;
    }

    // Instagram: /reel/<id> or /p/<id>
    if (host.includes("instagram.com")) {
      const match = url.pathname.match(/\/(reel|p|tv)\/([^/]+)/);
      if (match) return `instagram:${match[2]}`;
    }

    // Facebook: coba ambil video id dari path atau query `v`
    if (host.includes("facebook.com") || host === "fb.watch") {
      const vParam = url.searchParams.get("v");
      const pathMatch = url.pathname.match(/\/videos\/(\d+)/);
      const id = vParam || pathMatch?.[1];
      if (id) return `facebook:${id}`;
    }

    // Fallback generik: host + path tanpa query/hash, tanpa trailing slash
    const cleanPath = url.pathname.replace(/\/+$/, "");
    return `${host}${cleanPath}`.toLowerCase();
  } catch {
    // Bukan URL valid — fallback ke string yang sudah dirapikan
    return rawUrl.trim().toLowerCase().replace(/[?#].*$/, "");
  }
}

// ─── TEXT SIMILARITY (dependency-free Jaccard shingling) ────────────────

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildShingles(text: string, size = 3): Set<string> {
  const words = normalizeText(text).split(" ").filter(Boolean);
  if (words.length === 0) return new Set();
  if (words.length < size) return new Set([words.join(" ")]);
  const shingles = new Set<string>();
  for (let i = 0; i <= words.length - size; i++) {
    shingles.add(words.slice(i, i + size).join(" "));
  }
  return shingles;
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function clipText(clip: ClipCandidate): string {
  return [clip.title, clip.description, clip.reason].filter(Boolean).join(" ");
}

function timeOverlapRatio(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  const start = Math.max(aStart, bStart);
  const end = Math.min(aEnd, bEnd);
  const overlap = Math.max(0, end - start);
  const union = Math.max(aEnd, bEnd) - Math.min(aStart, bStart);
  return union <= 0 ? 0 : overlap / union;
}

function scoreAgainst(
  candidate: ClipCandidate,
  other: FingerprintLike,
  cfg: DuplicateFilterConfig
): { textScore: number; timeScore: number; isDuplicate: boolean } {
  const textScore = jaccardSimilarity(buildShingles(clipText(candidate)), buildShingles(
    [other.title, other.description, other.reason].filter(Boolean).join(" ")
  ));
  const timeScore = other.sameSource
    ? timeOverlapRatio(candidate.startTime, candidate.endTime, other.startTime, other.endTime)
    : 0;

  const isDuplicate =
    textScore >= cfg.textThreshold || (other.sameSource && timeScore >= cfg.timeOverlapThreshold);

  return { textScore, timeScore, isDuplicate };
}

// ─── MAIN FILTER ─────────────────────────────────────────────────────────

/**
 * Menyaring kandidat klip hasil AI Analysis, membuang klip yang kontennya
 * terlalu mirip dengan klip yang sudah pernah dibuat sebelumnya (atau
 * dengan klip lain di batch yang sama).
 */
export async function filterDuplicateClips<T extends ClipCandidate>(params: {
  sourceUrl: string;
  telegramUserId: string;
  jobId: string;
  candidates: T[];
}): Promise<DuplicateFilterResult<T>> {
  const cfg = getDuplicateFilterConfig();
  if (!cfg.enabled || params.candidates.length === 0) {
    return { accepted: params.candidates, skipped: [], config: cfg };
  }

  await ensureDuplicateFilterTables();

  const sourceKey = normalizeSourceUrl(params.sourceUrl);
  const existing = await loadExistingFingerprints(sourceKey, params.telegramUserId, cfg);

  const accepted: T[] = [];
  const skipped: DuplicateSkipInfo<T>[] = [];
  // Sidik jari "virtual" dari klip-klip yang sudah diterima di batch ini,
  // supaya klip yang nyaris identik dalam satu run juga tersaring.
  const acceptedInBatch: FingerprintLike[] = [];

  for (const candidate of params.candidates) {
    let best: { textScore: number; timeScore: number; combined: number; match: FingerprintLike } | null =
      null;

    for (const other of [...existing, ...acceptedInBatch]) {
      const { textScore, timeScore, isDuplicate } = scoreAgainst(candidate, other, cfg);
      if (!isDuplicate) continue;
      const combined = Math.max(textScore, timeScore);
      if (!best || combined > best.combined) {
        best = { textScore, timeScore, combined, match: other };
      }
    }

    if (best) {
      skipped.push({
        clip: candidate,
        reason:
          best.timeScore >= cfg.timeOverlapThreshold && best.match.sameSource
            ? "Rentang waktu tumpang tindih dengan klip yang sudah pernah dibuat dari video ini"
            : "Konten (judul/deskripsi/momen) terlalu mirip dengan klip yang sudah pernah dibuat",
        textScore: best.textScore,
        timeScore: best.timeScore,
        combinedScore: best.combined,
        matchedTitle: best.match.title,
        matchedJobId: best.match.jobId,
      });
      continue;
    }

    accepted.push(candidate);
    acceptedInBatch.push({
      jobId: params.jobId,
      title: candidate.title,
      description: candidate.description,
      reason: candidate.reason,
      startTime: candidate.startTime,
      endTime: candidate.endTime,
      sameSource: true,
    });
  }

  if (skipped.length > 0) {
    await recordDuplicateSkips({
      jobId: params.jobId,
      telegramUserId: params.telegramUserId,
      sourceKey,
      sourceUrl: params.sourceUrl,
      skipped,
    });
  }

  return { accepted, skipped, config: cfg };
}

async function loadExistingFingerprints(
  sourceKey: string,
  telegramUserId: string,
  cfg: DuplicateFilterConfig
): Promise<FingerprintLike[]> {
  const conditions = [];
  if (cfg.scope === "source") {
    conditions.push(eq(clipFingerprints.sourceKey, sourceKey));
  } else if (cfg.scope === "user") {
    conditions.push(eq(clipFingerprints.telegramUserId, telegramUserId));
  }
  // scope === "global" → tanpa filter tambahan (seluruh tabel, dibatasi maxLookup)

  if (cfg.lookbackDays > 0) {
    const since = new Date(Date.now() - cfg.lookbackDays * 24 * 60 * 60 * 1000);
    conditions.push(gte(clipFingerprints.createdAt, since));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select()
    .from(clipFingerprints)
    .where(whereClause)
    .orderBy(desc(clipFingerprints.createdAt))
    .limit(cfg.maxLookup);

  return rows.map((row) => ({
    jobId: row.jobId,
    title: row.title,
    description: row.description,
    reason: row.reason,
    startTime: row.startTime,
    endTime: row.endTime,
    sameSource: row.sourceKey === sourceKey,
  }));
}

async function recordDuplicateSkips(params: {
  jobId: string;
  telegramUserId: string;
  sourceKey: string;
  sourceUrl: string;
  skipped: DuplicateSkipInfo[];
}): Promise<void> {
  try {
    await ensureDuplicateFilterTables();
    await db.insert(duplicateClipSkips).values(
      params.skipped.map((s) => ({
        jobId: params.jobId,
        telegramUserId: params.telegramUserId,
        sourceKey: params.sourceKey,
        sourceUrl: params.sourceUrl,
        candidateTitle: s.clip.title,
        candidateStart: Math.round(s.clip.startTime),
        candidateEnd: Math.round(s.clip.endTime),
        matchedJobId: s.matchedJobId,
        matchedTitle: s.matchedTitle,
        textScore: Math.round(s.textScore * 100),
        timeScore: Math.round(s.timeScore * 100),
        combinedScore: Math.round(s.combinedScore * 100),
        reason: s.reason,
      }))
    );
  } catch (err) {
    // Jangan sampai gagal mencatat log menggagalkan proses utama job.
    console.error("[duplicate-filter] gagal mencatat duplicate_clip_skips:", err);
  }
}

/** Dipanggil setelah klip BERHASIL dipotong, supaya bisa dipakai sebagai pembanding di masa depan. */
export async function recordClipFingerprints<T extends ClipCandidate>(params: {
  sourceUrl: string;
  telegramUserId: string;
  jobId: string;
  clips: T[];
}): Promise<void> {
  if (params.clips.length === 0) return;
  try {
    await ensureDuplicateFilterTables();
    const sourceKey = normalizeSourceUrl(params.sourceUrl);
    await db.insert(clipFingerprints).values(
      params.clips.map((clip) => ({
        sourceKey,
        sourceUrl: params.sourceUrl,
        telegramUserId: params.telegramUserId,
        jobId: params.jobId,
        clipIndex: clip.index ?? null,
        title: clip.title,
        description: clip.description ?? null,
        reason: clip.reason ?? null,
        startTime: Math.round(clip.startTime),
        endTime: Math.round(clip.endTime),
      }))
    );
  } catch (err) {
    console.error("[duplicate-filter] gagal menyimpan clip_fingerprints:", err);
  }
}

// ─── DASHBOARD STATS ─────────────────────────────────────────────────────

export interface DuplicateFilterStats {
  totalFingerprints: number;
  totalSkipped: number;
  recentSkips: Array<{
    id: number;
    sourceUrl: string;
    candidateTitle: string;
    matchedTitle: string | null;
    combinedScore: number | null;
    createdAt: Date;
  }>;
}

export async function getDuplicateFilterStats(): Promise<DuplicateFilterStats> {
  try {
    await ensureDuplicateFilterTables();
    const [fingerprintCount] = await db.execute(
      sql`SELECT COUNT(*) as count FROM clip_fingerprints`
    ) as unknown as Array<{ count: string }>;
    const [skipCount] = await db.execute(
      sql`SELECT COUNT(*) as count FROM duplicate_clip_skips`
    ) as unknown as Array<{ count: string }>;

    const recent = await db
      .select()
      .from(duplicateClipSkips)
      .orderBy(desc(duplicateClipSkips.createdAt))
      .limit(8);

    return {
      totalFingerprints: Number(fingerprintCount?.count ?? 0),
      totalSkipped: Number(skipCount?.count ?? 0),
      recentSkips: recent.map((r) => ({
        id: r.id,
        sourceUrl: r.sourceUrl,
        candidateTitle: r.candidateTitle,
        matchedTitle: r.matchedTitle,
        combinedScore: r.combinedScore,
        createdAt: r.createdAt,
      })),
    };
  } catch {
    return { totalFingerprints: 0, totalSkipped: 0, recentSkips: [] };
  }
}

export type { DuplicateFilterScope };
