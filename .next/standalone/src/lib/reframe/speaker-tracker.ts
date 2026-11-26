/**
 * 🎯 AUTO-REFRAME SPEAKER TRACKING — TRACKER
 * =====================================================================
 * Menggabungkan frame-sampler + face detector menjadi satu jejak
 * (track) posisi pembicara aktif sepanjang durasi klip, lengkap dengan
 * pengisian celah (interpolasi) dan smoothing supaya gerakan kamera
 * virtual terlihat halus (bukan patah-patah mengikuti noise per-frame).
 */
import { sampleRawFrames } from "./frame-sampler";
import { getFaceDetector } from "./face-detector-factory";
import { getReframeConfig } from "@/lib/reframe-config";
import type { FaceDetector, SpeakerTrackResult, TrackKeyframe } from "./types";

interface RawPoint {
  t: number;
  cx: number | null;
  cy: number | null;
}

export async function analyzeSpeakerTrack(
  filePath: string,
  durationSeconds: number,
  /** Opsional — dipakai untuk unit test / mengganti detector secara manual. */
  provider?: FaceDetector
): Promise<SpeakerTrackResult> {
  const config = getReframeConfig();
  const detector: FaceDetector = provider ?? getFaceDetector();

  if (durationSeconds <= 0) {
    return { keyframes: [], usable: false, providerUsed: detector.name, reason: "invalid_duration" };
  }

  let frames;
  try {
    frames = await sampleRawFrames(
      filePath,
      durationSeconds,
      config.sampleCount,
      config.analyzeWidth,
      config.analyzeHeight
    );
  } catch (err) {
    return {
      keyframes: [],
      usable: false,
      providerUsed: detector.name,
      reason: `sampling_failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (!frames.length) {
    return {
      keyframes: [],
      usable: false,
      providerUsed: detector.name,
      reason: "no_frames_extracted",
    };
  }

  const rawPoints: RawPoint[] = [];
  let detectedCount = 0;

  for (const frame of frames) {
    try {
      const regions = await detector.detect(frame);
      if (regions && regions.length > 0) {
        // Pilih region dengan bobot tertinggi sebagai "pembicara aktif".
        const best = regions.reduce((a, b) => (b.weight > a.weight ? b : a));
        rawPoints.push({ t: frame.tSeconds, cx: best.cx, cy: best.cy });
        detectedCount++;
        continue;
      }
    } catch (err) {
      console.warn("[reframe] Face detector gagal pada satu frame, dilewati:", err);
    }
    rawPoints.push({ t: frame.tSeconds, cx: null, cy: null });
  }

  const signalRatio = detectedCount / rawPoints.length;
  if (signalRatio < config.minSignalRatio) {
    return {
      keyframes: [],
      usable: false,
      providerUsed: detector.name,
      reason: `low_signal_ratio:${signalRatio.toFixed(2)}`,
    };
  }

  const filled = fillGaps(rawPoints);
  const smoothed = smoothTrack(filled, config.smoothing, config.maxPanPerSample);

  return {
    keyframes: smoothed,
    usable: true,
    providerUsed: detector.name,
  };
}

/** Isi titik yang tidak terdeteksi dengan interpolasi/carry-forward dari tetangga yang valid. */
function fillGaps(points: RawPoint[]): TrackKeyframe[] {
  const result: TrackKeyframe[] = points.map((p) => ({ t: p.t, cx: p.cx ?? 0.5, cy: p.cy ?? 0.5 }));

  // Cari indeks titik yang valid (punya deteksi).
  const validIdx = points.map((p, i) => (p.cx !== null ? i : -1)).filter((i) => i >= 0);
  if (validIdx.length === 0) return result;

  // Sebelum titik valid pertama → pakai nilai titik valid pertama.
  for (let i = 0; i < validIdx[0]; i++) {
    result[i] = { t: points[i].t, cx: points[validIdx[0]].cx as number, cy: points[validIdx[0]].cy as number };
  }
  // Setelah titik valid terakhir → pakai nilai titik valid terakhir.
  const lastValid = validIdx[validIdx.length - 1];
  for (let i = lastValid + 1; i < points.length; i++) {
    result[i] = { t: points[i].t, cx: points[lastValid].cx as number, cy: points[lastValid].cy as number };
  }
  // Di antara dua titik valid → interpolasi linear.
  for (let k = 0; k < validIdx.length - 1; k++) {
    const i0 = validIdx[k];
    const i1 = validIdx[k + 1];
    if (i1 - i0 <= 1) continue;
    const p0 = points[i0];
    const p1 = points[i1];
    for (let i = i0 + 1; i < i1; i++) {
      const ratio = (points[i].t - p0.t) / (p1.t - p0.t || 1e-6);
      result[i] = {
        t: points[i].t,
        cx: (p0.cx as number) + ((p1.cx as number) - (p0.cx as number)) * ratio,
        cy: (p0.cy as number) + ((p1.cy as number) - (p0.cy as number)) * ratio,
      };
    }
  }

  return result;
}

/**
 * Exponential smoothing + batas kecepatan gerak maksimum, supaya jendela
 * crop dinamis tidak "lompat-lompat" mengikuti noise deteksi per-frame.
 */
function smoothTrack(points: TrackKeyframe[], smoothing: number, maxPanPerSample: number): TrackKeyframe[] {
  if (points.length === 0) return points;
  const alpha = Math.max(0.05, 1 - smoothing);
  const out: TrackKeyframe[] = [{ ...points[0] }];

  for (let i = 1; i < points.length; i++) {
    const prev = out[i - 1];
    const target = points[i];

    let nextCx = prev.cx + (target.cx - prev.cx) * alpha;
    let nextCy = prev.cy + (target.cy - prev.cy) * alpha;

    nextCx = prev.cx + clamp(nextCx - prev.cx, -maxPanPerSample, maxPanPerSample);
    nextCy = prev.cy + clamp(nextCy - prev.cy, -maxPanPerSample, maxPanPerSample);

    out.push({ t: target.t, cx: clamp(nextCx, 0, 1), cy: clamp(nextCy, 0, 1) });
  }

  return out;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
