/**
 * 🩺 AUTO-TITLE DOCTOR — LOGIKA UTAMA (FITUR BARU! bagian dari AI Analytics Loop)
 * =====================================================================
 * Dipanggil oleh worker analytics (src/lib/analytics-worker.ts) SETELAH views
 * terbaru ditarik dari YouTube (default tiap 180 menit). Alurnya per user:
 *
 *   1. Cari klip yang: sudah tayang > N jam, views < ambang, statistiknya
 *      terbaca, belum melewati batas penggantian judul.
 *   2. Ambil snippet + status video dari YouTube (judul, deskripsi, tag, privasi).
 *      Video yang belum sesuai privasi (default: harus `public`) dilewati.
 *   3. Minta AI (Gemini/Groq lewat src/lib/ai-provider.ts) membuat Judul &
 *      Hashtag baru yang lebih clickbait (tanpa mengarang fakta).
 *   4. Update video lewat YouTube API `videos.update` (judul, tag, hashtag di
 *      deskripsi — sisa deskripsi tidak berubah).
 *   5. Catat ke tabel `clip_retitle_log` + kirim notifikasi Telegram.
 *
 * Semua pengaturan ada di src/lib/auto-title-doctor-config.ts (env Railway).
 * Saklar utama: ANALYTICS_AUTO_RETITLE_LOW_VIEWS=true
 */

