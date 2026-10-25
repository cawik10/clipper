/**
 * 🎯 AUTO-REFRAME SPEAKER TRACKING — CONFIGURATION
 * =====================================================================
 * Fitur TAMBAHAN (tidak mengubah fitur/mode yang sudah ada). Sebelumnya
 * `ASPECT_RATIO_MODE=crop` hanya melakukan CENTER CROP STATIS (titik crop
 * selalu di tengah video, sepanjang durasi klip). Mode baru ini,
 * `ASPECT_RATIO_MODE=speaker_track`, mendeteksi wajah/pembicara aktif di
 * setiap klip dan membuat jendela crop 9:16 yang BERGERAK mengikuti posisi
 * pembicara (dynamic crop / auto-reframe), mirip fitur "Auto Reframe" di
 * Opus Clip / Submagic.
 *
 * Cara pakai: set di Railway Variables (sama seperti fitur lain):
 *   ASPECT_RATIO_MODE=speaker_track
 *
 * Semua konfigurasi di bawah ini OPSIONAL dan punya default yang aman.
 * Semua bisa diubah lewat Railway Dashboard → Variables tanpa redeploy
 * kode (restart service saja cukup).
 *
 * =====================================================================
 * AUTO_REFRAME_ENABLED (default: true)
 * =====================================================================
 * Saklar darurat. Kalau di-set "false", mode `speaker_track` otomatis
 * fallback ke `REFRAME_FALLBACK_MODE` (lihat bawah) walaupun
 * ASPECT_RATIO_MODE=speaker_track dipilih. Berguna untuk mematikan fitur
 * tanpa perlu mengganti ASPECT_RATIO_MODE.
 *
 * =====================================================================
 * REFRAME_FACE_PROVIDER (default: heuristic)
 * =====================================================================
 * Menentukan "engine" deteksi wajah/pembicara yang dipakai. Didesain agar
 * MUDAH DIGANTI — cukup ganti env var ini, tanpa mengubah kode lain:
 *
 *   heuristic ← Default, 100% on-device, tanpa API key/model eksternal.
 *               Memakai analisis warna kulit (skin-tone) + perubahan
 *               antar-frame (motion) dari FFmpeg untuk memperkirakan
 *               posisi wajah/pembicara aktif. Ringan & jalan di mana saja
 *               (termasuk Railway tanpa GPU).
 *   external  ← Hubungkan ke layanan deteksi wajah eksternal (mis. AWS
 *               Rekognition, Google Vision, Azure Face, atau model
 *               custom milikmu sendiri) lewat REFRAME_EXTERNAL_API_URL.
 *               Lihat src/lib/reframe/face-detectors/external-detector.ts
 *               untuk kontrak request/response-nya.
 *
 * Untuk menambah engine baru (mis. face-api.js, Mediapipe, dll), cukup
 * buat file baru di src/lib/reframe/face-detectors/ yang meng-implement
 * interface `FaceDetector` (src/lib/reframe/types.ts), lalu daftarkan di
 * src/lib/reframe/face-detector-factory.ts. Tidak ada bagian lain dari
 * aplikasi yang perlu diubah.
 *
 * =====================================================================
 * REFRAME_EXTERNAL_API_URL / REFRAME_EXTERNAL_API_KEY
 * =====================================================================
 * Dipakai hanya kalau REFRAME_FACE_PROVIDER=external. URL endpoint HTTP
 * yang menerima frame video (JSON, lihat external-detector.ts) dan
 * mengembalikan koordinat wajah/pembicara aktif.
 *
 * =====================================================================
 * REFRAME_SAMPLE_COUNT (default: 24, rentang 8-40)
 * =====================================================================
 * Jumlah titik sampel (keyframe) yang dianalisis sepanjang durasi klip
 * untuk melacak posisi pembicara. Makin besar = tracking makin halus
 * tapi makin lama diproses.
 *
 * =====================================================================
 * REFRAME_SMOOTHING (default: 0.35, rentang 0.0-0.9)
 * =====================================================================
 * Seberapa "halus/lambat" kamera virtual mengikuti pembicara. 0 = ikuti
 * posisi mentah apa adanya (bisa terlihat patah-patah/jitter), mendekati
 * 0.9 = sangat halus tapi responnya lebih lambat.
 *
 * =====================================================================
 * REFRAME_MAX_PAN_PER_SAMPLE (default: 0.18, rentang 0.02-1.0)
 * =====================================================================
 * Batas maksimum pergeseran jendela crop antar-titik sampel (dalam skala
 * 0.0-1.0 dari total ruang gerak crop). Mencegah crop "lompat" tiba-tiba
 * saat deteksi wajah meleset di satu frame.
 *
 * =====================================================================
 * REFRAME_MIN_SIGNAL_RATIO (default: 0.25, rentang 0.0-1.0)
 * =====================================================================
 * Minimal rasio frame yang berhasil mendeteksi wajah/pembicara dari
 * total sampel. Kalau di bawah ini (mis. video animasi tanpa wajah
 * manusia, layar gelap, dll), sistem otomatis fallback ke
 * REFRAME_FALLBACK_MODE supaya tetap menghasilkan klip yang valid.
 *
 * =====================================================================
 * REFRAME_ANALYZE_WIDTH / REFRAME_ANALYZE_HEIGHT (default: 64 / 36)
 * =====================================================================
 * Resolusi internal (sangat kecil) yang dipakai untuk analisis per-frame.
 * Tidak memengaruhi resolusi output klip — output tetap 1080x1920 seperti
 * mode lain. Dibuat kecil supaya cepat & ringan di CPU Railway.
 *
 * =====================================================================
 * REFRAME_FALLBACK_MODE (default: crop)
 * =====================================================================
 * Mode aspect-ratio statis (blur | crop | pad | stretch | none) yang
 * dipakai sebagai fallback otomatis kalau auto-reframe gagal/dimatikan.
 */

