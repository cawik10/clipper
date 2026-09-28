/**
 * THUMBNAIL AUTO-GENERATOR
 * ========================
 * Generate thumbnail otomatis untuk setiap klip menggunakan FFmpeg.
 *
 * Konfigurasi via environment variables (mudah diubah di Railway):
 *   THUMBNAIL_ENABLED=true          → Aktifkan (default)
 *   THUMBNAIL_MODE=middle           → Mode: middle | best | start | custom
 *   THUMBNAIL_OFFSET_SECONDS=5      → Offset (untuk mode custom)
 *   THUMBNAIL_QUALITY=5             → Kualitas JPEG (1-31, makin kecil makin bagus)
 *   THUMBNAIL_WIDTH=1280            → Lebar output
 *   THUMBNAIL_HEIGHT=720            → Tinggi output (0 = auto)
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

/**
 * Generate thumbnail untuk satu klip video.
 *
 * @param videoPath  - Path ke file video klip yang sudah dipotong
 * @param outputDir  - Direktori output untuk menyimpan thumbnail
 * @param clipIndex  - Index klip (untuk penamaan file)
 * @param clipDuration - Durasi klip dalam detik
 * @returns ThumbnailResult
 */
export async function generateThumbnail(
  videoPath: string,
  outputDir: string,
  clipIndex: number,
  clipDuration: number
): Promise<ThumbnailResult> {
  const config = getThumbnailConfig();

  // Jika thumbnail dimatikan, return early
  if (!config.enabled) {
    return {
      success: false,
      error: "Thumbnail generation dimatikan (THUMBNAIL_ENABLED=false)",
      mode: config.mode,
      offsetUsed: 0,
    };
  }

  if (!fs.existsSync(videoPath)) {
    return {
      success: false,
      error: `File video tidak ditemukan: ${videoPath}`,
      mode: config.mode,
      offsetUsed: 0,
    };
  }

  const thumbnailPath = path.join(
    outputDir,
    `thumbnail_${clipIndex}.jpg`
  );

  // Hitung offset berdasarkan mode
  let offsetSeconds = calculateOffset(config.mode, clipDuration, config.offsetSeconds);

  console.log(
    `[thumbnail] Generating thumbnail untuk klip ${clipIndex}: mode=${config.mode}, offset=${offsetSeconds}s, quality=${config.quality}`
  );

  try {
    if (config.mode === "best") {
      // Mode "best": scan beberapa frame dan pilih yang terbaik (via thumbnail filter)
      return await generateBestFrameThumbnail(
        videoPath,
        thumbnailPath,
        clipDuration,
        config,
        clipIndex
      );
    } else {
      // Mode lainnya: ambil frame pada offset tertentu
      return await generateFrameAtOffset(
        videoPath,
        thumbnailPath,
        offsetSeconds,
        config,
        clipIndex
      );
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[thumbnail] Gagal generate thumbnail klip ${clipIndex}:`, err);

    // Fallback ke middle frame jika mode lain gagal
    if (config.mode !== "middle") {
      console.warn(`[thumbnail] Fallback ke middle frame untuk klip ${clipIndex}`);
      const fallbackOffset = Math.min(clipDuration / 2, clipDuration - 1);
      try {
        return await generateFrameAtOffset(
          videoPath,
          thumbnailPath,
          fallbackOffset,
          config,
          clipIndex
        );
      } catch {
        // ignore fallback error
      }
    }

    return {
      success: false,
      error: `Gagal generate thumbnail: ${errorMsg}`,
      mode: config.mode,
      offsetUsed: offsetSeconds,
    };
  }
}

/**
 * Hitung offset waktu berdasarkan mode thumbnail
 */
function calculateOffset(
  mode: ThumbnailMode,
  clipDuration: number,
  customOffset: number
): number {
  switch (mode) {
    case "start":
      // 1 detik dari awal (hindari frame hitam di detik 0)
      return Math.min(1, clipDuration * 0.05);

    case "middle":
      // Tepat di tengah klip
      return clipDuration / 2;

    case "custom":
      // Offset yang ditentukan user, tapi jangan melebihi durasi klip
      return Math.min(customOffset, clipDuration - 0.5);

    case "best":
      // Mode best: pakai tengah sebagai fallback
      return clipDuration / 2;

    default:
      return clipDuration / 2;
  }
}

/**
 * Generate thumbnail dengan mengambil frame di offset tertentu
 */
async function generateFrameAtOffset(
  videoPath: string,
  thumbnailPath: string,
  offsetSeconds: number,
  config: ReturnType<typeof getThumbnailConfig>,
  clipIndex: number
): Promise<ThumbnailResult> {
  // Build scale filter
  const scaleFilter = buildScaleFilter(config.width, config.height);

  const cmd = [
    "ffmpeg",
    "-y",
    "-ss", offsetSeconds.toFixed(3),
    "-i", `"${videoPath}"`,
    "-vframes", "1",
    "-vf", `"${scaleFilter}"`,
    "-q:v", config.quality.toString(),
    "-f", "image2",
    `"${thumbnailPath}"`,
  ].join(" ");

  await execAsync(cmd, { timeout: 30000 });

  if (!fs.existsSync(thumbnailPath)) {
    throw new Error("File thumbnail tidak terbuat setelah FFmpeg selesai");
  }

  console.log(
    `[thumbnail] ✅ Thumbnail klip ${clipIndex} berhasil: ${thumbnailPath} (offset: ${offsetSeconds.toFixed(1)}s)`
  );

  return {
    success: true,
    thumbnailPath,
    mode: config.mode,
    offsetUsed: offsetSeconds,
  };
}

/**
 * Generate thumbnail "terbaik" dengan menggunakan FFmpeg thumbnail filter.
 * Filter ini menganalisis N frame dan memilih frame yang paling representatif.
 * Lebih lambat, tapi hasilnya lebih bagus.
 */
async function generateBestFrameThumbnail(
  videoPath: string,
  thumbnailPath: string,
  clipDuration: number,
  config: ReturnType<typeof getThumbnailConfig>,
  clipIndex: number
): Promise<ThumbnailResult> {
  const scaleFilter = buildScaleFilter(config.width, config.height);

  // thumbnail=N: scan N frame dan pilih yang paling representatif
  // Scan lebih banyak frame untuk klip yang lebih panjang
  const scanFrames = Math.min(
    100,
    Math.max(10, Math.round(clipDuration * 2))
  );

  const cmd = [
    "ffmpeg",
    "-y",
    "-i", `"${videoPath}"`,
    "-vf", `"thumbnail=${scanFrames},${scaleFilter}"`,
    "-frames:v", "1",
    "-q:v", config.quality.toString(),
    "-f", "image2",
    `"${thumbnailPath}"`,
  ].join(" ");

  await execAsync(cmd, { timeout: 60000 }); // timeout lebih lama untuk mode best

  if (!fs.existsSync(thumbnailPath)) {
    throw new Error("File thumbnail (best) tidak terbuat setelah FFmpeg selesai");
  }

  console.log(
    `[thumbnail] ✅ Best frame thumbnail klip ${clipIndex} berhasil: ${thumbnailPath} (scan ${scanFrames} frames)`
  );

  return {
    success: true,
    thumbnailPath,
    mode: "best",
    offsetUsed: clipDuration / 2,
  };
}

/**
 * Build FFmpeg scale filter untuk thumbnail
 */
function buildScaleFilter(width: number, height: number): string {
  if (height === 0) {
    // Auto height — pertahankan aspect ratio
    return `scale=${width}:-2`;
  }
  return `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`;
}

/**
 * Generate thumbnail untuk semua klip sekaligus.
 * Dipanggil setelah proses clipping selesai.
 *
 * @param clips   - Array ClipResult yang sudah ada filePath
 * @param outputDir - Direktori output
 * @returns Array ClipResult dengan thumbnailPath terisi
 */
export async function generateThumbnailsForClips(
  clips: Array<{
    index: number;
    filePath?: string;
    duration: number;
    startTime: number;
    endTime: number;
  }>,
  outputDir: string
): Promise<Map<number, string>> {
  const config = getThumbnailConfig();
  const thumbnailMap = new Map<number, string>();

  if (!config.enabled) {
    console.log("[thumbnail] Thumbnail generation dimatikan via THUMBNAIL_ENABLED=false");
    return thumbnailMap;
  }

  console.log(`[thumbnail] Generating thumbnails untuk ${clips.length} klip...`);

  for (const clip of clips) {
    if (!clip.filePath || !fs.existsSync(clip.filePath)) {
      console.warn(`[thumbnail] Skip klip ${clip.index}: filePath tidak ada`);
      continue;
    }

    const result = await generateThumbnail(
      clip.filePath,
      outputDir,
      clip.index,
      clip.duration
    );

    if (result.success && result.thumbnailPath) {
      thumbnailMap.set(clip.index, result.thumbnailPath);
    }
  }

  console.log(
    `[thumbnail] Selesai: ${thumbnailMap.size}/${clips.length} thumbnail berhasil`
  );

  return thumbnailMap;
}

/**
 * Hapus file thumbnail setelah tidak diperlukan
 */
export function cleanupThumbnails(thumbnailPaths: string[]): void {
  for (const thumbPath of thumbnailPaths) {
    try {
      if (fs.existsSync(thumbPath)) {
        fs.unlinkSync(thumbPath);
        console.log(`[thumbnail] Deleted: ${thumbPath}`);
      }
    } catch {
      // ignore cleanup errors
    }
  }
}
