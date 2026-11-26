/**
 * 💰 COST TRACKER — KONFIGURASI & TABEL HARGA (FITUR BARU!)
 * =====================================================================
 * Melacak biaya OpenAI / Gemini / Groq / Whisper per job dan per user,
 * menampilkannya di /cost, laporan mingguan & dashboard, dan MENJEDA AI saat
 * batas biaya harian terlewati.
 *
 * 👉 SEMUANYA MUDAH DIGANTI lewat Railway Variables (tanpa menyentuh kode):
 *
 *   — Batas biaya —
 *   DAILY_BUDGET_USD=5              Batas biaya AI per HARI untuk SEMUA user (USD). 0 = tanpa batas.
 *   USER_DAILY_BUDGET_USD=0         Batas biaya AI per HARI per user (USD). 0 = tanpa batas.
 *                                   Berguna kalau bot dijual sebagai layanan.
 *   COST_BUDGET_MODE=pause          pause = AI dijeda saat batas terlewati (job baru ditolak, fitur AI
 *                                           lain di-skip memakai fallback non-AI)
 *                                   warn  = hanya notifikasi ke admin, AI tetap jalan
 *                                   off   = tanpa batas (biaya tetap dicatat)
 *   COST_BUDGET_NOTIFY_ADMIN=true   Kabari admin (ADMIN_TELEGRAM_IDS) saat mendekati / melewati batas.
 *   COST_BUDGET_WARN_PERCENT=80     Peringatan dini di N% batas harian (0 = tanpa peringatan dini).
 *
 *   — Pencatatan & laporan —
 *   COST_TRACKER_ENABLED=true       Saklar utama (false = tidak mencatat & tidak membatasi).
 *   COST_TIMEZONE=Asia/Jakarta      Zona waktu pergantian hari (default ikut ANALYTICS_TIMEZONE).
 *   COST_IDR_RATE=16000             Kurs USD→Rupiah untuk tampilan "≈ Rp" (0 = sembunyikan Rupiah).
 *   COST_WEEKLY_REPORT=true         Sertakan biaya AI di laporan mingguan Telegram.
 *   COST_REPORT_DAYS=7              Periode laporan mingguan (hari).
 *   COST_TOP_N=5                    Jumlah baris teratas (user / job / model) di laporan.
 *
 *   — Harga model —
 *   COST_PRICE_OVERRIDES='{"gemini-3.5-flash-lite":{"in":0.10,"out":0.40},"whisper-1":{"perHour":0.36}}'
 *       Timpa / tambah harga model tanpa deploy kode. `in`/`out` = USD per 1 JUTA token,
 *       `perHour` = USD per jam audio. Kunci dicocokkan dengan nama model (sebagian nama cukup).
 *
 * Harga bawaan ada di MODEL_PRICES di bawah — tinggal edit/tambah satu baris kalau
 * provider mengubah tarif atau kamu pindah model (GEMINI_MODEL, GROQ_MODEL, GROQ_WHISPER_MODEL).
 * Model yang tidak dikenal memakai HARGA_TIDAK_DIKENAL dan ditandai "estimasi" (≈) di laporan.
 */

import { getAnalyticsTimezone } from "@/lib/analytics-config";

function envBool(name: string, def: boolean): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  if (!v) return def;
  return ["1", "true", "yes", "on", "ya"].includes(v);
}

