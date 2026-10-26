/**
 * 📡 AUTO-MONITOR CHANNEL/PLAYLIST — KONFIGURASI (BARU!)
 * =====================================================================
 * Satu-satunya tempat untuk membaca/mengubah env var fitur ini — sama
 * seperti pola di video-config.ts / scheduler-config.ts, supaya mudah
 * diganti dari Railway Variables tanpa menyentuh kode lain sama sekali.
 *
 * =====================================================================
 * ENV VARS (semua opsional, semua punya default aman)
 * =====================================================================
 * CHANNEL_MONITOR_ENABLED=true
 *   Matikan/nyalakan seluruh fitur auto-monitor. Kalau false, worker
 *   background tidak jalan & command /monitor akan memberi tahu user
 *   bahwa fitur sedang nonaktif. Tidak memengaruhi fitur lain manapun.
 *
 * CHANNEL_MONITOR_POLL_INTERVAL_MS=300000
 *   Seberapa sering worker in-process "bangun" untuk mengecek channel
 *   mana saja yang sudah waktunya dicek ulang (default 5 menit).
 *
 * CHANNEL_MONITOR_DEFAULT_INTERVAL_MINUTES=10
 *   Jeda default antar-pengecekan utk 1 channel/playlist (per monitor
 *   bisa override via /monitorinterval).
 *
 * CHANNEL_MONITOR_MAX_PER_USER=5
 *   Batas jumlah channel/playlist yang boleh dipantau per user Telegram.
 *
 * CHANNEL_MONITOR_MAX_NEW_VIDEOS_PER_RUN=2
 *   Batas jumlah video baru yang diproses sekaligus per channel per
 *   siklus cek (mencegah "banjir" job kalau channel upload banyak video
 *   sekaligus / baru pertama kali dipantau).
 *
 * CHANNEL_MONITOR_PROCESS_LATEST_ON_ADD=false
 *   false (default) = saat channel baru didaftarkan, hanya video yang
 *   terbit SETELAH saat itu yang akan diproses otomatis (video lama
 *   tidak di-reprocess).
 *   true = video TERBARU yang sudah ada saat ini langsung diproses juga
 *   begitu channel didaftarkan (berguna untuk tes cepat).
 *
 * CHANNEL_MONITOR_AUTO_UPLOAD_DEFAULT=true
 *   Default nilai "auto upload ke YouTube Studio" untuk monitor baru.
 *   Kalau user belum connect YouTube, klip tetap dikirim ke Telegram.
 *
 * YOUTUBE_API_KEY=
 *   API key YouTube Data API v3 (read-only, BUKAN OAuth) untuk resolve
 *   channel/playlist & cek video baru secara hemat-kuota. Kalau kosong,
 *   otomatis fallback memakai `yt-dlp` (binary yang sudah dipakai fitur
 *   download) — jadi fitur ini tetap bisa langsung dipakai tanpa setup
 *   tambahan apapun setelah deploy.
 */

export function isChannelMonitorEnabled(): boolean {
  const raw = process.env.CHANNEL_MONITOR_ENABLED;
  if (raw === undefined || raw.trim() === "") return true;
  return raw.toLowerCase().trim() === "true";
}

function parseIntEnv(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (!raw) return fallback;
  const parsed = parseInt(raw.trim(), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function getChannelMonitorPollIntervalMs(): number {
  return parseIntEnv(process.env.CHANNEL_MONITOR_POLL_INTERVAL_MS, 300_000, 30_000, 3_600_000);
}

export function getDefaultCheckIntervalMinutes(): number {
  return parseIntEnv(process.env.CHANNEL_MONITOR_DEFAULT_INTERVAL_MINUTES, 10, 2, 1440);
}

export function getMaxMonitorsPerUser(): number {
  return parseIntEnv(process.env.CHANNEL_MONITOR_MAX_PER_USER, 5, 1, 50);
}

export function getMaxNewVideosPerRun(): number {
  return parseIntEnv(process.env.CHANNEL_MONITOR_MAX_NEW_VIDEOS_PER_RUN, 2, 1, 10);
}

export function shouldProcessLatestOnAdd(): boolean {
  return (process.env.CHANNEL_MONITOR_PROCESS_LATEST_ON_ADD || "").toLowerCase().trim() === "true";
}

export function getAutoUploadDefault(): boolean {
  const raw = process.env.CHANNEL_MONITOR_AUTO_UPLOAD_DEFAULT;
  if (raw === undefined || raw.trim() === "") return true;
  return raw.toLowerCase().trim() === "true";
}

export function getYoutubeApiKey(): string | undefined {
  return process.env.YOUTUBE_API_KEY?.trim() || undefined;
}
