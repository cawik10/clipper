/**
 * 📡 AUTO-MONITOR CHANNEL/PLAYLIST — CORE LOGIC (BARU!)
 * =====================================================================
 * Semua query database & logika "deteksi video baru" untuk fitur
 * Auto-Monitor Channel/Playlist ada di sini. File ini SENGAJA tidak
 * bergantung pada `telegram-bot.ts` (supaya tidak terjadi circular
 * import) — pengiriman notifikasi & eksekusi pipeline AutoClip dilakukan
 * oleh src/lib/channel-monitor-worker.ts, persis seperti pola yang sudah
 * dipakai di src/lib/scheduler.ts untuk fitur Scheduler/Queue Posting.
 *
 * Mudah diganti/diperluas:
 *   - Konfigurasi (interval, batas, dsb.)  → src/lib/channel-monitor-config.ts
 *   - Cara mengambil daftar video terbaru  → fungsi `listRecentVideos()` di bawah
 *     (sekarang: YouTube Data API kalau YOUTUBE_API_KEY diset, otomatis
 *     fallback ke `yt-dlp` kalau tidak — tinggal tambah `else if` baru di
 *     situ untuk mendukung platform/metode lain tanpa menyentuh file lain)
 *   - Notifikasi Telegram & trigger AutoClip → src/lib/channel-monitor-worker.ts
 */

import { exec } from "child_process";
import { promisify } from "util";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  clipJobs,
  monitoredChannels,
  monitoredChannelVideos,
  MonitoredChannelRow,
} from "@/db/schema";
import {
  getAutoUploadDefault,
  getDefaultCheckIntervalMinutes,
  getMaxNewVideosPerRun,
  getYoutubeApiKey,
  shouldProcessLatestOnAdd,
} from "@/lib/channel-monitor-config";

const execAsync = promisify(exec);

export type MonitorSourceType = "channel" | "playlist";

export interface ResolvedMonitorTarget {
  sourceType: MonitorSourceType;
  externalId: string; // channelId (UCxxxx) atau playlistId
  uploadsPlaylistId: string; // playlist yang dipakai utk listing (uploads playlist / playlist itu sendiri)
  title: string;
  inputUrl: string; // URL yang dinormalisasi, dipakai sebagai fallback utk yt-dlp
}

export interface VideoItem {
  id: string;
  title: string;
  publishedAt: Date | null;
  url: string;
}

