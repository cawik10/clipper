/**
 * 🎯 AUTO-REFRAME SPEAKER TRACKING — HEURISTIC FACE DETECTOR (DEFAULT)
 * =====================================================================
 * Implementasi default dari interface `FaceDetector` (lihat
 * src/lib/reframe/types.ts). 100% berjalan on-device tanpa API key/model
 * ML eksternal, jadi langsung jalan di Railway tanpa setup tambahan.
 *
 * Algoritma (per frame):
 *   1. Klasifikasi tiap piksel sebagai "skin-tone" pakai heuristik warna
 *      kulit klasik (rule-of-thumb RGB — dipakai luas di computer vision
 *      sederhana sebelum era deep learning).
 *   2. Hitung titik tengah (centroid) dari piksel-piksel skin-tone,
 *      dibobot oleh seberapa kuat kecocokan warnanya.
 *   3. Kembalikan satu region dengan confidence = rasio piksel skin-tone
 *      terhadap total piksel pada frame tsb.
 *
 * Ini adalah pendekatan APPROXIMATE (bukan deep-learning face detector
 * sungguhan) — cukup untuk mengarahkan crop dinamis ke area wajah secara
 * umum tanpa menambah beban GPU/CPU berat atau dependency native baru.
 *
 * 👉 Ingin akurasi lebih tinggi (deteksi wajah sungguhan)? Set
 *    REFRAME_FACE_PROVIDER=external dan arahkan ke layanan deteksi wajah
 *    pilihanmu — lihat external-detector.ts. Tidak ada kode lain yang
 *    perlu diubah.
 */
import type { DetectedRegion, FaceDetector, RawFrame } from "../types";

function isSkinTone(r: number, g: number, b: number): number {
  // Heuristik klasik deteksi warna kulit (RGB rule-of-thumb), dinormalisasi
  // menjadi skor 0..1 alih-alih boolean keras supaya transisi lebih halus.
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const diff = max - min;

  const basicRule =
    r > 95 && g > 40 && b > 20 && diff > 15 && Math.abs(r - g) > 15 && r > g && r > b;

  if (!basicRule) return 0;

  // Skor tambahan: makin "hangat" dan makin terang (bukan bayangan gelap
  // atau area overexposed putih polos) → makin besar skornya.
  const warmth = Math.min(1, diff / 80);
  const brightness = Math.min(1, max / 255);
  return Math.max(0.15, warmth * 0.6 + brightness * 0.4);
}

export class HeuristicFaceDetector implements FaceDetector {
  readonly name = "heuristic";

  async detect(frame: RawFrame): Promise<DetectedRegion[]> {
    const { width, height, rgb } = frame;
    let sumX = 0;
    let sumY = 0;
    let sumWeight = 0;
    let skinPixels = 0;
    const totalPixels = width * height;

    for (let y = 0; y < height; y++) {
      const rowOffset = y * width * 3;
      for (let x = 0; x < width; x++) {
        const idx = rowOffset + x * 3;
        const r = rgb[idx];
        const g = rgb[idx + 1];
        const b = rgb[idx + 2];
        const score = isSkinTone(r, g, b);
        if (score > 0) {
          skinPixels++;
          // Bobot ekstra untuk piksel yang lebih dekat ke tengah vertikal
          // atas (wajah manusia saat ngomong biasanya di 2/3 atas frame),
          // supaya tidak "tertarik" ke tangan/kulit lain di bagian bawah.
          const verticalBias = y < height * 0.75 ? 1 : 0.5;
          const weight = score * verticalBias;
          sumX += x * weight;
          sumY += y * weight;
          sumWeight += weight;
        }
      }
    }

    if (sumWeight <= 0 || skinPixels === 0) return [];

    const cx = sumX / sumWeight / Math.max(1, width - 1);
    const cy = sumY / sumWeight / Math.max(1, height - 1);
    const confidence = Math.min(1, skinPixels / totalPixels / 0.12);

    return [{ cx: clamp01(cx), cy: clamp01(cy), weight: Math.max(0.05, confidence) }];
  }
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
