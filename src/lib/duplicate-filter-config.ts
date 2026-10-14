/**
 * 🧹 DUPLICATE / REPETITIVE CLIP FILTER — CONFIGURATION
 * =====================================================================
 * Semua konfigurasi fitur ini dikontrol via environment variables, sama
 * seperti fitur lain (MAX_CLIPS, WATERMARK_*, ZOOM_EFFECT_*, dst).
 * Mudah diubah dari Railway Dashboard → Variables, TANPA perlu redeploy
 * atau mengubah kode — restart service saja sudah cukup.
 *
 * =====================================================================
 * DUPLICATE_FILTER_ENABLED (default: true)
 * =====================================================================
 * DUPLICATE_FILTER_ENABLED=true   ← saklar utama fitur. Set "false" untuk
 *                                    menonaktifkan total (perilaku lama).
 *
 * =====================================================================
 * DUPLICATE_FILTER_SCOPE (default: source)
 * =====================================================================
 * Menentukan klip lama mana saja yang dipakai sebagai pembanding:
 *   source  ← HANYA bandingkan dengan klip dari source video YANG SAMA
 *              (video/link persis sama yang diproses ulang). REKOMENDASI.
 *   user    ← bandingkan dengan semua klip milik user Telegram yang sama,
 *              dari source video manapun (berguna kalau user sering
 *              re-share video yang sama lewat link berbeda / reupload).
 *   global  ← bandingkan dengan seluruh klip di database (semua user).
 *
 * =====================================================================
 * DUPLICATE_FILTER_TEXT_THRESHOLD (default: 0.72, rentang 0.0-1.0)
 * =====================================================================
 * Seberapa mirip judul+deskripsi+alasan AI dari klip baru dengan klip
 * lama (dihitung dengan Jaccard similarity atas shingle kata) sebelum
 * dianggap "konten duplikat/repetitif". Makin kecil nilainya, makin
 * agresif filter-nya (lebih banyak klip yang di-skip).
 *
 * =====================================================================
 * DUPLICATE_FILTER_TIME_OVERLAP_THRESHOLD (default: 0.6, rentang 0.0-1.0)
 * =====================================================================
 * Khusus untuk pembanding dari source video YANG SAMA: rasio overlap
 * rentang waktu (start-end) klip baru vs klip lama. Dipakai bersamaan
 * dengan kemiripan teks — klip dianggap duplikat kalau teksnya mirip
 * ATAU rentang waktunya tumpang-tindih signifikan dengan klip lama.
 *
 * =====================================================================
 * DUPLICATE_FILTER_LOOKBACK_DAYS (default: 30, 0 = tanpa batas waktu)
 * =====================================================================
 * Hanya bandingkan dengan klip yang dibuat dalam N hari terakhir. Berguna
 * supaya video yang memang sengaja di-reupload bertahun-tahun kemudian
 * (konten berbeda/update) tidak ikut ter-filter selamanya.
 *
 * =====================================================================
 * DUPLICATE_FILTER_MAX_LOOKUP (default: 300)
 * =====================================================================
 * Batas jumlah sidik jari klip lama yang diambil untuk dibandingkan
 * (pengaman performa query, terutama untuk scope=global).
 */

export type DuplicateFilterScope = "source" | "user" | "global";

export interface DuplicateFilterConfig {
  enabled: boolean;
  scope: DuplicateFilterScope;
  textThreshold: number;
  timeOverlapThreshold: number;
  lookbackDays: number;
  maxLookup: number;
}

function envBool(name: string, def: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return def;
  return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
}

function envFloat(name: string, def: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw) return def;
  const parsed = parseFloat(raw.trim());
  if (isNaN(parsed)) return def;
  return Math.min(max, Math.max(min, parsed));
}

function envInt(name: string, def: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw) return def;
  const parsed = parseInt(raw.trim(), 10);
  if (isNaN(parsed)) return def;
  return Math.min(max, Math.max(min, parsed));
}

export function getDuplicateFilterConfig(): DuplicateFilterConfig {
  const enabled = envBool("DUPLICATE_FILTER_ENABLED", true);
  const rawScope = (process.env.DUPLICATE_FILTER_SCOPE || "source").trim().toLowerCase();
  const validScopes: DuplicateFilterScope[] = ["source", "user", "global"];
  const scope: DuplicateFilterScope = validScopes.includes(rawScope as DuplicateFilterScope)
    ? (rawScope as DuplicateFilterScope)
    : "source";
  const textThreshold = envFloat("DUPLICATE_FILTER_TEXT_THRESHOLD", 0.72, 0, 1);
  const timeOverlapThreshold = envFloat("DUPLICATE_FILTER_TIME_OVERLAP_THRESHOLD", 0.6, 0, 1);
  const lookbackDays = envInt("DUPLICATE_FILTER_LOOKBACK_DAYS", 30, 0, 3650);
  const maxLookup = envInt("DUPLICATE_FILTER_MAX_LOOKUP", 300, 10, 2000);
  return { enabled, scope, textThreshold, timeOverlapThreshold, lookbackDays, maxLookup };
}

export function getDuplicateFilterScopeLabel(scope: DuplicateFilterScope): string {
  const labels: Record<DuplicateFilterScope, string> = {
    source: "Video Sumber yang Sama",
    user: "Semua Video Milik User",
    global: "Seluruh Database (Semua User)",
  };
  return labels[scope] || scope;
}
