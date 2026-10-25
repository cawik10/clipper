/**
 * 🎯 AUTO-REFRAME SPEAKER TRACKING (FITUR BARU!)
 * =====================================================================
 * Menghasilkan filter FFmpeg yang meng-crop video 9:16 secara DINAMIS
 * mengikuti posisi wajah/pembicara aktif, menggantikan "center crop"
 * statis yang dipakai mode `ASPECT_RATIO_MODE=crop` biasa.
 *
 * File ini TIDAK mengubah video-processor.ts / video-config.ts yang
 * sudah ada — ia hanya dipanggil dari satu titik tambahan di
 * video-processor.ts ketika `AUTO_REFRAME_ENABLED=true` DAN mode aktif
 * adalah `crop`. Kalau fitur nonaktif atau terjadi error apa pun,
 * fungsi ini otomatis fallback ke filter crop statis yang sudah ada
 * (lihat `buildFFmpegFilterArgs` di video-config.ts) — proses clipping
 * tidak akan pernah gagal gara-gara fitur ini.
 *
 * Alur singkat:
 *   1. Jalankan speaker-tracker.ts pada rentang waktu klip (startTime..endTime)
 *      untuk mendapatkan posisi wajah per sample waktu.
 *   2. Kalau tidak ada wajah terdeteksi → fallback.
 *   3. Hitung ukuran kotak crop 9:16 yang muat di frame sumber.
 *   4. Smoothing posisi wajah antar-sample (exponential moving average)
 *      supaya pergerakan crop halus, tidak "patah-patah".
 *   5. Bangun ekspresi FFmpeg `crop=w:h:x(t):y(t)` piecewise-linear dari
 *      titik-titik (waktu, x, y) hasil smoothing.
 */
import { execFile } from "child_process";
import { promisify } from "util";
import { buildFFmpegFilterArgs, TARGET_WIDTH, TARGET_HEIGHT } from "@/lib/video-config";
import { getAutoReframeConfig } from "@/lib/reframe-config";
import { detectSpeakerTrack, type FaceBox } from "@/lib/speaker-tracker";

const execFileAsync = promisify(execFile);

export interface ReframeFilterResult {
  useFilterComplex: boolean;
  filterValue: string;
  usedFallback: boolean;
  reason: string;
}

interface Keyframe {
  t: number; // detik, relatif ke awal klip
  x: number; // posisi crop (pixel, pojok kiri atas) pada frame sumber
  y: number;
}

async function probeResolution(videoPath: string): Promise<{ width: number; height: number } | null> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=width,height",
      "-of", "csv=s=x:p=0",
      videoPath,
    ]);
    const [w, h] = stdout.trim().split("x").map((n) => parseInt(n, 10));
    if (!w || !h) return null;
    return { width: w, height: h };
  } catch {
    return null;
  }
}

/** Exponential moving average sederhana untuk menghaluskan jalur crop. */
function smoothCenters(faces: FaceBox[], smoothing: number): FaceBox[] {
  if (faces.length === 0) return faces;
  const sorted = [...faces].sort((a, b) => a.t - b.t);
  const out: FaceBox[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = out[i - 1];
    const cur = sorted[i];
    out.push({
      t: cur.t,
      cx: prev.cx * smoothing + cur.cx * (1 - smoothing),
      cy: prev.cy * smoothing + cur.cy * (1 - smoothing),
      w: cur.w,
      h: cur.h,
    });
  }
  return out;
}

/** Membangun ekspresi FFmpeg piecewise-linear dari daftar keyframe (t → value). */
function buildPiecewiseExpr(keyframes: Keyframe[], key: "x" | "y"): string {
  if (keyframes.length === 1) {
    return keyframes[0][key].toFixed(2);
  }
  // Bangun dari belakang: if(lt(t,t1), interp(t0,t1), if(lt(t,t2), interp(t1,t2), ...lastValue))
  let expr = keyframes[keyframes.length - 1][key].toFixed(2);
  for (let i = keyframes.length - 2; i >= 0; i--) {
    const a = keyframes[i];
    const b = keyframes[i + 1];
    const dt = Math.max(0.001, b.t - a.t);
    const interp = `(${a[key].toFixed(2)}+(${(b[key] - a[key]).toFixed(2)})*(t-${a.t.toFixed(3)})/${dt.toFixed(3)})`;
    expr = `if(lt(t,${b.t.toFixed(3)}),${interp},${expr})`;
  }
  return expr;
}

