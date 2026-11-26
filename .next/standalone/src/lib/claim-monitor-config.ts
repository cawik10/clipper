/**
 * 🚨 POST-UPLOAD CLAIM MONITOR — KONFIGURASI (FITUR BARU!)
 * =====================================================================
 * Satu-satunya tempat untuk membaca/mengubah pengaturan fitur ini — pola sama
 * dengan source-guard-config.ts / auto-prune-config.ts. Cukup ubah lewat
 * Railway → Variables (lalu restart service), tanpa menyentuh kode lain.
 *
 * Kenapa ada? Karena bot mengambil video channel LAIN, Copyright Guard sebelum
 * upload (Source Guard) belum cukup — klaim Content ID / pembatasan baru
 * muncul SETELAH video tayang. Monitor ini:
 *   1. Mengecek video yang sudah diupload secara berkala lewat YouTube API
 *      `videos.list` (status.uploadStatus / status.rejectionReason,
 *      contentDetails.licensedContent, contentDetails.regionRestriction, dst.)
 *   2. Kalau ada klaim / pembatasan → alert Telegram dengan tombol
 *        [🗑 Hapus]  [🔒 Private]  [🙈 Abaikan]
 *   3. Menghitung RASIO KLAIM PER SOURCE CHANNEL (klip yang kena klaim ÷ klip
 *      yang sudah dicek), lalu AUTO-BLACKLIST channel yang sering menimbulkan
 *      klaim. Channel di blacklist tidak akan diproses lagi (Source Guard +
 *      Auto-Monitor), dan monitornya otomatis dijeda.
 *   4. Perintah Telegram: /claims  dan  /blacklist
 *
 * 🧑‍⚖️ Bot TIDAK pernah menghapus / memprivatekan video sendiri — hanya setelah
 *    kamu menekan tombolnya di Telegram.
 *
 * =====================================================================
 * ENV VARS (semua opsional, semua punya default aman)
 * =====================================================================
 * ── Monitor ─────────────────────────────────────────────────────────
 * CLAIM_MONITOR_ENABLED=true            SAKLAR UTAMA (false = fitur mati total)
 * CLAIM_MONITOR_INTERVAL_MINUTES=60     seberapa sering worker mengecek (min 5)
 * CLAIM_MONITOR_TRACK_DAYS=90           hanya cek video yang diupload ≤ N hari lalu
 * CLAIM_MONITOR_FRESH_DAYS=7            video lebih muda dari N hari dicek tiap siklus
 * CLAIM_MONITOR_OLD_RECHECK_HOURS=24    video yang lebih tua dicek ulang tiap N jam
 * CLAIM_MONITOR_SIGNALS=rejected,licensed,region
 *     Sinyal yang dianggap klaim/pembatasan (pilih salah satu / lebih):
 *       rejected = status.uploadStatus=rejected + status.rejectionReason
 *                  (claim, copyright, duplicate, termsOfUse, dst.)
 *       licensed = contentDetails.licensedContent=true (di-claim content partner / Content ID)
 *       region   = contentDetails.regionRestriction (diblokir di sebagian negara — biasanya akibat klaim)
 *       age      = contentDetails.contentRating ytAgeRestricted (pembatasan usia, opsional)
 * ── Alert Telegram ──────────────────────────────────────────────────
 * CLAIM_MONITOR_NOTIFY=true             kirim alert ke Telegram
 * CLAIM_MONITOR_ACTIONS=delete,private  tombol yang ditawarkan (+ "Abaikan" selalu ada)
 * CLAIM_MONITOR_HIDE_TO=private         tombol "Private" mengubah privasi ke: private | unlisted
 * CLAIM_MONITOR_DELETE_CONFIRM=true     Hapus butuh konfirmasi tombol kedua
 * CLAIM_MONITOR_MAX_ALERTS_PER_CYCLE=10 maks alert per user per siklus (hindari spam)
 * CLAIM_MONITOR_REMINDER_HOURS=0        ingatkan lagi alert yang belum diputuskan tiap N jam (0 = tidak)
 * CLAIM_MONITOR_REQUEST_SCOPE=true      minta izin youtube.force-ssl saat /connect (dibutuhkan tombol Hapus/Private)
 * ── Rasio klaim & blacklist ─────────────────────────────────────────
 * CLAIM_AUTO_BLACKLIST=true             auto-blacklist channel sumber yang sering kena klaim
 * CLAIM_BLACKLIST_MIN_CLIPS=3           minimal klip yang sudah dicek dari channel itu
 * CLAIM_BLACKLIST_MIN_CLAIMS=2          minimal klip yang kena klaim
 * CLAIM_BLACKLIST_RATIO_PERCENT=30      rasio klaim minimal (%) → blacklist
 * CLAIM_RATIO_COUNT_IGNORED=true        klaim yang di-"Abaikan" tetap dihitung di rasio
 * CLAIM_BLACKLIST_ENFORCE=block         block = job dari channel blacklist DITOLAK
 *                                       warn  = hanya peringatan (job lanjut)
 *                                       off   = daftar blacklist hanya dicatat
 * CLAIM_BLACKLIST_PAUSE_MONITORS=true   jeda Auto-Monitor yang menunjuk channel blacklist
 * CLAIM_BLACKLIST_CHANNELS=             blacklist GLOBAL manual (koma): UCxxx,@handle,nama,URL
 * CLAIM_BLACKLIST_NOTIFY=true           kabari lewat Telegram saat channel di-auto-blacklist
 *
 * Whitelist (COPYRIGHT_WHITELIST_CHANNELS / /whitelist) & channel milik sendiri
 * TIDAK PERNAH di-auto-blacklist.
 *
 * Endpoint cadangan (Railway Cron): GET /api/claims/run?secret=SETUP_SECRET
 */

