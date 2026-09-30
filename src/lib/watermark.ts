/**
 * WATERMARK PROCESSOR
 * ===================
 * Supports per-user config override via ProcessClipsUserConfig.
 */
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import { resolveWatermarkConfig, type WatermarkPosition } from "@/lib/video-config";
import type { ProcessClipsUserConfig } from "@/lib/video-processor";

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
  userConfig?: ProcessClipsUserConfig
): Promise<WatermarkResult> {
  const cfg = resolveWatermarkConfig({
    watermarkEnabled: userConfig?.watermarkEnabled,
    watermarkText: userConfig?.watermarkText,
    watermarkPosition: userConfig?.watermarkPosition,
    watermarkFontSize: userConfig?.watermarkFontSize,
    watermarkColor: userConfig?.watermarkColor,
    watermarkOpacity: userConfig?.watermarkOpacity,
    watermarkBox: userConfig?.watermarkBox,
  });

  if (!cfg.enabled) {
    fs.copyFileSync(inputPath, outputPath);
    return { success: true, outputPath, type: "none" };
  }

  if (!fs.existsSync(inputPath)) {
    return { success: false, outputPath: inputPath, error: "Input tidak ditemukan", type: "none" };
  }

  try {
    if (cfg.imagePath && fs.existsSync(cfg.imagePath)) {
      return await applyImageWatermark(inputPath, outputPath, cfg);
    } else {
      return await applyTextWatermark(inputPath, outputPath, cfg);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[watermark] ❌ Gagal:", msg);
    try { fs.copyFileSync(inputPath, outputPath); } catch { /* ignore */ }
    return { success: false, outputPath: inputPath, error: msg, type: "none" };
  }
}

async function applyTextWatermark(
  inputPath: string,
  outputPath: string,
  cfg: ReturnType<typeof resolveWatermarkConfig>
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
  if (cfg.box) drawtextFilter += `:box=1:boxcolor=${cfg.boxColor}:boxborderw=8`;
  drawtextFilter += `:font='DejaVu Sans'`;

  const cmd = [
    "ffmpeg", "-y",
    "-i", `"${inputPath}"`,
    "-vf", `"${drawtextFilter}"`,
    "-c:a", "copy",
    "-threads", "2",
    "-c:v", "libx264", "-crf", "23", "-preset", "fast",
    `"${outputPath}"`,
  ].join(" ");

  await execAsync(cmd, { timeout: 120000 });
  if (!fs.existsSync(outputPath)) throw new Error("Output tidak terbuat");
  return { success: true, outputPath, type: "text" };
}

async function applyImageWatermark(
  inputPath: string,
  outputPath: string,
  cfg: ReturnType<typeof resolveWatermarkConfig>
): Promise<WatermarkResult> {
  const { overlayX, overlayY } = getOverlayXY(cfg.position, cfg.imageScale);
  const scaleFilter = `scale=iw*${cfg.imageScale}:-1`;
  const alphaFilter = cfg.opacity < 1 ? `,format=rgba,colorchannelmixer=aa=${cfg.opacity}` : "";
  const filterComplex = [
    `[1:v]${scaleFilter}${alphaFilter}[logo]`,
    `[0:v][logo]overlay=${overlayX}:${overlayY}`,
  ].join(";");

  const cmd = [
    "ffmpeg", "-y",
    "-i", `"${inputPath}"`,
    "-i", `"${cfg.imagePath}"`,
    "-filter_complex", `"${filterComplex}"`,
    "-c:a", "copy",
    "-threads", "2",
    "-c:v", "libx264", "-crf", "23", "-preset", "fast",
    `"${outputPath}"`,
  ].join(" ");

  await execAsync(cmd, { timeout: 120000 });
  if (!fs.existsSync(outputPath)) throw new Error("Output tidak terbuat (image)");
  return { success: true, outputPath, type: "image" };
}

function getDrawtextXY(position: WatermarkPosition): { x: string; y: string } {
  const p = 20;
  switch (position) {
    case "topleft": return { x: `${p}`, y: `${p}` };
    case "topright": return { x: `w-tw-${p}`, y: `${p}` };
    case "bottomleft": return { x: `${p}`, y: `h-th-${p}` };
    case "bottomright": return { x: `w-tw-${p}`, y: `h-th-${p}` };
    case "center": return { x: `(w-tw)/2`, y: `(h-th)/2` };
    default: return { x: `w-tw-${p}`, y: `h-th-${p}` };
  }
}

function getOverlayXY(
  position: WatermarkPosition,
  _scale: number
): { overlayX: string; overlayY: string } {
  const p = 20;
  switch (position) {
    case "topleft": return { overlayX: `${p}`, overlayY: `${p}` };
    case "topright": return { overlayX: `W-w-${p}`, overlayY: `${p}` };
    case "bottomleft": return { overlayX: `${p}`, overlayY: `H-h-${p}` };
    case "bottomright": return { overlayX: `W-w-${p}`, overlayY: `H-h-${p}` };
    case "center": return { overlayX: `(W-w)/2`, overlayY: `(H-h)/2` };
    default: return { overlayX: `W-w-${p}`, overlayY: `H-h-${p}` };
  }
}
