/**
 * 🩺 AUTO-TITLE DOCTOR — KONFIGURASI (FITUR BARU! bagian dari AI Analytics Loop)
 * =====================================================================
 * Setelah worker analytics menarik views terbaru (default tiap 180 menit),
 * klip yang sudah tayang > 24 jam tapi views-nya masih rendah akan
 * "didiagnosis": AI membuat Judul + Hashtag baru yang lebih clickbait, lalu
 * judul video di YouTube di-update otomatis lewat API `videos.update`.
 *
 * 👉 SEMUANYA MUDAH DIGANTI lewat Railway Variables (tanpa menyentuh kode):
 *
 *   ANALYTICS_AUTO_RETITLE_LOW_VIEWS=true      // SAKLAR UTAMA (default: false / mati)
 *   ANALYTICS_RETITLE_VIEWS_THRESHOLD=50       // angka, atau "avg" = di bawah rata-rata views klip user
 *   ANALYTICS_RETITLE_MIN_AGE_HOURS=24         // klip baru diperiksa setelah tayang N jam
 *   ANALYTICS_RETITLE_MAX_AGE_DAYS=14          // klip lebih tua dari N hari tidak diutak-atik lagi
 *   ANALYTICS_RETITLE_MAX_PER_CLIP=1           // maks berapa kali satu klip boleh diganti judulnya
 *   ANALYTICS_RETITLE_COOLDOWN_HOURS=72        // jeda antar-penggantian judul pada klip yang sama
 *   ANALYTICS_RETITLE_MAX_PER_CYCLE=5          // batas klip per user per siklus (hemat kuota YouTube API)
 *   ANALYTICS_RETITLE_PRIVACY=public           // status video yang boleh diganti: public,unlisted,private
 *   ANALYTICS_RETITLE_HASHTAGS=4               // jumlah hashtag baru (0 = jangan ubah hashtag)
 *   ANALYTICS_RETITLE_RETRY_HOURS=12           // jeda coba ulang kalau AI / YouTube gagal
 *   ANALYTICS_RETITLE_NOTIFY=true              // kirim notifikasi Telegram setiap judul diganti
 *   ANALYTICS_RETITLE_DRY_RUN=false            // true = AI buat judul & kirim notifikasi, tapi YouTube TIDAK diubah
 *   ANALYTICS_RETITLE_STYLE="..."              // opsional: tambahan gaya penulisan untuk AI
 *   ANALYTICS_RETITLE_REQUEST_SCOPE=true       // minta izin edit video (youtube.force-ssl) saat /connect
 *
 * 🔑 PENTING: `videos.update` butuh izin edit YouTube (scope `youtube.force-ssl`),
 *    sedangkan izin lama hanya `youtube.upload`. Akun yang sudah terhubung
 *    cukup kirim /connect sekali lagi setelah fitur ini dinyalakan.
 *
 * 💡 Video yang masih PRIVATE tidak diganti judulnya (views 0 karena memang
 *    tidak ada yang bisa melihat) — default hanya video `public`.
 *
 * Prompt & batas teks ada di konstanta paling bawah file ini.
 */

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return !/^(false|0|off|no|nonaktif)$/i.test(raw.trim());
}

function envInt(name: string, fallback: number, min: number, max: number): number {
  const n = parseInt(process.env[name] || "", 10);
  if (!isNaN(n) && n >= min && n <= max) return n;
  return fallback;
}

// ─── FLAG ────────────────────────────────────────────────────────────────

/** Saklar utama Auto-Title Doctor. Default MATI (opt-in) karena mengubah video di YouTube. */
export function isAutoRetitleEnabled(): boolean {
  const raw = process.env.ANALYTICS_AUTO_RETITLE_LOW_VIEWS;
  if (raw === undefined || raw === "") return false;
  return /^(true|1|on|yes|ya|aktif)$/i.test(raw.trim());
}

export function isRetitleDryRun(): boolean {
  return envBool("ANALYTICS_RETITLE_DRY_RUN", false);
}

export function isRetitleNotifyEnabled(): boolean {
  return envBool("ANALYTICS_RETITLE_NOTIFY", true);
}

/** Minta scope `youtube.force-ssl` saat /connect (hanya kalau fitur menyala). */
export function shouldRequestRetitleScope(): boolean {
  return isAutoRetitleEnabled() && envBool("ANALYTICS_RETITLE_REQUEST_SCOPE", true);
}

// ─── KRITERIA ────────────────────────────────────────────────────────────

/** Nilai default ambang views ketika env tidak diisi. */
export const DEFAULT_RETITLE_VIEWS_THRESHOLD = 50;
/** Jumlah klip minimal agar mode "avg" dipakai (kalau kurang, pakai angka default). */
export const RETITLE_AVG_MIN_CLIPS = 3;

