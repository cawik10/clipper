/**
 * 🎯 AUTO-REFRAME SPEAKER TRACKING — EXTERNAL FACE DETECTOR (PLUGGABLE)
 * =====================================================================
 * Titik-ganti (swap point) resmi untuk menghubungkan engine deteksi
 * wajah/pembicara yang lebih kuat (AWS Rekognition, Google Vision, Azure
 * Face API, model custom kamu sendiri, dsb) TANPA mengubah kode lain di
 * aplikasi ini. Aktifkan dengan:
 *
 *   REFRAME_FACE_PROVIDER=external
 *   REFRAME_EXTERNAL_API_URL=https://milikmu.example.com/detect-face
 *   REFRAME_EXTERNAL_API_KEY=xxxxx   (opsional, dikirim sebagai Bearer token)
 *
 * KONTRAK REQUEST (POST, JSON):
 * {
 *   "width": 64,
 *   "height": 36,
 *   "timestamp": 1.25,            // detik, relatif awal klip
 *   "pixelFormat": "rgb24",
 *   "pixels": "<base64 raw RGB24 buffer, width*height*3 byte>"
 * }
 *
 * KONTRAK RESPONSE (JSON) yang diharapkan:
 * {
 *   "regions": [
 *     { "cx": 0.52, "cy": 0.41, "weight": 0.93 }
 *   ]
 * }
 * (cx, cy dinormalisasi 0..1 relatif terhadap width/height yang dikirim;
 *  weight = confidence relatif, semakin besar semakin diprioritaskan.)
 *
 * Kalau API eksternalmu menerima gambar JPEG/PNG alih-alih raw pixel,
 * cukup lakukan konversi di sisi server API tersebut (atau tambahkan
 * encoder di sini) — bagian lain dari fitur auto-reframe ini tidak perlu
 * tahu/berubah sama sekali.
 */
import type { DetectedRegion, FaceDetector, RawFrame } from "../types";
import { getReframeConfig } from "@/lib/reframe-config";

export class ExternalFaceDetector implements FaceDetector {
  readonly name = "external";

  async detect(frame: RawFrame): Promise<DetectedRegion[]> {
    const config = getReframeConfig();
    if (!config.externalApiUrl) {
      console.warn(
        "[reframe] REFRAME_FACE_PROVIDER=external tapi REFRAME_EXTERNAL_API_URL belum di-set. " +
          "Melewati deteksi untuk frame ini (akan fallback ke mode statis jika tidak ada sinyal sama sekali)."
      );
      return [];
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(config.externalApiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.externalApiKey ? { Authorization: `Bearer ${config.externalApiKey}` } : {}),
        },
        body: JSON.stringify({
          width: frame.width,
          height: frame.height,
          timestamp: frame.tSeconds,
          pixelFormat: "rgb24",
          pixels: frame.rgb.toString("base64"),
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        console.warn(`[reframe] External face API merespons status ${res.status}`);
        return [];
      }

      const data = (await res.json()) as { regions?: DetectedRegion[] };
      if (!Array.isArray(data.regions)) return [];

      return data.regions
        .filter((r) => typeof r.cx === "number" && typeof r.cy === "number")
        .map((r) => ({
          cx: Math.max(0, Math.min(1, r.cx)),
          cy: Math.max(0, Math.min(1, r.cy)),
          weight: typeof r.weight === "number" ? r.weight : 0.5,
        }));
    } catch (err) {
      console.warn("[reframe] Gagal memanggil external face detector:", err);
      return [];
    }
  }
}