import { google, type youtube_v3 } from "googleapis";
import { and, desc, eq, gte, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { clipPerformance, clipRetitleLog, youtubeTokens, type ClipPerformanceRow, type ClipRetitleLogRow } from "@/db/schema";
import { getTrackDays } from "@/lib/analytics-config";
import { ensureAnalyticsTables, resolveChatId } from "@/lib/analytics-store";
import { escapeHtml } from "@/lib/analytics-report";
import { generateAiText, hasAnyAiProvider } from "@/lib/ai-provider";
import { isAiBudgetExceededError } from "@/lib/cost-tracker"; // 💰 Cost Tracker (BARU!)
import { isTokenExpired, refreshAccessToken } from "@/lib/youtube-uploader";
import {
  DEFAULT_RETITLE_VIEWS_THRESHOLD,
  RETITLE_AVG_MIN_CLIPS,
  RETITLE_MAX_TAGS_CHARS,
  RETITLE_MAX_TITLE_LENGTH,
  RETITLE_PERMISSION_RETRY_HOURS,
  RETITLE_REQUIRED_SCOPES,
  RETITLE_SYSTEM_PROMPT,
  describeRetitleThreshold,
  getRetitleAllowedPrivacy,
  getRetitleCooldownHours,
  getRetitleExtraStyle,
  getRetitleHashtagCount,
  getRetitleMaxAgeDays,
  getRetitleMaxPerClip,
  getRetitleMaxPerCycle,
  getRetitleMinAgeHours,
  getRetitleRetryHours,
  getRetitleThresholdSetting,
  isAutoRetitleEnabled,
  isRetitleDryRun,
  isRetitleNotifyEnabled,
} from "@/lib/auto-title-doctor-config";

const HOUR = 3_600_000;

// ─── TABEL (dibuat otomatis) ─────────────────────────────────────────────

let tableReady: Promise<void> | null = null;

export function ensureRetitleTable(): Promise<void> {
  if (!tableReady) {
    tableReady = (async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS clip_retitle_log (
          id serial PRIMARY KEY,
          youtube_video_id text NOT NULL,
          telegram_user_id text NOT NULL,
          old_title text NOT NULL,
          new_title text,
          hashtags text,
          views_at_retitle integer NOT NULL DEFAULT 0,
          hours_since_upload integer,
          status text NOT NULL,
          error_kind text,
          error text,
          created_at timestamp NOT NULL DEFAULT now()
        )
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS clip_retitle_log_video_idx ON clip_retitle_log (youtube_video_id)
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS clip_retitle_log_user_idx ON clip_retitle_log (telegram_user_id)
      `);
    })().catch((err) => {
      tableReady = null;
      throw err;
    });
  }
  return tableReady;
}

// ─── TIPE ────────────────────────────────────────────────────────────────

export interface RetitleChange {
  videoId: string;
  oldTitle: string;
  newTitle: string;
  hashtags: string[];
  views: number;
  hoursSinceUpload: number;
  dryRun: boolean;
}

export interface RetitleSummary {
  userId: string;
  enabled: boolean;
  dryRun: boolean;
  candidates: number;
  retitled: number;
  failed: number;
  skipped?: string;
  changes: RetitleChange[];
  errors: string[];
}

export type ErrorKind = "permission" | "quota" | "ai" | "youtube";

// ─── HELPER TEKS ─────────────────────────────────────────────────────────

function parseJsonObject<T>(text: string): T | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

function cleanTitle(raw: string): string {
  let t = raw
    .replace(/[<>]/g, "")
    .replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length > RETITLE_MAX_TITLE_LENGTH) {
    const cut = t.slice(0, RETITLE_MAX_TITLE_LENGTH);
    const lastSpace = cut.lastIndexOf(" ");
    t = (lastSpace > RETITLE_MAX_TITLE_LENGTH * 0.6 ? cut.slice(0, lastSpace) : cut).trim();
  }
  return t;
}

function normalizeHashtags(raw: unknown, max: number): string[] {
  if (!Array.isArray(raw) || max <= 0) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const word = item.replace(/[^\p{L}\p{N}_]/gu, "").toLowerCase();
    if (!word || word.length > 30) continue;
    const tag = `#${word}`;
    if (!out.includes(tag)) out.push(tag);
    if (out.length >= max) break;
  }
  return out;
}

/** Gabungkan tag baru + tag lama (tanpa duplikat) dengan batas total karakter YouTube. */
function mergeTags(newTags: string[], oldTags: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let total = 0;
  for (const tag of [...newTags, ...oldTags]) {
    const t = tag.trim();
    const key = t.toLowerCase();
    if (!t || seen.has(key)) continue;
    const cost = t.length + (t.includes(" ") ? 2 : 0) + 1;
    if (total + cost > RETITLE_MAX_TAGS_CHARS) break;
    seen.add(key);
    out.push(t);
    total += cost;
  }
  return out;
}

/** Ganti baris hashtag di akhir deskripsi dengan hashtag baru; teks lainnya tidak disentuh. */
function rebuildDescription(oldDescription: string, hashtags: string[]): string {
  if (!hashtags.length) return oldDescription;
  const lineOfTags = /^\s*(?:#[\p{L}\p{N}_]+\s*)+$/u;
  const lines = oldDescription.replace(/\s+$/g, "").split("\n");
  while (lines.length && (lineOfTags.test(lines[lines.length - 1]) || lines[lines.length - 1].trim() === "")) {
    lines.pop();
  }
  const base = lines.join("\n").trim().slice(0, 4800);
  return (base ? `${base}\n\n` : "") + hashtags.join(" ");
}

// ─── AI ──────────────────────────────────────────────────────────────────

async function generateNewTitle(args: {
  row: ClipPerformanceRow;
  currentTitle: string;
  description: string;
  tags: string[];
  previousTitles: string[];
  hours: number;
}): Promise<{ title: string; hashtags: string[] }> {
  if (!hasAnyAiProvider()) throw new Error("Tidak ada GEMINI_API_KEY / GROQ_API_KEY");
  const hashtagCount = getRetitleHashtagCount();
  const extra = getRetitleExtraStyle();
  const { row } = args;

  const user = [
    "KONTEKS KLIP:",
    `- Judul saat ini: "${args.currentTitle}"`,
    row.hook ? `- Hook di detik pertama: "${row.hook}"` : null,
    `- Niche: ${row.niche}`,
    row.sourceTitle ? `- Judul video sumber: "${row.sourceTitle}"` : null,
    args.description ? `- Deskripsi: "${args.description.replace(/\s+/g, " ").slice(0, 300)}"` : null,
    args.tags.length ? `- Tag saat ini: ${args.tags.slice(0, 10).join(", ")}` : null,
    `- Performa: baru ${row.views.toLocaleString("id-ID")} views setelah ${args.hours} jam tayang (di bawah target)`,
    args.previousTitles.length ? `- Judul yang SUDAH dipakai (jangan diulang): ${args.previousTitles.map((t) => `"${t}"`).join(" | ")}` : null,
    "",
    `Buat 1 judul baru yang lebih menggoda klik + ${hashtagCount} hashtag.`,
    extra ? `Gaya tambahan dari pemilik channel: ${extra}` : null,
  ]
    .filter((l): l is string => l !== null)
    .join("\n");

  // 💰 Cost Tracker: label fitur + user pemilik klip untuk pencatatan biaya
  const ai = await generateAiText(RETITLE_SYSTEM_PROMPT, user, { feature: "title_doctor", userId: row.telegramUserId });
  const parsed = parseJsonObject<{ title?: unknown; hashtags?: unknown }>(ai.text);
  const title = typeof parsed?.title === "string" ? cleanTitle(parsed.title) : "";
  if (!title) throw new Error("AI tidak mengembalikan judul yang valid");
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  if ([args.currentTitle, ...args.previousTitles].some((t) => norm(t) === norm(title))) {
    throw new Error("AI menghasilkan judul yang sama dengan sebelumnya");
  }
  return { title, hashtags: normalizeHashtags(parsed?.hashtags, hashtagCount) };
}

// ─── YOUTUBE ─────────────────────────────────────────────────────────────

export function classifyError(err: unknown): { kind: ErrorKind; message: string } {
  const e = err as {
    code?: number | string;
    message?: string;
    errors?: Array<{ reason?: string }>;
    response?: { status?: number; data?: { error?: { errors?: Array<{ reason?: string }> } } };
  };
  const reasons = [...(e?.errors || []), ...(e?.response?.data?.error?.errors || [])].map((r) => r.reason || "").join(" ");
  const message = err instanceof Error ? err.message : String(err);
  const text = `${message} ${reasons}`;
  const status = Number(e?.code ?? e?.response?.status);
  if (/quota/i.test(text)) return { kind: "quota", message };
  if (status === 403 || status === 401 || /insufficient|forbidden|scope|permission|invalid_grant|unauthorized/i.test(text)) {
    return { kind: "permission", message };
  }
  return { kind: "youtube", message };
}

export function hasRequiredScope(scope: string | null | undefined): boolean | null {
  if (!scope || !scope.trim()) return null; // tidak diketahui → coba saja
  const granted = scope.split(/[\s,]+/);
  return RETITLE_REQUIRED_SCOPES.some((s) => granted.includes(s));
}

export async function getYoutubeClient(userId: string): Promise<{ youtube: youtube_v3.Youtube; scope: string | null } | { error: string; kind: ErrorKind }> {
  const rows = await db.select().from(youtubeTokens).where(eq(youtubeTokens.telegramUserId, userId));
  if (!rows.length) return { error: "YouTube belum terhubung (/connect)", kind: "permission" };
  const tokenRow = rows[0];

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
      return { error: `Refresh token gagal: ${err instanceof Error ? err.message : String(err)}`, kind: "permission" };
    }
  }

  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);
  auth.setCredentials({ access_token: accessToken, refresh_token: tokenRow.refreshToken });
  return { youtube: google.youtube({ version: "v3", auth }), scope: tokenRow.scope };
}

