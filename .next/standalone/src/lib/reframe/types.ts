/**
 * 🎯 AUTO-REFRAME SPEAKER TRACKING — SHARED TYPES
 * =====================================================================
 * Kontrak/interface inti supaya setiap bagian dari fitur ini (sampler,
 * detector, tracker, filter builder) bisa saling tukar implementasi
 * tanpa mengubah kode pemanggilnya. Ini yang membuat engine deteksi
 * wajah/pembicara MUDAH DIGANTI — tinggal implement `FaceDetector` baru.
 */

/** Satu region hasil deteksi pada sebuah frame (koordinat dinormalisasi 0..1). */
export interface DetectedRegion {
  /** Titik tengah horizontal subjek, 0 = kiri, 1 = kanan. */
  cx: number;
  /** Titik tengah vertikal subjek, 0 = atas, 1 = bawah. */
  cy: number;
  /** Bobot/kepercayaan relatif (semakin besar semakin "layak jadi pembicara aktif"). */
  weight: number;
}

/** Satu frame mentah (raw RGB24) hasil ekstraksi FFmpeg, siap dianalisis. */
export interface RawFrame {
  /** Detik ke berapa frame ini berada relatif terhadap awal klip. */
  tSeconds: number;
  width: number;
  height: number;
  /** Buffer RGB24 (3 byte per piksel), panjang = width * height * 3. */
  rgb: Buffer;
}

/**
 * Interface utama untuk "engine" deteksi wajah/pembicara aktif.
 * Implementasi baru tinggal taruh di src/lib/reframe/face-detectors/ dan
 * daftarkan di face-detector-factory.ts — TIDAK ADA bagian lain yang
 * perlu diubah untuk mengganti engine deteksi.
 */
export interface FaceDetector {
  readonly name: string;
  detect(frame: RawFrame): Promise<DetectedRegion[]>;
}

/** Satu titik jejak (keyframe) posisi pembicara pada waktu tertentu. */
export interface TrackKeyframe {
  /** Detik, relatif terhadap awal klip (0 = awal klip). */
  t: number;
  /** Posisi horizontal subjek, dinormalisasi 0..1. */
  cx: number;
  /** Posisi vertikal subjek, dinormalisasi 0..1. */
  cy: number;
}

export interface SpeakerTrackResult {
  keyframes: TrackKeyframe[];
  /** false → sinyal deteksi terlalu lemah, sebaiknya fallback ke mode statis. */
  usable: boolean;
  providerUsed: string;
  reason?: string;
}