// ─── TABLE BOOTSTRAP (Railway-friendly, sama pola dgn ensureScheduledUploadsTable) ──
// Membuat tabel otomatis saat runtime kalau belum sempat `drizzle-kit push`.
// Idempotent & aman dipanggil berkali-kali/bersamaan.
let tablesReady: Promise<void> | null = null;
export function ensureChannelMonitorTables(): Promise<void> {
  if (!tablesReady) {
    tablesReady = (async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS monitored_channels (
          id serial PRIMARY KEY,
          telegram_user_id text NOT NULL,
          telegram_chat_id text NOT NULL,
          platform text NOT NULL DEFAULT 'youtube',
          source_type text NOT NULL DEFAULT 'channel',
          input_url text NOT NULL,
          external_id text NOT NULL,
          uploads_playlist_id text,
          title text,
          interval_minutes integer NOT NULL DEFAULT 10,
          auto_upload boolean NOT NULL DEFAULT true,
          enabled boolean NOT NULL DEFAULT true,
          last_video_id text,
          last_video_published_at timestamp,
          last_checked_at timestamp,
          last_error text,
          total_videos_processed integer NOT NULL DEFAULT 0,
          created_at timestamp NOT NULL DEFAULT now(),
          updated_at timestamp NOT NULL DEFAULT now()
        )
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS monitored_channel_videos (
          id serial PRIMARY KEY,
          monitor_id integer NOT NULL,
          video_id text NOT NULL,
          job_id text,
          title text,
          published_at timestamp,
          status text NOT NULL DEFAULT 'queued',
          error_message text,
          created_at timestamp NOT NULL DEFAULT now()
        )
      `);
      await db.execute(sql`
        ALTER TABLE clip_jobs ADD COLUMN IF NOT EXISTS source_monitor_id integer
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS monitored_channel_videos_monitor_idx
          ON monitored_channel_videos (monitor_id)
      `);
    })().catch((err) => {
      tablesReady = null;
      throw err;
    });
  }
  return tablesReady;
}

// =====================================================================
// RESOLVE URL → channel/playlist ID
// =====================================================================
export async function resolveMonitorTarget(rawUrl: string): Promise<ResolvedMonitorTarget> {
  const url = rawUrl.trim();

  const playlistMatch = url.match(/[?&]list=([\w-]+)/);
  if (playlistMatch) {
    const playlistId = playlistMatch[1];
    const title = await resolvePlaylistTitle(playlistId).catch(() => null);
    return {
      sourceType: "playlist",
      externalId: playlistId,
      uploadsPlaylistId: playlistId,
      title: title || `Playlist ${playlistId}`,
      inputUrl: url,
    };
  }

  // Coba YouTube Data API dulu kalau API key tersedia (lebih hemat & akurat).
  const apiKey = getYoutubeApiKey();
  if (apiKey) {
    const viaApi = await resolveChannelViaApi(url, apiKey).catch(() => null);
    if (viaApi) return viaApi;
  }

  // Fallback: yt-dlp (tidak butuh API key sama sekali).
  return resolveChannelViaYtDlp(url);
}

async function resolvePlaylistTitle(playlistId: string): Promise<string | null> {
  const apiKey = getYoutubeApiKey();
  if (!apiKey) return null;
  const { google } = await import("googleapis");
  const youtube = google.youtube({ version: "v3", auth: apiKey });
  const res = await youtube.playlists.list({ id: [playlistId], part: ["snippet"] });
  return res.data.items?.[0]?.snippet?.title || null;
}

async function resolveChannelViaApi(url: string, apiKey: string): Promise<ResolvedMonitorTarget | null> {
  const { google } = await import("googleapis");
  const youtube = google.youtube({ version: "v3", auth: apiKey });

  let channelId: string | null = null;

  const channelIdMatch = url.match(/\/channel\/(UC[\w-]+)/);
  const handleMatch = url.match(/youtube\.com\/@([\w.-]+)/i);
  const legacyMatch = url.match(/youtube\.com\/(?:c|user)\/([\w-]+)/i);

  if (channelIdMatch) {
    channelId = channelIdMatch[1];
  } else if (handleMatch) {
    const res = await youtube.channels.list({ forHandle: `@${handleMatch[1]}`, part: ["id"] });
    channelId = res.data.items?.[0]?.id || null;
  } else if (legacyMatch) {
    const res = await youtube.channels.list({ forUsername: legacyMatch[1], part: ["id"] });
    channelId = res.data.items?.[0]?.id || null;
    if (!channelId) {
      const search = await youtube.search.list({
        q: legacyMatch[1],
        type: ["channel"],
        part: ["snippet"],
        maxResults: 1,
      });
      channelId = search.data.items?.[0]?.snippet?.channelId || null;
    }
  }

  if (!channelId) return null;

  const detail = await youtube.channels.list({
    id: [channelId],
    part: ["snippet", "contentDetails"],
  });
  const item = detail.data.items?.[0];
  if (!item) return null;

  const uploadsPlaylistId = item.contentDetails?.relatedPlaylists?.uploads || `UU${channelId.slice(2)}`;

  return {
    sourceType: "channel",
    externalId: channelId,
    uploadsPlaylistId,
    title: item.snippet?.title || channelId,
    inputUrl: `https://www.youtube.com/channel/${channelId}`,
  };
}

async function resolveChannelViaYtDlp(url: string): Promise<ResolvedMonitorTarget> {
  const videosUrl = normalizeToVideosTab(url);
  const cmd = [
    "yt-dlp",
    "--flat-playlist",
    "--playlist-end", "1",
    "--dump-single-json",
    "--cookies", "cookies.txt",
    `"${videosUrl}"`,
  ].join(" ");

  const { stdout } = await execAsync(cmd, { timeout: 45000, maxBuffer: 1024 * 1024 * 10 });
  const info = JSON.parse(stdout.trim().split("\n")[0]);

  const externalId: string = info.channel_id || info.id || videosUrl;
  return {
    sourceType: "channel",
    externalId,
    uploadsPlaylistId: externalId, // dipakai sbg penanda "listing pakai yt-dlp langsung"
    title: info.channel || info.title || externalId,
    inputUrl: videosUrl,
  };
}

/** Memastikan URL channel diarahkan ke tab /videos supaya yt-dlp list upload terbaru, bukan halaman "Home". */
function normalizeToVideosTab(url: string): string {
  const clean = url.split("?")[0].replace(/\/$/, "");
  if (/\/videos$/.test(clean)) return clean;
  if (/\/(channel|@|c|user)\//i.test(clean) || /youtube\.com\/@/i.test(clean)) {
    return `${clean}/videos`;
  }
  return url;
}

// =====================================================================
// LIST VIDEO TERBARU (API kalau ada key, fallback yt-dlp)
// =====================================================================
export async function listRecentVideos(
  monitor: Pick<MonitoredChannelRow, "sourceType" | "externalId" | "uploadsPlaylistId" | "inputUrl">,
  limit: number = 5
): Promise<VideoItem[]> {
  const apiKey = getYoutubeApiKey();
  if (apiKey && monitor.uploadsPlaylistId) {
    const viaApi = await listRecentVideosViaApi(monitor.uploadsPlaylistId, apiKey, limit).catch((err) => {
      console.error("[channel-monitor] YouTube API listing gagal, fallback ke yt-dlp:", err);
      return null;
    });
    if (viaApi) return viaApi;
  }
  return listRecentVideosViaYtDlp(monitor.inputUrl, limit);
}

async function listRecentVideosViaApi(playlistId: string, apiKey: string, limit: number): Promise<VideoItem[]> {
  const { google } = await import("googleapis");
  const youtube = google.youtube({ version: "v3", auth: apiKey });
  const res = await youtube.playlistItems.list({
    playlistId,
    part: ["snippet", "contentDetails"],
    maxResults: limit,
  });
  return (res.data.items || []).map((item) => {
    const videoId = item.contentDetails?.videoId || item.snippet?.resourceId?.videoId || "";
    const publishedRaw = item.contentDetails?.videoPublishedAt || item.snippet?.publishedAt;
    return {
      id: videoId,
      title: item.snippet?.title || videoId,
      publishedAt: publishedRaw ? new Date(publishedRaw) : null,
      url: `https://www.youtube.com/watch?v=${videoId}`,
    };
  }).filter((v) => v.id);
}

async function listRecentVideosViaYtDlp(inputUrl: string, limit: number): Promise<VideoItem[]> {
  const cmd = [
    "yt-dlp",
    "--flat-playlist",
    "--playlist-end", String(limit),
    "--cookies", "cookies.txt",
    "--print", '"%(id)s\t%(title)s\t%(timestamp)s\t%(upload_date)s"',
    `"${normalizeToVideosTab(inputUrl)}"`,
  ].join(" ");

  const { stdout } = await execAsync(cmd, { timeout: 45000, maxBuffer: 1024 * 1024 * 10 });
  const lines = stdout.split("\n").map((l) => l.trim()).filter(Boolean);

  return lines.map((line) => {
    const [id, title, timestamp, uploadDate] = line.split("\t");
    let publishedAt: Date | null = null;
    if (timestamp && timestamp !== "NA") {
      publishedAt = new Date(Number(timestamp) * 1000);
    } else if (uploadDate && /^\d{8}$/.test(uploadDate)) {
      publishedAt = new Date(
        `${uploadDate.slice(0, 4)}-${uploadDate.slice(4, 6)}-${uploadDate.slice(6, 8)}T00:00:00Z`
      );
    }
    return {
      id,
      title: title || id,
      publishedAt,
      url: `https://www.youtube.com/watch?v=${id}`,
    };
  }).filter((v) => v.id && v.id !== "NA");
}

// =====================================================================
// CRUD MONITOR
// =====================================================================
export async function listMonitorsForUser(telegramUserId: string): Promise<MonitoredChannelRow[]> {
  await ensureChannelMonitorTables();
  return db
    .select()
    .from(monitoredChannels)
    .where(eq(monitoredChannels.telegramUserId, telegramUserId))
    .orderBy(monitoredChannels.id);
}

export async function countMonitorsForUser(telegramUserId: string): Promise<number> {
  await ensureChannelMonitorTables();
  const rows = await db
    .select()
    .from(monitoredChannels)
    .where(eq(monitoredChannels.telegramUserId, telegramUserId));
  return rows.length;
}

export async function addMonitor(params: {
  telegramUserId: string;
  telegramChatId: string;
  url: string;
}): Promise<MonitoredChannelRow> {
  await ensureChannelMonitorTables();
  const target = await resolveMonitorTarget(params.url);

  const [row] = await db
    .insert(monitoredChannels)
    .values({
      telegramUserId: params.telegramUserId,
      telegramChatId: params.telegramChatId,
      sourceType: target.sourceType,
      inputUrl: target.inputUrl,
      externalId: target.externalId,
      uploadsPlaylistId: target.uploadsPlaylistId,
      title: target.title,
      intervalMinutes: getDefaultCheckIntervalMinutes(),
      autoUpload: getAutoUploadDefault(),
      enabled: true,
    })
    .returning();

  // Baseline: supaya video LAMA tidak ikut auto-clip saat baru didaftarkan
  // (kecuali CHANNEL_MONITOR_PROCESS_LATEST_ON_ADD=true). Lihat dokumentasi
  // lengkap di src/lib/channel-monitor-config.ts.
  if (!shouldProcessLatestOnAdd()) {
    try {
      const recent = await listRecentVideos(row, 5);
      if (recent.length) {
        await db.insert(monitoredChannelVideos).values(
          recent.map((v) => ({
            monitorId: row.id,
            videoId: v.id,
            title: v.title,
            publishedAt: v.publishedAt,
            status: "skipped" as const,
          }))
        );
        const newest = recent[0];
        await db
          .update(monitoredChannels)
          .set({ lastVideoId: newest.id, lastVideoPublishedAt: newest.publishedAt, updatedAt: new Date() })
          .where(eq(monitoredChannels.id, row.id));
      }
    } catch (err) {
      console.error("[channel-monitor] Gagal mengambil baseline video awal:", err);
    }
  }

  return row;
}

export async function removeMonitor(id: number, telegramUserId: string): Promise<boolean> {
  await ensureChannelMonitorTables();
  const rows = await db
    .delete(monitoredChannels)
    .where(and(eq(monitoredChannels.id, id), eq(monitoredChannels.telegramUserId, telegramUserId)))
    .returning();
  if (rows.length) {
    await db.delete(monitoredChannelVideos).where(eq(monitoredChannelVideos.monitorId, id));
  }
  return rows.length > 0;
}

export async function setMonitorEnabled(
  id: number,
  telegramUserId: string,
  enabled: boolean
): Promise<boolean> {
  await ensureChannelMonitorTables();
  const rows = await db
    .update(monitoredChannels)
    .set({ enabled, updatedAt: new Date() })
    .where(and(eq(monitoredChannels.id, id), eq(monitoredChannels.telegramUserId, telegramUserId)))
    .returning();
  return rows.length > 0;
}

export async function setMonitorInterval(
  id: number,
  telegramUserId: string,
  minutes: number
): Promise<boolean> {
  await ensureChannelMonitorTables();
  const clamped = Math.min(1440, Math.max(2, Math.round(minutes)));
  const rows = await db
    .update(monitoredChannels)
    .set({ intervalMinutes: clamped, updatedAt: new Date() })
    .where(and(eq(monitoredChannels.id, id), eq(monitoredChannels.telegramUserId, telegramUserId)))
    .returning();
  return rows.length > 0;
}

export async function setMonitorAutoUpload(
  id: number,
  telegramUserId: string,
  autoUpload: boolean
): Promise<boolean> {
  await ensureChannelMonitorTables();
  const rows = await db
    .update(monitoredChannels)
    .set({ autoUpload, updatedAt: new Date() })
    .where(and(eq(monitoredChannels.id, id), eq(monitoredChannels.telegramUserId, telegramUserId)))
    .returning();
  return rows.length > 0;
}

// =====================================================================
// WORKER HELPERS (dipakai oleh channel-monitor-worker.ts)
// =====================================================================

/**
 * Ambil & "klaim" semua monitor yang sudah waktunya dicek ulang dalam satu
 * query atomic (UPDATE ... RETURNING), supaya aman dipanggil bersamaan dari
 * worker in-process maupun endpoint /api/monitor/run tanpa dobel proses.
 */
export async function claimDueMonitors(): Promise<MonitoredChannelRow[]> {
  await ensureChannelMonitorTables();
  const rows = await db.execute<MonitoredChannelRow>(sql`
    UPDATE monitored_channels
    SET last_checked_at = now(), updated_at = now()
    WHERE enabled = true
      AND (
        last_checked_at IS NULL
        OR last_checked_at + (interval_minutes || ' minutes')::interval <= now()
      )
    RETURNING *
  `);
  return (rows as unknown as Array<Record<string, unknown>>).map(mapRawMonitorRow);
}

// db.execute() mengembalikan kolom snake_case mentah — mapping manual ke
// bentuk camelCase yang sama dengan hasil query builder Drizzle biasa.
function mapRawMonitorRow(r: Record<string, unknown>): MonitoredChannelRow {
  return {
    id: Number(r.id),
    telegramUserId: String(r.telegram_user_id),
    telegramChatId: String(r.telegram_chat_id),
    platform: String(r.platform),
    sourceType: String(r.source_type),
    inputUrl: String(r.input_url),
    externalId: String(r.external_id),
    uploadsPlaylistId: (r.uploads_playlist_id as string) ?? null,
    title: (r.title as string) ?? null,
    intervalMinutes: Number(r.interval_minutes),
    autoUpload: Boolean(r.auto_upload),
    enabled: Boolean(r.enabled),
    lastVideoId: (r.last_video_id as string) ?? null,
    lastVideoPublishedAt: r.last_video_published_at ? new Date(r.last_video_published_at as string) : null,
    lastCheckedAt: r.last_checked_at ? new Date(r.last_checked_at as string) : null,
    lastError: (r.last_error as string) ?? null,
    totalVideosProcessed: Number(r.total_videos_processed ?? 0),
    createdAt: new Date(r.created_at as string),
    updatedAt: new Date(r.updated_at as string),
  };
}

/** Video kandidat terbaru dari sebuah monitor yang BELUM pernah tercatat di `monitored_channel_videos`. */
export async function findNewVideos(monitor: MonitoredChannelRow): Promise<VideoItem[]> {
  const maxNew = getMaxNewVideosPerRun();
  const candidates = await listRecentVideos(monitor, Math.max(5, maxNew + 3));
  if (!candidates.length) return [];

  const seen = await db
    .select({ videoId: monitoredChannelVideos.videoId })
    .from(monitoredChannelVideos)
    .where(
      and(
        eq(monitoredChannelVideos.monitorId, monitor.id),
        inArray(monitoredChannelVideos.videoId, candidates.map((c) => c.id))
      )
    );
  const seenIds = new Set(seen.map((s) => s.videoId));

  const fresh = candidates.filter((c) => !seenIds.has(c.id));
  // Proses dari yang paling lama dulu supaya urutan notifikasi Telegram kronologis.
  fresh.sort((a, b) => (a.publishedAt?.getTime() || 0) - (b.publishedAt?.getTime() || 0));
  return fresh.slice(0, maxNew);
}

export async function recordMonitoredVideo(params: {
  monitorId: number;
  videoId: string;
  title: string;
  publishedAt: Date | null;
  status: "queued" | "processing" | "done" | "error" | "skipped";
  jobId?: string;
  errorMessage?: string;
}): Promise<void> {
  await db.insert(monitoredChannelVideos).values({
    monitorId: params.monitorId,
    videoId: params.videoId,
    title: params.title,
    publishedAt: params.publishedAt,
    status: params.status,
    jobId: params.jobId,
    errorMessage: params.errorMessage,
  });
}

export async function updateMonitoredVideoStatus(
  monitorId: number,
  videoId: string,
  status: "queued" | "processing" | "done" | "error" | "skipped",
  errorMessage?: string
): Promise<void> {
  await db
    .update(monitoredChannelVideos)
    .set({ status, errorMessage })
    .where(
      and(eq(monitoredChannelVideos.monitorId, monitorId), eq(monitoredChannelVideos.videoId, videoId))
    );
}

/** Membuat baris `clip_jobs` baru untuk video yang baru terdeteksi — sama persis strukturnya dengan job dari link manual (lihat handleVideoUrl di telegram-bot.ts), hanya saja ditandai `sourceMonitorId`. */
export async function createJobForMonitoredVideo(
  monitor: MonitoredChannelRow,
  video: VideoItem,
  jobId: string
): Promise<void> {
  await db.insert(clipJobs).values({
    jobId,
    telegramUserId: monitor.telegramUserId,
    telegramChatId: monitor.telegramChatId,
    sourceUrl: video.url,
    platform: "youtube",
    status: "queued",
    sourceMonitorId: monitor.id,
  });
}

export async function markMonitorChecked(monitorId: number, newestVideo?: VideoItem, error?: string): Promise<void> {
  const patch: Partial<typeof monitoredChannels.$inferInsert> = {
    updatedAt: new Date(),
    lastError: error || null,
  };
  if (newestVideo) {
    patch.lastVideoId = newestVideo.id;
    patch.lastVideoPublishedAt = newestVideo.publishedAt;
  }
  await db.update(monitoredChannels).set(patch).where(eq(monitoredChannels.id, monitorId));
}

export async function incrementMonitorProcessedCount(monitorId: number, by: number = 1): Promise<void> {
  await db
    .update(monitoredChannels)
    .set({ totalVideosProcessed: sql`${monitoredChannels.totalVideosProcessed} + ${by}` })
    .where(eq(monitoredChannels.id, monitorId));
}

// =====================================================================
// DASHBOARD STATS (ringan, dipakai src/app/page.tsx — tidak mengubah
// data/perilaku stats lama manapun)
// =====================================================================
export async function getChannelMonitorStats() {
  try {
    await ensureChannelMonitorTables();
    const result = await db.execute(sql`
      SELECT
        COUNT(*) AS total_monitors,
        COUNT(*) FILTER (WHERE enabled = true) AS active_monitors,
        COALESCE(SUM(total_videos_processed), 0) AS total_processed
      FROM monitored_channels
    `);
    const row = (result as unknown as Array<Record<string, string>>)[0] || {};
    return {
      totalMonitors: Number(row.total_monitors ?? 0),
      activeMonitors: Number(row.active_monitors ?? 0),
      totalProcessed: Number(row.total_processed ?? 0),
    };
  } catch {
    return { totalMonitors: 0, activeMonitors: 0, totalProcessed: 0 };
  }
}