// ─── LOG & NOTIFIKASI ────────────────────────────────────────────────────

async function writeLog(entry: typeof clipRetitleLog.$inferInsert): Promise<void> {
  try {
    await db.insert(clipRetitleLog).values(entry);
  } catch (err) {
    console.warn("[title-doctor] gagal menulis log:", err instanceof Error ? err.message : err);
  }
}

async function sendTelegram(userId: string, text: string): Promise<void> {
  try {
    const chatId = await resolveChatId(userId);
    const { bot } = await import("@/lib/telegram-bot");
    await bot.api.sendMessage(chatId, text.slice(0, 4000), {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });
  } catch (err) {
    console.warn("[title-doctor] notifikasi Telegram gagal:", err instanceof Error ? err.message : err);
  }
}

function formatChanges(changes: RetitleChange[], dryRun: boolean): string {
  const head = dryRun
    ? "🩺 <b>Auto-Title Doctor — SIMULASI</b>\n<i>(ANALYTICS_RETITLE_DRY_RUN=true, YouTube tidak diubah)</i>"
    : "🩺 <b>Auto-Title Doctor</b>\nJudul klip ber-views rendah sudah diperbarui AI:";
  const body = changes
    .map(
      (c) =>
        `\n\n🎬 <a href="https://youtu.be/${c.videoId}">${c.videoId}</a> · ${c.views.toLocaleString("id-ID")} views / ${c.hoursSinceUpload} jam\n` +
        `❌ <s>${escapeHtml(c.oldTitle)}</s>\n✅ <b>${escapeHtml(c.newTitle)}</b>` +
        (c.hashtags.length ? `\n🏷 ${escapeHtml(c.hashtags.join(" "))}` : "")
    )
    .join("");
  return head + body;
}

