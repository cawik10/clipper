/**
 * 🛠️ ADMIN PANEL TELEGRAM — KONFIGURASI (FITUR BARU!)
 * =====================================================================
 * Semua pengaturan fitur Admin Panel ada di file ini + Railway Variables.
 * Kode lain TIDAK perlu disentuh untuk mengubah perilaku/teks admin.
 *
 * Railway Variables (semuanya opsional kecuali ADMIN_TELEGRAM_IDS):
 *
 *   ADMIN_TELEGRAM_IDS=123,456        ID Telegram admin (pisah koma / spasi).
 *                                     Cek ID kamu lewat @userinfobot.
 *                                     Kosong = fitur admin nonaktif total.
 *
 *   — Kuota —
 *   ADMIN_DEFAULT_QUOTA=0             Kuota job default per user (0 = tanpa batas).
 *   ADMIN_QUOTA_PERIOD=day            day | month — periode reset kuota.
 *   ADMIN_QUOTA_TIMEZONE=...          Zona waktu reset (default ikut SCHEDULER_TIMEZONE / Asia/Jakarta).
 *   ADMIN_EXEMPT_QUOTA=true           Admin bebas dari kuota.
 *
 *   — Notifikasi error otomatis ke admin —
 *   ADMIN_ERROR_NOTIFY=true           Saklar notifikasi error.
 *   ADMIN_ERROR_DEDUPE_SECONDS=300    Error identik dalam N detik hanya dikirim sekali.
 *   ADMIN_ERROR_MAX_PER_MINUTE=10     Batas pesan error per menit (anti-banjir).
 *   ADMIN_ERROR_MAX_CHARS=1200        Batas panjang detail error.
 *   ADMIN_ERROR_IGNORE=...            Kata kunci tambahan yang diabaikan (pisah koma).
 *
 *   — Broadcast —
 *   BROADCAST_CONFIRM=true            Minta konfirmasi (tombol) sebelum kirim.
 *   BROADCAST_DELAY_MS=50             Jeda antar pesan (Telegram maks ±30 pesan/detik).
 *   BROADCAST_INCLUDE_BANNED=false    Ikut kirim ke user yang diban?
 *   BROADCAST_HEADER=📢 Pengumuman    Judul di atas setiap broadcast (kosongkan = tanpa judul).
 *
 *   — Lain-lain —
 *   ADMIN_USERS_PER_PAGE=8            Jumlah user per halaman di /admin.
 *   ADMIN_NOTIFY_USER_ON_BAN=true     Beri tahu user saat di-ban / di-unban.
 *
 * Teks pesan yang dilihat user (diban / kuota habis) ada di `ADMIN_TEXT` di bawah.
 */

function envBool(name: string, def: boolean): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  if (!v) return def;
  return ["1", "true", "yes", "on", "ya"].includes(v);
}

function envInt(name: string, def: number, min: number, max: number): number {
  const n = parseInt(process.env[name] ?? "", 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

function envList(name: string): string[] {
  return (process.env[name] || "")
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ─── ADMIN IDS ─────────────────────────────────────────────────────────
export function getAdminIds(): string[] {
  return Array.from(new Set(envList("ADMIN_TELEGRAM_IDS").filter((s) => /^-?\d+$/.test(s))));
}

export function isAdminEnabled(): boolean {
  return getAdminIds().length > 0;
}

export function isAdmin(userId: string | number | undefined | null): boolean {
  if (userId === undefined || userId === null) return false;
  return getAdminIds().includes(String(userId));
}

// ─── KUOTA ─────────────────────────────────────────────────────────────
export type QuotaPeriod = "day" | "month";

export function getDefaultQuota(): number {
  return envInt("ADMIN_DEFAULT_QUOTA", 0, 0, 1_000_000);
}

export function getQuotaPeriod(): QuotaPeriod {
  const v = (process.env.ADMIN_QUOTA_PERIOD || "day").trim().toLowerCase();
  return v === "month" ? "month" : "day";
}

export function getQuotaPeriodLabel(): string {
  return getQuotaPeriod() === "month" ? "bulan" : "hari";
}

export function getAdminTimezone(): string {
  return (
    process.env.ADMIN_QUOTA_TIMEZONE?.trim() ||
    process.env.SCHEDULER_TIMEZONE?.trim() ||
    "Asia/Jakarta"
  );
}

export function isAdminExemptFromQuota(): boolean {
  return envBool("ADMIN_EXEMPT_QUOTA", true);
}

// ─── ERROR NOTIFY ──────────────────────────────────────────────────────
/** Error yang sifatnya "normal" di Telegram — tidak perlu mengganggu admin. */
const DEFAULT_ERROR_IGNORE = [
  "message is not modified",
  "bot was blocked by the user",
  "user is deactivated",
  "chat not found",
  "query is too old",
  "query id is invalid",
  "message to edit not found",
  "message can't be edited",
];

export function getErrorConfig() {
  return {
    enabled: envBool("ADMIN_ERROR_NOTIFY", true),
    dedupeSeconds: envInt("ADMIN_ERROR_DEDUPE_SECONDS", 300, 0, 86_400),
    maxPerMinute: envInt("ADMIN_ERROR_MAX_PER_MINUTE", 10, 1, 120),
    maxChars: envInt("ADMIN_ERROR_MAX_CHARS", 1200, 200, 3000),
    ignore: [...DEFAULT_ERROR_IGNORE, ...envList("ADMIN_ERROR_IGNORE").map((s) => s.toLowerCase())],
  };
}

// ─── BROADCAST ─────────────────────────────────────────────────────────
export function getBroadcastConfig() {
  return {
    confirm: envBool("BROADCAST_CONFIRM", true),
    delayMs: envInt("BROADCAST_DELAY_MS", 50, 0, 5000),
    includeBanned: envBool("BROADCAST_INCLUDE_BANNED", false),
    header: process.env.BROADCAST_HEADER !== undefined ? process.env.BROADCAST_HEADER.trim() : "📢 Pengumuman",
    maxChars: 4000,
  };
}

// ─── UI ────────────────────────────────────────────────────────────────
export function getUsersPerPage(): number {
  return envInt("ADMIN_USERS_PER_PAGE", 8, 3, 20);
}

export function shouldNotifyUserOnBan(): boolean {
  return envBool("ADMIN_NOTIFY_USER_ON_BAN", true);
}

/** Teks yang dilihat USER BIASA (bukan admin). Ubah sesuka hati. */
export const ADMIN_TEXT = {
  notAdmin: "⛔ Perintah ini hanya untuk admin.",
  banned: "🚫 Akun kamu diblokir dari bot ini oleh admin.",
  bannedWithReason: (reason: string) =>
    `🚫 Akun kamu diblokir dari bot ini oleh admin.\nAlasan: ${reason}`,
  unbanned: "✅ Akun kamu sudah dibuka blokirnya. Silakan gunakan bot lagi.",
  quotaExceeded: (used: number, limit: number, periodLabel: string) =>
    `⚠️ Kuota kamu habis (${used}/${limit} video per ${periodLabel}).\n` +
    `Coba lagi setelah kuota di-reset, atau hubungi admin untuk menambah kuota.`,
};
