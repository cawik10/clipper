/**
 * 🎯 AUTO-REFRAME SPEAKER TRACKING — FRAME SAMPLER
 * =====================================================================
 * Mengekstrak beberapa frame kecil (raw RGB24, tanpa decode JPEG/PNG —
 * jadi tidak butuh dependency native tambahan) dari sebuah file video
 * memakai FFmpeg yang memang sudah tersedia di environment ini (lihat
 * Dockerfile). Frame-frame kecil ini lalu dipakai oleh face detector
 * untuk memperkirakan posisi pembicara aktif di sepanjang klip.
 */
import { exec } from "child_process";
import { promisify } from "util";
import type { RawFrame } from "./types";

const execAsync = promisify(exec);

export interface ProbedResolution {
  width: number;
  height: number;
}

/** Membaca resolusi video pakai ffprobe. */
export async function probeVideoResolution(filePath: string): Promise<ProbedResolution> {
  const cmd = `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0:s=x "${filePath}"`;
  const { stdout } = await execAsync(cmd, { timeout: 15000, encoding: "utf8" });
  const [w, h] = stdout.trim().split(/x/i).map((n: string) => parseInt(n, 10));
  if (!w || !h || isNaN(w) || isNaN(h)) {
    throw new Error(`Gagal membaca resolusi video: "${stdout.trim()}"`);
  }
  return { width: w, height: h };
}

/**
 * Mengekstrak `sampleCount` frame kecil yang tersebar merata sepanjang
 * `durationSeconds` dari `filePath`, di-downscale ke `analyzeWidth` x
 * `analyzeHeight` supaya analisis tetap cepat & ringan di CPU.
 */
export async function sampleRawFrames(
  filePath: string,
  durationSeconds: number,
  sampleCount: number,
  analyzeWidth: number,
  analyzeHeight: number
): Promise<RawFrame[]> {
  if (durationSeconds <= 0) return [];

  const fps = Math.max(0.5, Math.min(30, sampleCount / durationSeconds));
  const cmd = [
    "ffmpeg",
    "-y",
    "-i", `"${filePath}"`,
    "-vf", `"fps=${fps.toFixed(4)},scale=${analyzeWidth}:${analyzeHeight}:flags=fast_bilinear"`,
    "-f", "rawvideo",
    "-pix_fmt", "rgb24",
    "-an",
    "-",
  ].join(" ");

  const { stdout } = await execAsync(cmd, {
    timeout: 60000,
    encoding: "buffer",
    maxBuffer: 1024 * 1024 * 64,
  });

  const buffer = stdout as unknown as Buffer;
  const frameSize = analyzeWidth * analyzeHeight * 3;
  if (!buffer || buffer.length < frameSize) return [];

  const totalFrames = Math.min(sampleCount, Math.floor(buffer.length / frameSize));
  const frames: RawFrame[] = [];
  for (let i = 0; i < totalFrames; i++) {
    const start = i * frameSize;
    frames.push({
      tSeconds: i / fps,
      width: analyzeWidth,
      height: analyzeHeight,
      rgb: buffer.subarray(start, start + frameSize),
    });
  }
  return frames;
}