export type ReframeFaceProvider = "heuristic" | "external";

export type ReframeFallbackMode = "blur" | "crop" | "pad" | "stretch" | "none";

export interface ReframeConfig {
  enabled: boolean;
  faceProvider: ReframeFaceProvider;
  externalApiUrl: string | null;
  externalApiKey: string | null;
  sampleCount: number;
  smoothing: number;
  maxPanPerSample: number;
  minSignalRatio: number;
  analyzeWidth: number;
  analyzeHeight: number;
  fallbackMode: ReframeFallbackMode;
}

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw.trim() === "") return fallback;
  return raw.trim().toLowerCase() === "true";
}

function parseIntInRange(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (!raw) return fallback;
  const parsed = parseInt(raw.trim(), 10);
  if (!isNaN(parsed) && parsed >= min && parsed <= max) return parsed;
  console.warn(`[reframe-config] Nilai "${raw}" di luar rentang ${min}-${max}. Menggunakan default ${fallback}.`);
  return fallback;
}

function parseFloatInRange(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (!raw) return fallback;
  const parsed = parseFloat(raw.trim());
  if (!isNaN(parsed) && parsed >= min && parsed <= max) return parsed;
  console.warn(`[reframe-config] Nilai "${raw}" di luar rentang ${min}-${max}. Menggunakan default ${fallback}.`);
  return fallback;
}

export function getReframeConfig(): ReframeConfig {
  const provider = (process.env.REFRAME_FACE_PROVIDER || "heuristic").trim().toLowerCase();
  const faceProvider: ReframeFaceProvider = provider === "external" ? "external" : "heuristic";

  const fallbackRaw = (process.env.REFRAME_FALLBACK_MODE || "crop").trim().toLowerCase();
  const validFallbacks: ReframeFallbackMode[] = ["blur", "crop", "pad", "stretch", "none"];
  const fallbackMode = validFallbacks.includes(fallbackRaw as ReframeFallbackMode)
    ? (fallbackRaw as ReframeFallbackMode)
    : "crop";

  return {
    enabled: parseBool(process.env.AUTO_REFRAME_ENABLED, true),
    faceProvider,
    externalApiUrl: process.env.REFRAME_EXTERNAL_API_URL?.trim() || null,
    externalApiKey: process.env.REFRAME_EXTERNAL_API_KEY?.trim() || null,
    sampleCount: parseIntInRange(process.env.REFRAME_SAMPLE_COUNT, 24, 8, 40),
    smoothing: parseFloatInRange(process.env.REFRAME_SMOOTHING, 0.35, 0, 0.9),
    maxPanPerSample: parseFloatInRange(process.env.REFRAME_MAX_PAN_PER_SAMPLE, 0.18, 0.02, 1),
    minSignalRatio: parseFloatInRange(process.env.REFRAME_MIN_SIGNAL_RATIO, 0.25, 0, 1),
    analyzeWidth: parseIntInRange(process.env.REFRAME_ANALYZE_WIDTH, 64, 16, 160),
    analyzeHeight: parseIntInRange(process.env.REFRAME_ANALYZE_HEIGHT, 36, 9, 160),
    fallbackMode,
  };
}

export function getReframeProviderLabel(provider: ReframeFaceProvider): string {
  const labels: Record<ReframeFaceProvider, string> = {
    heuristic: "🧠 Heuristik (skin-tone + motion, on-device)",
    external: "🌐 External API (custom/cloud face detection)",
  };
  return labels[provider];
}