export type ClaimSignalType = "rejected" | "licensed" | "region" | "age";
export type ClaimAction = "delete" | "private";
export type BlacklistEnforce = "block" | "warn" | "off";

const ALL_SIGNALS: ClaimSignalType[] = ["rejected", "licensed", "region", "age"];

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  return !/^(false|0|off|no|nonaktif)$/i.test(raw.trim());
}

function envInt(name: string, fallback: number, min: number, max: number): number {
  const n = parseInt((process.env[name] || "").trim(), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function envList<T extends string>(name: string, fallback: T[], allowed: readonly T[]): T[] {
  const list = (process.env[name] || "")
    .toLowerCase()
    .split(/[,\s;]+/)
    .map((s) => s.trim())
    .filter((s): s is T => (allowed as readonly string[]).includes(s));
  return list.length ? Array.from(new Set(list)) : fallback;
}

// ─── SAKLAR & JADWAL ─────────────────────────────────────────────────────

export function isClaimMonitorEnabled(): boolean {
  return envBool("CLAIM_MONITOR_ENABLED", true);
}

export function getClaimIntervalMinutes(): number {
  return envInt("CLAIM_MONITOR_INTERVAL_MINUTES", 60, 5, 24 * 60);
}

export function getClaimTrackDays(): number {
  return envInt("CLAIM_MONITOR_TRACK_DAYS", 90, 1, 3650);
}

export function getClaimFreshDays(): number {
  return envInt("CLAIM_MONITOR_FRESH_DAYS", 7, 0, 365);
}

export function getClaimOldRecheckHours(): number {
  return envInt("CLAIM_MONITOR_OLD_RECHECK_HOURS", 24, 1, 24 * 30);
}

export function getClaimSignals(): ClaimSignalType[] {
  return envList<ClaimSignalType>("CLAIM_MONITOR_SIGNALS", ["rejected", "licensed", "region"], ALL_SIGNALS);
}

// ─── ALERT ───────────────────────────────────────────────────────────────

export function isClaimNotifyEnabled(): boolean {
  return envBool("CLAIM_MONITOR_NOTIFY", true);
}

export function getClaimActions(): ClaimAction[] {
  return envList<ClaimAction>("CLAIM_MONITOR_ACTIONS", ["delete", "private"], ["delete", "private"]);
}

export function getClaimHideTo(): "private" | "unlisted" {
  return (process.env.CLAIM_MONITOR_HIDE_TO || "").trim().toLowerCase() === "unlisted" ? "unlisted" : "private";
}

export function isClaimDeleteConfirmRequired(): boolean {
  return envBool("CLAIM_MONITOR_DELETE_CONFIRM", true);
}

export function getClaimMaxAlertsPerCycle(): number {
  return envInt("CLAIM_MONITOR_MAX_ALERTS_PER_CYCLE", 10, 1, 50);
}

export function getClaimReminderHours(): number {
  return envInt("CLAIM_MONITOR_REMINDER_HOURS", 0, 0, 24 * 60);
}

/** Minta scope `youtube.force-ssl` saat /connect (hanya kalau fitur menyala). */
export function shouldRequestClaimScope(): boolean {
  return isClaimMonitorEnabled() && envBool("CLAIM_MONITOR_REQUEST_SCOPE", true);
}

// ─── RASIO & BLACKLIST ───────────────────────────────────────────────────

export function isAutoBlacklistEnabled(): boolean {
  return envBool("CLAIM_AUTO_BLACKLIST", true);
}

export function getBlacklistMinClips(): number {
  return envInt("CLAIM_BLACKLIST_MIN_CLIPS", 3, 1, 1000);
}

export function getBlacklistMinClaims(): number {
  return envInt("CLAIM_BLACKLIST_MIN_CLAIMS", 2, 1, 1000);
}

export function getBlacklistRatioPercent(): number {
  return envInt("CLAIM_BLACKLIST_RATIO_PERCENT", 30, 1, 100);
}

export function shouldCountIgnoredClaims(): boolean {
  return envBool("CLAIM_RATIO_COUNT_IGNORED", true);
}

export function getBlacklistEnforce(): BlacklistEnforce {
  const raw = (process.env.CLAIM_BLACKLIST_ENFORCE || "").trim().toLowerCase();
  if (raw === "warn") return "warn";
  if (raw === "off" || raw === "false" || raw === "disabled") return "off";
  return "block";
}

export function shouldPauseBlacklistedMonitors(): boolean {
  return envBool("CLAIM_BLACKLIST_PAUSE_MONITORS", true);
}

export function getEnvBlacklist(): string[] {
  return (process.env.CLAIM_BLACKLIST_CHANNELS || "")
    .split(/[,\n;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isBlacklistNotifyEnabled(): boolean {
  return envBool("CLAIM_BLACKLIST_NOTIFY", true);
}

/** Ringkasan aturan auto-blacklist untuk ditampilkan ke user. */
export function describeBlacklistRule(): string {
  return (
    `≥ ${getBlacklistMinClips()} klip dicek, ≥ ${getBlacklistMinClaims()} klip kena klaim, ` +
    `rasio ≥ ${getBlacklistRatioPercent()}%`
  );
}

/** Ringkasan semua konfigurasi aktif — dipakai dashboard & perintah Telegram. */
export function getClaimMonitorConfigSummary() {
  return {
    enabled: isClaimMonitorEnabled(),
    intervalMinutes: getClaimIntervalMinutes(),
    trackDays: getClaimTrackDays(),
    freshDays: getClaimFreshDays(),
    oldRecheckHours: getClaimOldRecheckHours(),
    signals: getClaimSignals(),
    notify: isClaimNotifyEnabled(),
    actions: getClaimActions(),
    hideTo: getClaimHideTo(),
    deleteConfirm: isClaimDeleteConfirmRequired(),
    maxAlertsPerCycle: getClaimMaxAlertsPerCycle(),
    reminderHours: getClaimReminderHours(),
    autoBlacklist: isAutoBlacklistEnabled(),
    minClips: getBlacklistMinClips(),
    minClaims: getBlacklistMinClaims(),
    ratioPercent: getBlacklistRatioPercent(),
    countIgnored: shouldCountIgnoredClaims(),
    enforce: getBlacklistEnforce(),
    pauseMonitors: shouldPauseBlacklistedMonitors(),
    envBlacklist: getEnvBlacklist(),
  };
}

// ─── KONSTANTA (ubah di sini kalau perlu) ────────────────────────────────

/** Scope Google yang cukup untuk `videos.update` & `videos.delete`. */
export const CLAIM_REQUIRED_SCOPES = [
  "https://www.googleapis.com/auth/youtube.force-ssl",
  "https://www.googleapis.com/auth/youtube",
];
export const CLAIM_SCOPE = "https://www.googleapis.com/auth/youtube.force-ssl";

/** Batas video per panggilan videos.list (maks YouTube = 50). */
export const CLAIM_BATCH_SIZE = 50;

/** Jeda setelah server boot sebelum siklus pertama (ms). */
export const CLAIM_FIRST_RUN_DELAY_MS = 2 * 60_000;

/** Penjelasan status.rejectionReason dari YouTube — ubah kata-katanya di sini. */
export const REJECTION_LABELS: Record<string, string> = {
  claim: "Ditolak: klaim hak cipta (Content ID)",
  copyright: "Ditolak: pelanggaran hak cipta",
  duplicate: "Ditolak: video duplikat",
  inappropriate: "Ditolak: konten tidak pantas",
  legal: "Ditolak: alasan hukum",
  length: "Ditolak: durasi tidak valid",
  termsOfUse: "Ditolak: melanggar Ketentuan Layanan",
  trademark: "Ditolak: pelanggaran merek dagang",
  uploaderAccountClosed: "Ditolak: akun uploader ditutup",
  uploaderAccountSuspended: "Ditolak: akun uploader ditangguhkan",
};

/** Teks pesan Telegram — ganti kata-katanya di sini. */
export const CLAIM_TEXT = {
  header: "🚨 <b>Klaim / Pembatasan Terdeteksi</b>",
  headerHint:
    "YouTube menandai klip di bawah ini setelah tayang. Klip dari channel lain berisiko kena Content ID / copyright strike.\n" +
    "<i>Kamu yang memutuskan — tidak ada yang diubah tanpa tombolmu.</i>",
  deleted: "🗑 <b>Dihapus dari YouTube</b>",
  privated: "🔒 <b>Diubah ke private</b>",
  unlisted: "🔗 <b>Diubah ke unlisted</b>",
  ignored: "🙈 <b>Diabaikan</b>",
  confirmDelete: "⚠️ <b>Yakin hapus permanen?</b> Video akan hilang dari YouTube dan tidak bisa dikembalikan.",
  blacklisted: "⛔ <b>Channel sumber di-blacklist otomatis</b>",
};