/**
 * Entry point utama. Mengembalikan filter FFmpeg siap pakai (format sama
 * dengan `buildFFmpegFilterArgs`) sehingga video-processor.ts cukup
 * menukar satu pemanggilan fungsi saja.
 */
export async function buildReframeFilter(
  videoPath: string,
  startTime: number,
  endTime: number
): Promise<ReframeFilterResult> {
  const cfg = getAutoReframeConfig();

  const fallback = (reason: string): ReframeFilterResult => {
    const { useFilterComplex, filterValue } = buildFFmpegFilterArgs(cfg.fallbackMode);
    return { useFilterComplex, filterValue, usedFallback: true, reason };
  };

  if (!cfg.enabled) return fallback("auto_reframe_disabled");
  if (cfg.backend === "none") return fallback("backend_none");

  try {
    const resolution = await probeResolution(videoPath);
    if (!resolution) return fallback("probe_failed");
    const { width: srcW, height: srcH } = resolution;

    const track = await detectSpeakerTrack(videoPath, startTime, endTime, cfg);
    if (!track.faces.length) {
      return fallback(track.warning ? `no_faces:${track.warning}` : "no_faces_detected");
    }

    // Ukuran kotak crop 9:16 terbesar yang muat di frame sumber.
    let cropW = Math.round(Math.min(srcW, (srcH * TARGET_WIDTH) / TARGET_HEIGHT));
    let cropH = Math.round((cropW * TARGET_HEIGHT) / TARGET_WIDTH);
    if (cropH > srcH) {
      cropH = srcH;
      cropW = Math.round((cropH * TARGET_WIDTH) / TARGET_HEIGHT);
    }
    // FFmpeg butuh angka genap untuk encoder yuv420p.
    cropW -= cropW % 2;
    cropH -= cropH % 2;

    const padding = cfg.padding;
    const smoothed = smoothCenters(track.faces, cfg.smoothing);

    const keyframes: Keyframe[] = smoothed.map((f) => {
      // Beri sedikit ruang ekstra di sekitar wajah (padding) lalu clamp
      // supaya kotak crop tidak keluar dari batas frame sumber.
      const faceCenterX = f.cx * srcW;
      const faceCenterY = f.cy * srcH;
      const x = clamp(faceCenterX - cropW / 2, 0, Math.max(0, srcW - cropW));
      // Sedikit bias ke atas (padding) supaya wajah tidak terlalu di
      // tengah vertikal — umum dipakai di editor vertical video.
      const biasY = f.h * srcH * padding;
      const y = clamp(faceCenterY - cropH / 2 - biasY * 0.3, 0, Math.max(0, srcH - cropH));
      return { t: f.t, x, y };
    });

    if (keyframes.length === 1) {
      keyframes.push({ t: Math.max(0.5, endTime - startTime), x: keyframes[0].x, y: keyframes[0].y });
    }

    const xExpr = buildPiecewiseExpr(keyframes, "x");
    const yExpr = buildPiecewiseExpr(keyframes, "y");

    const filterValue = [
      `crop=${cropW}:${cropH}:${xExpr}:${yExpr}`,
      `scale=${TARGET_WIDTH}:${TARGET_HEIGHT}`,
      `setsar=1`,
    ].join(",");

    return { useFilterComplex: false, filterValue, usedFallback: false, reason: "ok" };
  } catch (err) {
    return fallback(`error:${err instanceof Error ? err.message : String(err)}`);
  }
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}
