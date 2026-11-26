/**
 * 🎯 AUTO-REFRAME SPEAKER TRACKING — FACE DETECTOR FACTORY
 * =====================================================================
 * Satu-satunya tempat yang perlu disentuh untuk mendaftarkan engine
 * deteksi wajah/pembicara baru. Engine dipilih via env var
 * REFRAME_FACE_PROVIDER (lihat src/lib/reframe-config.ts).
 *
 * Menambah engine baru:
 *   1. Buat file baru di src/lib/reframe/face-detectors/ yang
 *      meng-implement interface `FaceDetector` (src/lib/reframe/types.ts).
 *   2. Tambahkan satu baris `case` di bawah ini.
 *   3. Set REFRAME_FACE_PROVIDER ke nama barumu di Railway Variables.
 * Tidak ada bagian lain dari aplikasi (video-processor, dashboard, bot)
 * yang perlu diubah.
 */
import type { FaceDetector } from "./types";
import { getReframeConfig } from "@/lib/reframe-config";
import { HeuristicFaceDetector } from "./face-detectors/heuristic-detector";
import { ExternalFaceDetector } from "./face-detectors/external-detector";

export function getFaceDetector(): FaceDetector {
  const { faceProvider } = getReframeConfig();
  switch (faceProvider) {
    case "external":
      return new ExternalFaceDetector();
    case "heuristic":
    default:
      return new HeuristicFaceDetector();
  }
}
