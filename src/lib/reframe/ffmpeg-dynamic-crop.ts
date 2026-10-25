/**
 * 🎯 AUTO-REFRAME SPEAKER TRACKING — DYNAMIC FFMPEG CROP FILTER
 * =====================================================================
 * Mengubah daftar keyframe posisi pembicara (lihat speaker-tracker.ts)
 * menjadi satu filter FFmpeg `crop=w:h:x:y` yang BERGERAK sepanjang
 * waktu (bukan nilai x/y statis seperti mode `crop` biasa), memakai
 * ekspresi piecewise-linear berbasis variabel `t` yang didukung native
 * oleh FFmpeg (tidak perlu pass/filter tambahan seperti sendcmd).
 */
import type { TrackKeyframe } from "./types";

export interface DynamicCropPlan {
  filter: string;
  cropWidth: number;
  cropHeight: number;
}

/** Membuat ekspresi FFmpeg piecewise-linear dari daftar titik {t, v}. */
function buildPiecewiseExpr(points: { t: number; v: number }[]): string {
  if (points.length === 0) return "0";
  if (points.length === 1) return points[0].v.toFixed(2);

  let expr = points[points.length - 1].v.toFixed(2);
  for (let i = points.length - 2; i >= 0; i--) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const dt = p1.t - p0.t || 1e-6;
    const slope = (p1.v - p0.v) / dt;
    const segment = `(${p0.v.toFixed(2)}+(${slope.toFixed(4)})*(t-${p0.t.toFixed(3)}))`;
    // Catatan: ekspresi ini nanti dibungkus tanda kutip tunggal di filter
    // FFmpeg (x='...'), jadi koma DI DALAM kutip tunggal aman/literal dan
    // TIDAK boleh di-escape dengan backslash (di dalam kutip tunggal FFmpeg,
    // backslash tidak diproses sebagai escape character).
    expr = `if(lt(t,${p1.t.toFixed(3)}),${segment},${expr})`;
  }
  return expr;
}

/**
 * Menghitung rencana crop dinamis (ukuran jendela crop + ekspresi x/y per
 * waktu) berdasarkan resolusi sumber, resolusi target (9:16), dan jejak
 * posisi pembicara.
 */
export function buildDynamicCropFilter(
  keyframes: TrackKeyframe[],
  srcWidth: number,
  srcHeight: number,
  targetWidth: number,
  targetHeight: number
): DynamicCropPlan {
  const targetAspect = targetWidth / targetHeight;
  const srcAspect = srcWidth / srcHeight;

  let cropWidth: number;
  let cropHeight: number;
  // true = ruang gerak ada secara horizontal (sumber lebih "lebar" dari target)
  let panHorizontal: boolean;

  if (srcAspect > targetAspect) {
    cropHeight = evenize(srcHeight);
    cropWidth = evenize(Math.min(srcWidth, Math.round((cropHeight * targetAspect) / 2) * 2));
    panHorizontal = true;
  } else {
    cropWidth = evenize(srcWidth);
    cropHeight = evenize(Math.min(srcHeight, Math.round((cropWidth / targetAspect) / 2) * 2));
    panHorizontal = false;
  }

  const xRange = Math.max(0, srcWidth - cropWidth);
  const yRange = Math.max(0, srcHeight - cropHeight);

  const xPoints = keyframes.map((k) => ({
    t: k.t,
    v: panHorizontal ? clamp(k.cx * srcWidth - cropWidth / 2, 0, xRange) : xRange / 2,
  }));
  const yPoints = keyframes.map((k) => ({
    t: k.t,
    v: panHorizontal ? yRange / 2 : clamp(k.cy * srcHeight - cropHeight / 2, 0, yRange),
  }));

  const xExpr = buildPiecewiseExpr(xPoints);
  const yExpr = buildPiecewiseExpr(yPoints);

  const filter =
    `crop=${cropWidth}:${cropHeight}:x='${xExpr}':y='${yExpr}',` +
    `scale=${targetWidth}:${targetHeight},setsar=1`;

  return { filter, cropWidth, cropHeight };
}

function evenize(n: number): number {
  const v = Math.max(2, Math.round(n));
  return v % 2 === 0 ? v : v - 1;
}

function clamp(v: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.max(min, Math.min(max, v));
}
