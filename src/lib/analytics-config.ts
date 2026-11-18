/**
 * 📈 AI ANALYTICS & FEEDBACK LOOP — KONFIGURASI (FITUR BARU!)
 * =====================================================================
 * "Bot yang makin lama makin pintar": bot melacak performa tiap klip yang
 * sudah diupload ke YouTube (views/likes/comments), mengirim laporan
 * mingguan ke Telegram, lalu AI mempelajari klip yang sukses dan otomatis
 * menyesuaikan arahan niche (DEFAULT_NICHE_PROMPT) untuk pembuatan klip
 * berikutnya.
 *
 * 👉 SEMUANYA DI FILE INI MUDAH DIGANTI — cukup ubah Railway Variables
 *    (tanpa menyentuh kode lain), atau edit konstanta di bawah ini:
 *
 *   ANALYTICS_ENABLED=true                    // matikan/nyalakan seluruh fitur
 *   ANALYTICS_WEEKLY_REPORT_ENABLED=true      // laporan mingguan otomatis ke Telegram
 *   ANALYTICS_REPORT_DAY=monday               // sunday..saturday (atau 0-6)
 *   ANALYTICS_REPORT_HOUR=8                   // jam kirim laporan (0-23, zona waktu di bawah)
 *   ANALYTICS_TIMEZONE=Asia/Jakarta           // default ikut SCHEDULER_TIMEZONE
 *   ANALYTICS_WORKER_INTERVAL_MINUTES=15      // seberapa sering worker "bangun"
 *   ANALYTICS_SYNC_INTERVAL_MINUTES=180       // jeda tarik ulang views dari YouTube
 *   ANALYTICS_TRACK_DAYS=90                   // klip diupload > N hari lalu tidak dilacak lagi
 *   ANALYTICS_TOP_CLIPS=5                     // jumlah klip teratas di laporan
 *   ANALYTICS_TOP_NICHES=5                    // jumlah niche teratas di laporan
 *
 *   ANALYTICS_LEARNING_ENABLED=true           // Smart Learning Loop
 *   ANALYTICS_LEARNING_AUTO_APPLY=true        // false = hasil belajar harus di-/analytics apply dulu
 *   ANALYTICS_LEARNING_MIN_CLIPS=5            // minimal klip ber-data sebelum AI mulai belajar
 *   ANALYTICS_LEARNING_TOP_PERCENT=30         // % klip teratas yang dianggap "sukses"
 *   ANALYTICS_LEARNING_MIN_VIEWS=10           // klip sukses harus punya views minimal ini
 *   ANALYTICS_LEARNING_INTERVAL_DAYS=7        // jeda minimal antar proses belajar otomatis
 *   ANALYTICS_LEARNED_PROMPT_MAX_LENGTH=300   // batas panjang prompt hasil belajar
 *
 *   YOUTUBE_API_KEY=...                       // opsional: fallback baca views video public/unlisted
 *   ANALYTICS_REQUEST_READONLY_SCOPE=true     // minta izin youtube.readonly saat /connect
 *                                             // (dibutuhkan untuk membaca views video private)
 *
 * 🩺 AUTO-TITLE DOCTOR (bagian dari loop ini): klip tayang > 24 jam dengan views
 *    rendah otomatis dapat judul & hashtag baru dari AI. Semua env-nya ada di
 *    src/lib/auto-title-doctor-config.ts (saklar: ANALYTICS_AUTO_RETITLE_LOW_VIEWS=true).
 *
 * Preset niche & kata kunci klasifikasi ada di `NICHE_KEYWORDS` di bawah —
 * niche baru yang ditambahkan ke NICHE_PRESETS (src/lib/niche-prompt.ts)
 * otomatis ikut dilacak; tambahkan kata kunci agar klasifikasinya lebih tajam.
 */

import { MAX_NICHE_PROMPT_LENGTH } from "@/lib/niche-prompt";
import { getSchedulerTimezone } from "@/lib/scheduler-config";

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

// ─── FLAG UTAMA ──────────────────────────────────────────────────────────

export function isAnalyticsEnabled(): boolean {
  return envBool("ANALYTICS_ENABLED", true);
}

export function isWeeklyReportEnabled(): boolean {
  return envBool("ANALYTICS_WEEKLY_REPORT_ENABLED", true);
}

export function isLearningEnabled(): boolean {
  return envBool("ANALYTICS_LEARNING_ENABLED", true);
}

export function isLearningAutoApply(): boolean {
  return envBool("ANALYTICS_LEARNING_AUTO_APPLY", true);
}

export function shouldRequestReadonlyScope(): boolean {
  return envBool("ANALYTICS_REQUEST_READONLY_SCOPE", true);
}

// ─── JADWAL & WORKER ─────────────────────────────────────────────────────