function envNum(name: string, def: number, min: number, max: number): number {
  const raw = (process.env[name] ?? "").trim().replace(",", ".");
  if (!raw) return def;
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

// ─── SAKLAR & BATAS ──────────────────────────────────────────────────────

export function isCostTrackerEnabled(): boolean {
  return envBool("COST_TRACKER_ENABLED", true);
}

/** Batas biaya harian semua user (USD). 0 = tanpa batas. Default 5. */
export function getDailyBudgetUsd(): number {
  return envNum("DAILY_BUDGET_USD", 5, 0, 1_000_000);
}

/** Batas biaya harian per user (USD). 0 = tanpa batas. */
export function getUserDailyBudgetUsd(): number {
  return envNum("USER_DAILY_BUDGET_USD", 0, 0, 1_000_000);
}

export type CostBudgetMode = "pause" | "warn" | "off";

export function getBudgetMode(): CostBudgetMode {
  const v = (process.env.COST_BUDGET_MODE || "pause").trim().toLowerCase();
  return v === "warn" || v === "off" ? v : "pause";
}

export function shouldNotifyAdminOnBudget(): boolean {
  return envBool("COST_BUDGET_NOTIFY_ADMIN", true);
}

export function getBudgetWarnPercent(): number {
  return envNum("COST_BUDGET_WARN_PERCENT", 80, 0, 99);
}

// ─── LAPORAN ─────────────────────────────────────────────────────────────

export function getCostTimezone(): string {
  return (process.env.COST_TIMEZONE || getAnalyticsTimezone() || "Asia/Jakarta").trim();
}

export function getIdrRate(): number {
  return envNum("COST_IDR_RATE", 16000, 0, 1_000_000);
}

export function isCostInWeeklyReport(): boolean {
  return envBool("COST_WEEKLY_REPORT", true);
}

export function getCostReportDays(): number {
  return Math.round(envNum("COST_REPORT_DAYS", 7, 1, 90));
}

export function getCostTopN(): number {
  return Math.round(envNum("COST_TOP_N", 5, 1, 20));
}

// ─── FITUR AI (label di laporan) ─────────────────────────────────────────

/** Kunci `feature` yang dicatat → label tampilan. Tambah baris baru kalau ada fitur AI baru. */
export const FEATURE_LABELS: Record<string, string> = {
  analysis: "🧠 Analisis momen viral",
  transcribe: "🎙️ Transkripsi (Whisper)",
  title_doctor: "🩺 Auto-Title Doctor",
  learning: "📈 Smart Learning",
  schedule: "🕐 Rekomendasi jam upload",
  other: "✨ Lainnya",
};

export function featureLabel(key: string): string {
  return FEATURE_LABELS[key] || `✨ ${key}`;
}

// ─── TABEL HARGA MODEL ───────────────────────────────────────────────────

export interface ModelPrice {
  /** Potongan nama model (huruf kecil). Dicocokkan dengan `includes`; yang paling PANJANG menang. */
  match: string;
  /** USD per 1 juta token input (model teks). */
  in?: number;
  /** USD per 1 juta token output (model teks). */
  out?: number;
  /** USD per jam audio (model transkripsi). */
  perHour?: number;
}

/**
 * Harga publik (USD) — periksa halaman pricing provider secara berkala, atau timpa lewat
 * COST_PRICE_OVERRIDES tanpa deploy ulang kode.
 *   OpenAI: platform.openai.com/docs/pricing · Gemini: ai.google.dev/pricing · Groq: groq.com/pricing
 */
export const MODEL_PRICES: ModelPrice[] = [
  // ── OpenAI (teks) ──
  { match: "gpt-4o-mini", in: 0.15, out: 0.6 },
  { match: "gpt-4o", in: 2.5, out: 10 },
  { match: "gpt-4.1-nano", in: 0.1, out: 0.4 },
  { match: "gpt-4.1-mini", in: 0.4, out: 1.6 },
  { match: "gpt-4.1", in: 2, out: 8 },
  { match: "gpt-5-nano", in: 0.05, out: 0.4 },
  { match: "gpt-5-mini", in: 0.25, out: 2 },
  { match: "gpt-5", in: 1.25, out: 10 },
  // ── OpenAI (transkripsi): whisper-1 = $0.006/menit ──
  { match: "whisper-1", perHour: 0.36 },
  { match: "gpt-4o-mini-transcribe", perHour: 0.18 },
  { match: "gpt-4o-transcribe", perHour: 0.36 },

  // ── Gemini ──
  { match: "gemini-2.5-pro", in: 1.25, out: 10 },
  { match: "gemini-2.5-flash-lite", in: 0.1, out: 0.4 },
  { match: "gemini-2.5-flash", in: 0.3, out: 2.5 },
  { match: "gemini-2.0-flash-lite", in: 0.075, out: 0.3 },
  { match: "gemini-2.0-flash", in: 0.1, out: 0.4 },
  { match: "gemini-1.5-flash", in: 0.075, out: 0.3 },
  { match: "gemini-1.5-pro", in: 1.25, out: 5 },
  // Keluarga model (untuk versi baru yang belum ada di daftar, mis. gemini-3.x-flash-lite)
  { match: "flash-lite", in: 0.1, out: 0.4 },
  { match: "flash", in: 0.3, out: 2.5 },
  { match: "gemini", in: 1.25, out: 10 },

  // ── Groq (teks) ──
  { match: "llama-3.3-70b", in: 0.59, out: 0.79 },
  { match: "llama-3.1-8b", in: 0.05, out: 0.08 },
  { match: "llama-4-scout", in: 0.11, out: 0.34 },
  { match: "llama-4-maverick", in: 0.2, out: 0.6 },
  { match: "gpt-oss-120b", in: 0.15, out: 0.75 },
  { match: "gpt-oss-20b", in: 0.075, out: 0.3 },
  { match: "qwen3-32b", in: 0.29, out: 0.59 },
  // ── Groq (transkripsi) ──
  { match: "whisper-large-v3-turbo", perHour: 0.04 },
  { match: "whisper-large-v3", perHour: 0.111 },
  { match: "distil-whisper", perHour: 0.02 },
];

/** Dipakai kalau nama model tidak ada di tabel (hasil ditandai estimasi). */
export const HARGA_TIDAK_DIKENAL = {
  text: { in: 0.3, out: 2.5 }, // setara gemini-2.5-flash
  audioPerHour: 0.36, // setara whisper-1
};

/** Groq menagih minimal 10 detik per request transkripsi. */
export const MIN_BILLED_AUDIO_SECONDS: Record<string, number> = { groq: 10 };

function parseOverrides(): ModelPrice[] {
  const raw = process.env.COST_PRICE_OVERRIDES?.trim();
  if (!raw) return [];
  try {
    const obj = JSON.parse(raw) as Record<string, { in?: number; out?: number; perHour?: number }>;
    const num = (v: unknown) => (v !== undefined && v !== null && Number.isFinite(Number(v)) ? Number(v) : undefined);
    return Object.entries(obj)
      .filter(([, v]) => v && typeof v === "object")
      .map(([k, v]) => ({ match: k.toLowerCase(), in: num(v.in), out: num(v.out), perHour: num(v.perHour) }));
  } catch {
    console.warn("[cost] COST_PRICE_OVERRIDES bukan JSON valid — diabaikan.");
    return [];
  }
}

export interface ResolvedPrice {
  in?: number;
  out?: number;
  perHour?: number;
  /** true = model tidak ada di tabel → harga perkiraan. */
  estimated: boolean;
  source: "override" | "default" | "unknown";
  matched: string | null;
}

/** Cari harga untuk sebuah model: override env > tabel bawaan; kecocokan terpanjang menang. */
export function resolvePrice(model: string, kind: "text" | "audio"): ResolvedPrice {
  const name = (model || "").toLowerCase();
  const overrides = parseOverrides().map((p) => ({ ...p, src: "override" as const }));
  const builtin = MODEL_PRICES.map((p) => ({ ...p, src: "default" as const }));
  const fits = [...overrides, ...builtin].filter((p) => {
    if (!name.includes(p.match)) return false;
    return kind === "audio" ? p.perHour !== undefined : p.in !== undefined || p.out !== undefined;
  });
  fits.sort((a, b) => b.match.length - a.match.length || (a.src === "override" ? -1 : 1));
  const best = fits[0];
  if (best) {
    return { in: best.in, out: best.out, perHour: best.perHour, estimated: false, source: best.src, matched: best.match };
  }
  return kind === "audio"
    ? { perHour: HARGA_TIDAK_DIKENAL.audioPerHour, estimated: true, source: "unknown", matched: null }
    : { in: HARGA_TIDAK_DIKENAL.text.in, out: HARGA_TIDAK_DIKENAL.text.out, estimated: true, source: "unknown", matched: null };
}

// ─── TEKS PESAN ──────────────────────────────────────────────────────────

export const COST_TEXT = {
  /** Pesan ke user saat job ditolak karena batas harian global tercapai. */
  globalPaused:
    "⏸️ <b>AI dijeda sementara</b> — batas biaya AI harian bot sudah tercapai.\nCoba lagi besok (reset otomatis tengah malam), atau hubungi admin.",
  /** Pesan ke user saat batas harian PER USER tercapai. */
  userPaused:
    "⏸️ <b>Batas pemakaian AI harianmu sudah tercapai.</b>\nCoba lagi besok (reset otomatis tengah malam), atau hubungi admin untuk menambah kuota.",
};
