/**
 * WATERMARK PROCESSOR
 * ===================
 * Menambahkan watermark teks atau gambar pada video klip menggunakan FFmpeg.
 */
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import {
  getWatermarkConfig,
  type WatermarkConfig,
  type WatermarkPosition,
} from "@/lib/video-config";

const execAsync = promisify(exec);

export interface WatermarkResult {
  success: boolean;
  outputPath: string;
  error?: string;
  type: "text" | "image" | "none";
}

export async function applyWatermark(
  inputPath: string,
  outputPath: string,
  config?: WatermarkConfig
): Promise<WatermarkResult> {
  const cfg = config || getWatermarkConfig();

  if (!cfg.enabled) {
    fs.copyFileSync(inputPath, outputPath);
    return { success: true, outputPath, type: "none" };
  }

  if (!fs.existsSync(inputPath)) {
    return { success: false, outputPath: inputPath, error: "Input file tidak ditemukan", type: "none" };
  }

  try {
    if (cfg.imagePath && fs.existsSync(cfg.imagePath)) {
      return await applyImageWatermark(inputPath, outputPath, cfg);
    } else {
      return await applyTextWatermark(inputPath, outputPath, cfg);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[watermark] ❌ Gagal menambahkan watermark:", msg);
    try {
      fs.copyFileSync(inputPath, outputPath);
    } catch {
      /* ignore */
    }
    return { success: false, outputPath: inputPath, error: msg, type: "none" };
  }
}

async function applyTextWatermark(
  inputPath: string,
  outputPath: string,
  cfg: WatermarkConfig
): Promise<WatermarkResult> {
  const { x, y } = getDrawtextXY(cfg.position);
  const escapedText = cfg.text
    .replace(/\\/g, "\\\\\\\\")
    .replace(/'/g, "\\'")
    .replace(/:/g, "\\:");
  const fontcolor = `${cfg.color}@${cfg.opacity.toFixed(2)}`;
  let drawtextFilter = `drawtext=text='${escapedText}'`;
  drawtextFilter += `:fontsize=${cfg.fontSize}`;
  drawtextFilter += `:fontcolor=${fontcolor}`;
  drawtextFilter += `:x=${x}:y=${y}`;
  if (cfg.box) {
    drawtextFilter += `:box=1:boxcolor=${cfg.boxColor}:boxborderw=8`;
  }
  drawtextFilter += `:font='DejaVu Sans'`;

  const cmd = [
    "ffmpeg",
    "-y",
    "-i", `"${inputPath}"`,
    "-vf", `"${drawtextFilter}"`,
    "-c:a", "copy",
    "-threads", "2",
    "-c:v", "libx264",
    "-crf", "23",
    "-preset", "fast",
    `"${outputPath}"`,
  ].join(" ");

  console.log(`[watermark] Applying text watermark: "${cfg.text}" @ ${cfg.position}`);
  await execAsync(cmd, { timeout: 120000 });

  if (!fs.existsSync(outputPath)) {
    throw new Error("Output file tidak terbuat setelah FFmpeg selesai");
  }

  console.log(`[watermark] ✅ Text watermark berhasil: ${path.basename(outputPath)}`);
  return { success: true, outputPath, type: "text" };
}

async function applyImageWatermark(
  inputPath: string,
  outputPath: string,
  cfg: WatermarkConfig
): Promise<WatermarkResult> {
  const { overlayX, overlayY } = getOverlayXY(cfg.position, cfg.imageScale);
  const scaleFilter = `scale=iw*${cfg.imageScale}:-1`;
  const alphaFilter =
    cfg.opacity < 1 ? `,format=rgba,colorchannelmixer=aa=${cfg.opacity}` : "";
  const filterComplex = [
    `[1:v]${scaleFilter}${alphaFilter}[logo]`,
    `[0:v][logo]overlay=${overlayX}:${overlayY}`,
  ].join(";");

  const cmd = [
    "ffmpeg",
    "-y",
    "-i", `"${inputPath}"`,
    "-i", `"${cfg.imagePath}"`,
    "-filter_complex", `"${filterComplex}"`,
    "-c:a", "copy",
    "-threads", "2",
    "-c:v", "libx264",
    "-crf", "23",
    "-preset", "fast",
    `"${outputPath}"`,
  ].join(" ");

  console.log(`[watermark] Applying image watermark: ${cfg.imagePath} @ ${cfg.position}`);
  await execAsync(cmd, { timeout: 120000 });

  if (!fs.existsSync(outputPath)) {
    throw new Error("Output file tidak terbuat setelah FFmpeg selesai (image watermark)");
  }

  console.log(`[watermark] ✅ Image watermark berhasil: ${path.basename(outputPath)}`);
  return { success: true, outputPath, type: "image" };
}

function getDrawtextXY(position: WatermarkPosition): { x: string; y: string } {
  const padding = 20;
  switch (position) {
    case "topleft":    return { x: `${padding}`, y: `${padding}` };
    case "topright":   return { x: `w-tw-${padding}`, y: `${padding}` };
    case "bottomleft": return { x: `${padding}`, y: `h-th-${padding}` };
    case "bottomright":return { x: `w-tw-${padding}`, y: `h-th-${padding}` };
    case "center":     return { x: `(w-tw)/2`, y: `(h-th)/2` };
    default:           return { x: `w-tw-${padding}`, y: `h-th-${padding}` };
  }
}

function getOverlayXY(
  position: WatermarkPosition,
  _scale: number
): { overlayX: string; overlayY: string } {
  const padding = 20;
  switch (position) {
    case "topleft":    return { overlayX: `${padding}`, overlayY: `${padding}` };
    case "topright":   return { overlayX: `W-w-${padding}`, overlayY: `${padding}` };
    case "bottomleft": return { overlayX: `${padding}`, overlayY: `H-h-${padding}` };
    case "bottomright":return { overlayX: `W-w-${padding}`, overlayY: `H-h-${padding}` };
    case "center":     return { overlayX: `(W-w)/2`, overlayY: `(H-h)/2` };
    default:           return { overlayX: `W-w-${padding}`, overlayY: `H-h-${padding}` };
  }
}