// ─── INTI: PERIKSA & GANTI JUDUL ─────────────────────────────────────────

interface LogStats {
  successCount: number;
  lastSuccessAt: number | null;
  lastFailAt: number | null;
  lastDryAt: number | null;
  titles: string[];
}

export async function runAutoRetitle(userId: string, opts: { force?: boolean; dryRun?: boolean } = {}): Promise<RetitleSummary> {
  const dryRun = opts.dryRun ?? isRetitleDryRun();
  const summary: RetitleSummary = {
    userId,
    enabled: isAutoRetitleEnabled(),
    dryRun,
    candidates: 0,
    retitled: 0,
    failed: 0,
    changes: [],
    errors: [],
  };
  if (!summary.enabled) {
    summary.skipped = "ANALYTICS_AUTO_RETITLE_LOW_VIEWS bukan true";
    return summary;
  }

  await ensureAnalyticsTables();
  await ensureRetitleTable();

  const now = Date.now();
  const trackCutoff = new Date(now - getTrackDays() * 86_400_000);

  // Semua klip user yang statistiknya terbaca (dasar perhitungan ambang "avg")
  const readable = await db
    .select()
    .from(clipPerformance)
    .where(
      and(
        eq(clipPerformance.telegramUserId, userId),
        gte(clipPerformance.uploadedAt, trackCutoff),
        isNotNull(clipPerformance.lastSyncedAt),
        isNull(clipPerformance.syncError)
      )
    );
  if (!readable.length) {
    summary.skipped = "belum ada klip dengan statistik terbaca";
    return summary;
  }

  const setting = getRetitleThresholdSetting();
  let threshold: number;
  if (setting.mode === "avg") {
    threshold =
      readable.length >= RETITLE_AVG_MIN_CLIPS
        ? readable.reduce((s, r) => s + r.views, 0) / readable.length
        : DEFAULT_RETITLE_VIEWS_THRESHOLD;
  } else {
    threshold = setting.value;
  }

  // Riwayat penggantian judul user ini
  const logs = await db.select().from(clipRetitleLog).where(eq(clipRetitleLog.telegramUserId, userId)).orderBy(desc(clipRetitleLog.createdAt));
  const statsByVideo = new Map<string, LogStats>();
  let lastPermissionFailAt: number | null = null;
  for (const l of logs) {
    const s = statsByVideo.get(l.youtubeVideoId) ?? { successCount: 0, lastSuccessAt: null, lastFailAt: null, lastDryAt: null, titles: [] };
    const at = l.createdAt.getTime();
    if (l.status === "success") {
      s.successCount++;
      s.lastSuccessAt = Math.max(s.lastSuccessAt ?? 0, at);
    } else if (l.status === "dry_run") {
      s.lastDryAt = Math.max(s.lastDryAt ?? 0, at);
    } else if (l.status === "failed") {
      s.lastFailAt = Math.max(s.lastFailAt ?? 0, at);
      if (l.errorKind === "permission") lastPermissionFailAt = Math.max(lastPermissionFailAt ?? 0, at);
    }
    for (const t of [l.oldTitle, l.newTitle]) if (t && !s.titles.includes(t)) s.titles.push(t);
    statsByVideo.set(l.youtubeVideoId, s);
  }

  const minAge = now - getRetitleMinAgeHours() * HOUR;
  const maxAge = now - getRetitleMaxAgeDays() * 86_400_000;
  const maxPerClip = getRetitleMaxPerClip();
  const cooldown = getRetitleCooldownHours() * HOUR;
  const retry = getRetitleRetryHours() * HOUR;

  const candidates = readable
    .filter((r) => {
      const up = r.uploadedAt.getTime();
      if (up > minAge || up < maxAge) return false;
      if (r.views >= threshold) return false;
      const s = statsByVideo.get(r.youtubeVideoId);
      if (!s) return true;
      if (s.successCount >= maxPerClip) return false;
      if (s.lastSuccessAt && now - s.lastSuccessAt < cooldown) return false;
      if (s.lastDryAt && now - s.lastDryAt < cooldown) return false;
      if (s.lastFailAt && now - s.lastFailAt < retry) return false;
      return true;
    })
    .sort((a, b) => a.views - b.views || a.uploadedAt.getTime() - b.uploadedAt.getTime());

  summary.candidates = candidates.length;
  if (!candidates.length) return summary;

  // Klien YouTube + cek izin
  const client = await getYoutubeClient(userId);
  const permissionBlocked = (reason: string, kind: ErrorKind = "permission") => async (first: ClipPerformanceRow) => {
    summary.failed++;
    summary.errors.push(reason);
    const recent = lastPermissionFailAt !== null && now - lastPermissionFailAt < RETITLE_PERMISSION_RETRY_HOURS * HOUR;
    if (recent && !opts.force) {
      summary.skipped = "izin YouTube belum cukup (notifikasi sudah dikirim sebelumnya)";
      return;
    }
    await writeLog({
      youtubeVideoId: first.youtubeVideoId,
      telegramUserId: userId,
      oldTitle: first.title,
      viewsAtRetitle: first.views,
      status: "failed",
      errorKind: kind,
      error: reason.slice(0, 500),
    });
    if (isRetitleNotifyEnabled()) {
      await sendTelegram(
        userId,
        "🩺 <b>Auto-Title Doctor butuh izin tambahan</b>\n" +
          `Ada ${candidates.length} klip ber-views rendah yang siap diperbaiki judulnya, tapi YouTube menolak: <i>${escapeHtml(reason.slice(0, 160))}</i>\n\n` +
          "👉 Kirim <code>/connect</code> lalu setujui izin <b>mengelola video YouTube</b>. Setelah itu klip dicek otomatis di siklus berikutnya."
      );
    }
  };

  if ("error" in client) {
    await permissionBlocked(client.error, client.kind)(candidates[0]);
    return summary;
  }
  const scopeOk = hasRequiredScope(client.scope);
  if (scopeOk === false) {
    await permissionBlocked("Token YouTube belum punya izin edit video (scope youtube.force-ssl)")(candidates[0]);
    return summary;
  }

  const youtube = client.youtube;
  const allowedPrivacy = getRetitleAllowedPrivacy();
  const maxPerCycle = getRetitleMaxPerCycle();
  const processed: string[] = [];

  // Ambil snippet + status semua kandidat (max 50 per request, 1 unit kuota)
  const info = new Map<string, youtube_v3.Schema$Video>();
  try {
    const ids = candidates.slice(0, 50).map((c) => c.youtubeVideoId);
    const res = await youtube.videos.list({ part: ["snippet", "status"], id: ids, maxResults: 50 });
    for (const item of res.data.items || []) if (item.id) info.set(item.id, item);
  } catch (err) {
    const c = classifyError(err);
    if (c.kind === "permission") await permissionBlocked(c.message)(candidates[0]);
    else {
      summary.failed++;
      summary.errors.push(c.message);
    }
    return summary;
  }

  for (const row of candidates) {
    if (summary.retitled >= maxPerCycle) break;
    const video = info.get(row.youtubeVideoId);
    if (!video?.snippet) continue; // dihapus / tidak terbaca
    const privacy = video.status?.privacyStatus || "private";
    if (!allowedPrivacy.includes(privacy)) continue; // private = views rendah wajar, jangan diutak-atik

    const snippet = video.snippet;
    const oldTitle = snippet.title || row.title;
    const hours = Math.round((now - row.uploadedAt.getTime()) / HOUR);
    const oldTags = snippet.tags || [];
    const previousTitles = statsByVideo.get(row.youtubeVideoId)?.titles ?? [];
    processed.push(row.youtubeVideoId);

    // 1) AI
    let generated: { title: string; hashtags: string[] };
    try {
      generated = await generateNewTitle({
        row,
        currentTitle: oldTitle,
        description: snippet.description || "",
        tags: oldTags,
        previousTitles,
        hours,
      });
    } catch (err) {
      // 💰 Cost Tracker — AI dijeda karena batas biaya harian: berhenti tanpa mencatat "failed"
      // (supaya klip tidak kena cooldown gagal; dicoba lagi otomatis setelah reset).
      if (isAiBudgetExceededError(err)) {
        summary.errors.push("Batas biaya AI harian tercapai — Title Doctor dijeda sampai reset.");
        break;
      }
      const message = err instanceof Error ? err.message : String(err);
      summary.failed++;
      summary.errors.push(`${row.youtubeVideoId}: ${message}`);
      await writeLog({ youtubeVideoId: row.youtubeVideoId, telegramUserId: userId, oldTitle, viewsAtRetitle: row.views, hoursSinceUpload: hours, status: "failed", errorKind: "ai", error: message.slice(0, 500) });
      continue;
    }

    const change: RetitleChange = {
      videoId: row.youtubeVideoId,
      oldTitle,
      newTitle: generated.title,
      hashtags: generated.hashtags,
      views: row.views,
      hoursSinceUpload: hours,
      dryRun,
    };

    // 2) Simulasi
    if (dryRun) {
      summary.retitled++;
      summary.changes.push(change);
      await writeLog({ youtubeVideoId: row.youtubeVideoId, telegramUserId: userId, oldTitle, newTitle: generated.title, hashtags: generated.hashtags.join(" ") || null, viewsAtRetitle: row.views, hoursSinceUpload: hours, status: "dry_run" });
      continue;
    }

    // 3) videos.update (sisa field snippet dipertahankan supaya tidak terhapus)
    try {
      await youtube.videos.update({
        part: ["snippet"],
        requestBody: {
          id: row.youtubeVideoId,
          snippet: {
            title: generated.title,
            description: rebuildDescription(snippet.description || "", generated.hashtags),
            tags: generated.hashtags.length ? mergeTags(generated.hashtags.map((h) => h.slice(1)), oldTags) : oldTags,
            categoryId: snippet.categoryId || "22",
            defaultLanguage: snippet.defaultLanguage || undefined,
            defaultAudioLanguage: snippet.defaultAudioLanguage || undefined,
          },
        },
      });
    } catch (err) {
      const c = classifyError(err);
      summary.failed++;
      summary.errors.push(`${row.youtubeVideoId}: ${c.message}`);
      if (c.kind === "permission") {
        await permissionBlocked(c.message)(row);
        break;
      }
      await writeLog({ youtubeVideoId: row.youtubeVideoId, telegramUserId: userId, oldTitle, newTitle: generated.title, viewsAtRetitle: row.views, hoursSinceUpload: hours, status: "failed", errorKind: c.kind, error: c.message.slice(0, 500) });
      if (c.kind === "quota") break; // kuota harian habis → berhenti
      continue;
    }

    summary.retitled++;
    summary.changes.push(change);
    await writeLog({ youtubeVideoId: row.youtubeVideoId, telegramUserId: userId, oldTitle, newTitle: generated.title, hashtags: generated.hashtags.join(" ") || null, viewsAtRetitle: row.views, hoursSinceUpload: hours, status: "success" });
    await db
      .update(clipPerformance)
      .set({ title: generated.title.slice(0, 200) })
      .where(eq(clipPerformance.id, row.id))
      .catch(() => {});
    await new Promise((r) => setTimeout(r, 1000));
  }

  if (summary.changes.length && isRetitleNotifyEnabled()) {
    await sendTelegram(userId, formatChanges(summary.changes, dryRun));
  }
  return summary;
}

