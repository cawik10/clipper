/**
 * THUMBNAIL AUTO-GENERATOR
 * ========================
 * Generate thumbnail otomatis untuk setiap klip menggunakan FFmpeg.
 */
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { getThumbnailConfig, type ThumbnailMode } from "@/lib/video-config";

const execAsync = promisify(exec);

export interface ThumbnailResult {
  success: boolean;
  thumbnailPath?: string;
  error?: string;
  mode: ThumbnailMode;
  offsetUsed: number;
}

export async function generateThumbnail(
  videoPath: string,
  outputDir: string,
  clipIndex: number,
  clipDuration: number
): Promise<ThumbnailResult> {
  const config = getThumbnailConfig();

  if (!config.enabled) {
    return { success: false, error: "Thumbnail disabled", mode: config.mode, offsetUsed: 0 };
  }

  if (!fs.existsSync(videoPath)) {
    return { success: false, error: `Video not found: ${videoPath}`, mode: config.mode, offsetUsed: 0 };
  }

  const thumbnailPath = path.join(outputDir, `thumbnail_${clipIndex}.jpg`);
  const offsetSeconds = calculateOffset(config.mode, clipDuration, config.offsetSeconds);

  try {
    if (config.mode === "best") {
      return await generateBestFrameThumbnail(videoPath, thumbnailPath, clipDuration, config, clipIndex);
    } else {
      return await generateFrameAtOffset(videoPath, thumbnailPath, offsetSeconds, config, clipIndex);
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    if (config.mode !== "middle") {
      try {
        const fallbackOffset = Math.min(clipDuration / 2, clipDuration - 1);
        return await generateFrameAtOffset(videoPath, thumbnailPath, fallbackOffset, config, clipIndex);
      } catch { /* ignore */ }
    }
    return { success: false, error: `Thumbnail failed: ${errorMsg}`, mode: config.mode, offsetUsed: offsetSeconds };
  }
}

function calculateOffset(mode: ThumbnailMode, clipDuration: number, customOffset: number): number {
  switch (mode) {
    case "start": return Math.min(1, clipDuration * 0.05);
    case "middle": return clipDuration / 2;
    case "custom": return Math.min(customOffset, clipDuration - 0.5);
    default: return clipDuration / 2;
  }
}

async function generateFrameAtOffset(
  videoPath: string,
  thumbnailPath: string,
  offsetSeconds: number,
  config: ReturnType<typeof getThumbnailConfig>,
  clipIndex: number
): Promise<ThumbnailResult> {
  const scaleFilter = config.height === 0
    ? `scale=${config.width}:-2`
    : `scale=${config.width}:${config.height}:force_original_aspect_ratio=decrease,pad=${config.width}:${config.height}:(ow-iw)/2:(oh-ih)/2:black`;

  const cmd = [
    "ffmpeg", "-y",
    "-ss", offsetSeconds.toFixed(3),
    "-i", `"${videoPath}"`,
    "-vframes", "1",
    "-vf", `"${scaleFilter}"`,
    "-q:v", config.quality.toString(),
    "-f", "image2",
    `"${thumbnailPath}"`,
  ].join(" ");

  await execAsync(cmd, { timeout: 30000 });

  if (!fs.existsSync(thumbnailPath)) throw new Error("Thumbnail file not created");
  console.log(`[thumbnail] ✅ Klip ${clipIndex} thumbnail ok (offset: ${offsetSeconds.toFixed(1)}s)`);
  return { success: true, thumbnailPath, mode: config.mode, offsetUsed: offsetSeconds };
}

async function generateBestFrameThumbnail(
  videoPath: string,
  thumbnailPath: string,
  clipDuration: number,
  config: ReturnType<typeof getThumbnailConfig>,
  clipIndex: number
): Promise<ThumbnailResult> {
  const scaleFilter = config.height === 0
    ? `scale=${config.width}:-2`
    : `scale=${config.width}:${config.height}:force_original_aspect_ratio=decrease,pad=${config.width}:${config.height}:(ow-iw)/2:(oh-ih)/2:black`;

  const scanFrames = Math.min(100, Math.max(10, Math.round(clipDuration * 2)));
  const cmd = [
    "ffmpeg", "-y",
    "-i", `"${videoPath}"`,
    "-vf", `"thumbnail=${scanFrames},${scaleFilter}"`,
    "-frames:v", "1",
    "-q:v", config.quality.toString(),
    "-f", "image2",
    `"${thumbnailPath}"`,
  ].join(" ");

  await execAsync(cmd, { timeout: 60000 });
  if (!fs.existsSync(thumbnailPath)) throw new Error("Best frame thumbnail not created");
  console.log(`[thumbnail] ✅ Best frame klip ${clipIndex} ok (scan ${scanFrames} frames)`);
  return { success: true, thumbnailPath, mode: "best", offsetUsed: clipDuration / 2 };
}

export async function generateThumbnailsForClips(
  clips: Array<{ index: number; filePath?: string; duration: number }>,
  outputDir: string
): Promise<Map<number, string>> {
  const config = getThumbnailConfig();
  const thumbnailMap = new Map<number, string>();

  if (!config.enabled) return thumbnailMap;

  for (const clip of clips) {
    if (!clip.filePath || !fs.existsSync(clip.filePath)) continue;
    const result = await generateThumbnail(clip.filePath, outputDir, clip.index, clip.duration);
    if (result.success && result.thumbnailPath) {
      thumbnailMap.set(clip.index, result.thumbnailPath);
    }
  }
  return thumbnailMap;
}

export function cleanupThumbnails(thumbnailPaths: string[]): void {
  for (const p of thumbnailPaths) {
    try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch { /* ignore */ }
  }
}
