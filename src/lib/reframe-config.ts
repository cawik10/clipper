/**
 * 🎯 AUTO-REFRAME SPEAKER TRACKING (FITUR BARU!)
 * =====================================================================
 * Semua konfigurasi dikontrol via environment variables (Railway
 * Variables), sama seperti fitur-fitur lain di video-config.ts — TIDAK
 * mengubah fitur/kode yang sudah ada sama sekali, murni tambahan.
 *
 * Apa fiturnya?
 * -------------
 * Ketika `ASPECT_RATIO_MODE=crop`, bot biasanya memakai "center crop"
 * statis (selalu memotong persis di tengah frame). Dengan Auto-Reframe
 * aktif, bot akan mendeteksi wajah/pembicara aktif pada video lalu
 * menggeser kotak crop 9:16 mengikuti posisi pembicara dari waktu ke
 * waktu (dengan smoothing supaya tidak "patah-patah"/jitter), sehingga
 * pembicara tetap berada di dalam frame vertikal walau dia bergerak atau
 * posisinya tidak persis di tengah video sumber.
 *
 * Kalau deteksi wajah gagal (video gelap, tidak ada wajah terdeteksi,
 * backend deteksi error, dsb) bot otomatis fallback ke mode crop statis
 * seperti biasa — proses TIDAK PERNAH gagal gara-gara fitur ini.
 *
 * =====================================================================
 * CARA MENGAKTIFKAN (Railway Variables)
 * =====================================================================
 * ASPECT_RATIO_MODE=crop          ← WAJIB: fitur ini hanya berlaku di mode "crop"
 * AUTO_REFRAME_ENABLED=true       ← Nyalakan Auto-Reframe (default: false)
 *
 * =====================================================================
 * KONFIGURASI LANJUTAN (opsional, semua punya default aman)
 * =====================================================================
 * AUTO_REFRAME_BACKEND=opencv     ← Backend deteksi wajah. Lihat
 *                                    src/lib/speaker-tracker.ts untuk
 *                                    cara MENGGANTI backend (mis. ke
 *                                    model deteksi lain yang lebih
 *                                    akurat) tanpa menyentuh file lain.
 *                                    Pilihan: opencv | none
 * AUTO_REFRAME_SAMPLE_FPS=2        ← Berapa kali per detik frame di-scan
 *                                    untuk deteksi wajah (default: 2)
 * AUTO_REFRAME_SMOOTHING=0.8       ← 0.0-0.95, makin besar makin halus
 *                                    tapi makin lambat "mengejar" gerakan
 *                                    pembicara (default: 0.8)
 * AUTO_REFRAME_PADDING=0.35        ← Ruang ekstra di sekitar wajah supaya
 *                                    tidak terlalu mepet (default: 0.35
 *                                    = 35% dari lebar wajah)
 * AUTO_REFRAME_MIN_FACE_SIZE=0.03  ← Abaikan wajah yang terlalu kecil
 *                                    (rasio terhadap lebar frame, default
 *                                    0.03 = 3%)
 * AUTO_REFRAME_MAX_FACES=1         ← Jumlah wajah yang dipertimbangkan
 *                                    sebagai "pembicara aktif" (default:
 *                                    1 = wajah paling dominan/terbesar)
 * AUTO_REFRAME_FALLBACK_MODE=crop  ← Mode yang dipakai kalau deteksi
 *                                    gagal/tidak ada wajah (default: crop,
 *                                    tidak boleh "reframe"/dirinya sendiri)
 * AUTO_REFRAME_TIMEOUT_MS=45000    ← Batas waktu proses deteksi per klip
 *                                    sebelum fallback otomatis (default:
 *                                    45 detik)
 */
import type { AspectRatioMode } from "@/lib/video-config";

export type AutoReframeBackend = "opencv" | "none";

export interface AutoReframeConfig {
  enabled: boolean;
  backend: AutoReframeBackend;
  sampleFps: number;
  smoothing: number;
  padding: number;
  minFaceSize: number;
  maxFaces: number;
  fallbackMode: Exclude<AspectRatioMode, never>;
  timeoutMs: number;
}

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw.trim() === "") return fallback;
  return raw.toLowerCase().trim() === "true";
}

function parseNumber(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (!raw) return fallback;
  const parsed = parseFloat(raw.trim());
  if (isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

/** Satu-satunya tempat membaca env var untuk fitur ini — mudah diganti/diaudit. */
export function getAutoReframeConfig(): AutoReframeConfig {
  const enabled = parseBool(process.env.AUTO_REFRAME_ENABLED, false);

  const rawBackend = (process.env.AUTO_REFRAME_BACKEND || "opencv").toLowerCase().trim();
  const backend: AutoReframeBackend = rawBackend === "none" ? "none" : "opencv";

  const sampleFps = parseNumber(process.env.AUTO_REFRAME_SAMPLE_FPS, 2, 0.5, 10);
  const smoothing = parseNumber(process.env.AUTO_REFRAME_SMOOTHING, 0.8, 0, 0.95);
  const padding = parseNumber(process.env.AUTO_REFRAME_PADDING, 0.35, 0, 1.5);
  const minFaceSize = parseNumber(process.env.AUTO_REFRAME_MIN_FACE_SIZE, 0.03, 0.005, 0.5);
  const maxFaces = Math.round(parseNumber(process.env.AUTO_REFRAME_MAX_FACES, 1, 1, 5));
  const timeoutMs = Math.round(parseNumber(process.env.AUTO_REFRAME_TIMEOUT_MS, 45000, 5000, 180000));

  const rawFallback = (process.env.AUTO_REFRAME_FALLBACK_MODE || "crop").toLowerCase().trim();
  const validFallbacks = ["blur", "crop", "pad", "stretch", "none"];
  const fallbackMode = (
    validFallbacks.includes(rawFallback) ? rawFallback : "crop"
  ) as AutoReframeConfig["fallbackMode"];

  return { enabled, backend, sampleFps, smoothing, padding, minFaceSize, maxFaces, fallbackMode, timeoutMs };
}

export function getAutoReframeBackendLabel(backend: AutoReframeBackend): string {
  const labels: Record<AutoReframeBackend, string> = {
    opencv: "OpenCV Haar Cascade (default, ringan, tanpa GPU)",
    none: "Nonaktif (selalu fallback ke crop statis)",
  };
  return labels[backend] || backend;
}