export type RetitleThreshold = { mode: "fixed"; value: number } | { mode: "avg" };

export function getRetitleThresholdSetting(): RetitleThreshold {
  const raw = (process.env.ANALYTICS_RETITLE_VIEWS_THRESHOLD || "").trim().toLowerCase();
  if (raw === "avg" || raw === "average" || raw === "rata-rata") return { mode: "avg" };
  const n = parseInt(raw, 10);
  if (!isNaN(n) && n >= 1 && n <= 100_000_000) return { mode: "fixed", value: n };
  return { mode: "fixed", value: DEFAULT_RETITLE_VIEWS_THRESHOLD };
}

export function describeRetitleThreshold(): string {
  const t = getRetitleThresholdSetting();
  return t.mode === "avg" ? "< rata-rata views klip" : `< ${t.value.toLocaleString("id-ID")} views`;
}

export function getRetitleMinAgeHours(): number {
  return envInt("ANALYTICS_RETITLE_MIN_AGE_HOURS", 24, 1, 24 * 90);
}

export function getRetitleMaxAgeDays(): number {
  return envInt("ANALYTICS_RETITLE_MAX_AGE_DAYS", 14, 1, 3650);
}

export function getRetitleMaxPerClip(): number {
  return envInt("ANALYTICS_RETITLE_MAX_PER_CLIP", 1, 1, 10);
}

export function getRetitleCooldownHours(): number {
  return envInt("ANALYTICS_RETITLE_COOLDOWN_HOURS", 72, 1, 24 * 90);
}

export function getRetitleMaxPerCycle(): number {
  return envInt("ANALYTICS_RETITLE_MAX_PER_CYCLE", 5, 1, 50);
}

export function getRetitleRetryHours(): number {
  return envInt("ANALYTICS_RETITLE_RETRY_HOURS", 12, 1, 24 * 30);
}

/** Status privasi video yang boleh diganti judulnya. */
export function getRetitleAllowedPrivacy(): string[] {
  const list = (process.env.ANALYTICS_RETITLE_PRIVACY || "public")
    .toLowerCase()
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s === "public" || s === "unlisted" || s === "private");
  return list.length ? list : ["public"];
}

export function getRetitleHashtagCount(): number {
  return envInt("ANALYTICS_RETITLE_HASHTAGS", 4, 0, 10);
}

export function getRetitleExtraStyle(): string {
  return (process.env.ANALYTICS_RETITLE_STYLE || "").replace(/\s+/g, " ").trim().slice(0, 300);
}

// ─── KONSTANTA (ubah di sini kalau perlu) ────────────────────────────────

/** Batas judul YouTube. */
export const RETITLE_MAX_TITLE_LENGTH = 100;
/** Batas total karakter tag YouTube (resmi 500; disisakan margin). */
export const RETITLE_MAX_TAGS_CHARS = 450;
/** Jeda coba ulang untuk error izin (scope belum cukup) — supaya user tidak dispam notifikasi. */
export const RETITLE_PERMISSION_RETRY_HOURS = 72;
/** Scope Google yang cukup untuk `videos.update`. */
export const RETITLE_REQUIRED_SCOPES = [
  "https://www.googleapis.com/auth/youtube.force-ssl",
  "https://www.googleapis.com/auth/youtube",
];
export const RETITLE_SCOPE = "https://www.googleapis.com/auth/youtube.force-ssl";

/** Prompt sistem untuk AI — ganti gaya/aturan penulisan judul di sini. */
export const RETITLE_SYSTEM_PROMPT =
  "Kamu adalah 'Title Doctor', ahli judul YouTube Shorts yang membuat orang berhenti scroll. " +
  "Tugasmu: menulis ulang judul & hashtag untuk klip yang views-nya rendah agar CTR naik. " +
  "Aturan: (1) judul maksimal 90 karakter, (2) pakai bahasa yang SAMA dengan judul lama, " +
  "(3) clickbait yang memancing rasa penasaran (angka, pertanyaan, kontras, 'ternyata', 'jangan sampai', dst.) " +
  "tetapi JANGAN berbohong, JANGAN mengarang fakta yang tidak ada di konteks klip, " +
  "(4) maksimal 1 emoji, tanpa ALL CAPS berlebihan, (5) harus berbeda jelas dari judul-judul sebelumnya, " +
  "(6) hashtag relevan, huruf kecil, tanpa spasi, diawali '#'. " +
  'Balas HANYA dengan satu objek JSON valid: {"title": "...", "hashtags": ["#a", "#b"]}';