/** Jalankan untuk banyak user; error satu user tidak menghentikan yang lain. */
export async function runAutoRetitleForUsers(userIds: string[], opts: { force?: boolean; dryRun?: boolean } = {}): Promise<RetitleSummary[]> {
  const out: RetitleSummary[] = [];
  if (!isAutoRetitleEnabled()) return out;
  for (const userId of userIds) {
    try {
      out.push(await runAutoRetitle(userId, opts));
    } catch (err) {
      console.error(`[title-doctor] user ${userId} gagal:`, err instanceof Error ? err.message : err);
      out.push({
        userId,
        enabled: true,
        dryRun: opts.dryRun ?? isRetitleDryRun(),
        candidates: 0,
        retitled: 0,
        failed: 1,
        changes: [],
        errors: [err instanceof Error ? err.message : String(err)],
      });
    }
  }
  return out;
}

// ─── RIWAYAT (untuk Telegram & dashboard) ────────────────────────────────

export async function getRetitleHistory(userId: string | null, limit = 5): Promise<ClipRetitleLogRow[]> {
  await ensureRetitleTable();
  const q = db.select().from(clipRetitleLog);
  const rows = userId
    ? await q.where(eq(clipRetitleLog.telegramUserId, userId)).orderBy(desc(clipRetitleLog.createdAt)).limit(limit)
    : await q.orderBy(desc(clipRetitleLog.createdAt)).limit(limit);
  return rows;
}

export async function getRetitleCounts(userId?: string | null): Promise<{ success: number; dryRun: number; failed: number }> {
  await ensureRetitleTable();
  const base = userId ? await db.select().from(clipRetitleLog).where(eq(clipRetitleLog.telegramUserId, userId)) : await db.select().from(clipRetitleLog);
  return {
    success: base.filter((r) => r.status === "success").length,
    dryRun: base.filter((r) => r.status === "dry_run").length,
    failed: base.filter((r) => r.status === "failed").length,
  };
}

/** Ringkasan kriteria untuk ditampilkan ke user. */
export function describeRetitleRules(): string {
  return (
    `tayang > ${getRetitleMinAgeHours()} jam, views ${describeRetitleThreshold()}, ` +
    `maks ${getRetitleMaxPerClip()}x per klip, video: ${getRetitleAllowedPrivacy().join("/")}`
  );
}