export const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
export const WEEKDAY_LABELS_ID = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

/** Hari kirim laporan mingguan sebagai angka 0 (Minggu) – 6 (Sabtu). Default: Senin. */
export function getReportDay(): number {
  const raw = (process.env.ANALYTICS_REPORT_DAY || "monday").trim().toLowerCase();
  const asNum = parseInt(raw, 10);
  if (!isNaN(asNum) && asNum >= 0 && asNum <= 6) return asNum;
  const idx = WEEKDAYS.findIndex((d) => d === raw || d.slice(0, 3) === raw.slice(0, 3));
  if (idx >= 0) return idx;
  const idIdx = WEEKDAY_LABELS_ID.findIndex((d) => d.toLowerCase() === raw);
  return idIdx >= 0 ? idIdx : 1;
}

export function getReportHour(): number {
  return envInt("ANALYTICS_REPORT_HOUR", 8, 0, 23);
}

export function getAnalyticsTimezone(): string {
  return (process.env.ANALYTICS_TIMEZONE || getSchedulerTimezone() || "Asia/Jakarta").trim();
}

export function getWorkerIntervalMs(): number {
  return envInt("ANALYTICS_WORKER_INTERVAL_MINUTES", 15, 1, 1440) * 60_000;
}

export function getSyncIntervalMinutes(): number {
  return envInt("ANALYTICS_SYNC_INTERVAL_MINUTES", 180, 5, 10080);
}

export function getTrackDays(): number {
  return envInt("ANALYTICS_TRACK_DAYS", 90, 7, 3650);
}

export function getTopClipsCount(): number {
  return envInt("ANALYTICS_TOP_CLIPS", 5, 1, 10);
}

export function getTopNichesCount(): number {
  return envInt("ANALYTICS_TOP_NICHES", 5, 1, 10);
}

// ─── SMART LEARNING LOOP ─────────────────────────────────────────────────

export function getLearningMinClips(): number {
  return envInt("ANALYTICS_LEARNING_MIN_CLIPS", 5, 2, 200);
}

export function getLearningTopPercent(): number {
  return envInt("ANALYTICS_LEARNING_TOP_PERCENT", 30, 5, 80);
}

export function getLearningMinViews(): number {
  return envInt("ANALYTICS_LEARNING_MIN_VIEWS", 10, 0, 10_000_000);
}

export function getLearningIntervalDays(): number {
  return envInt("ANALYTICS_LEARNING_INTERVAL_DAYS", 7, 0, 365);
}

export function getLearnedPromptMaxLength(): number {
  return envInt("ANALYTICS_LEARNED_PROMPT_MAX_LENGTH", MAX_NICHE_PROMPT_LENGTH, 60, MAX_NICHE_PROMPT_LENGTH);
}

// ─── KLASIFIKASI NICHE ───────────────────────────────────────────────────

/** Label untuk klip yang tidak cocok dengan niche mana pun. */
export const NICHE_UNKNOWN_LABEL = "Umum";

/**
 * Kata kunci (huruf kecil) untuk mengenali niche sebuah klip dari judul,
 * deskripsi, tag, alasan AI, dan hook-nya. Key HARUS sama dengan `label`
 * di NICHE_PRESETS (src/lib/niche-prompt.ts). Tinggal tambah/ubah kata.
 */
export const NICHE_KEYWORDS: Record<string, string[]> = {
  "Momen Lucu": ["lucu", "kocak", "ngakak", "komedi", "humor", "lawak", "receh", "funny", "comedy", "joke", "prank", "😂", "🤣"],
  "Insight Bisnis": ["bisnis", "usaha", "uang", "cuan", "profit", "investasi", "saham", "finansial", "strategi", "marketing", "startup", "money", "business", "income", "omzet", "modal"],
  "Drama & Konflik": ["drama", "konflik", "debat", "ribut", "kontroversi", "kontroversial", "marah", "skandal", "bongkar", "panas", "gibah", "clash", "fight"],
  "Edukasi & Tips": ["tips", "cara", "tutorial", "belajar", "edukasi", "fakta", "penjelasan", "rahasia", "panduan", "how to", "guide", "learn", "trik"],
  Motivasi: ["motivasi", "semangat", "inspirasi", "inspiratif", "sukses", "mindset", "bangkit", "pantang menyerah", "mimpi", "motivation", "inspiring", "perjuangan"],
  "Plot Twist": ["plot twist", "twist", "mengejutkan", "kejutan", "tak terduga", "tidak disangka", "reveal", "shock", "terungkap"],
};

/** Jumlah hit kata kunci minimal agar sebuah klip dianggap masuk niche tertentu. */
export const NICHE_MIN_KEYWORD_HITS = 1;
