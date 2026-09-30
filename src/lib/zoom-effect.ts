/**
 * ZOOM EFFECT PROCESSOR
 * =====================
 * Supports per-user config override via ProcessClipsUserConfig.
 */
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import { resolveZoomEffectConfig, type ZoomEffectType } from "@/lib/video-config";
import type { ProcessClipsUserConfig } from "@/lib/video-processor";

const execAsync = promisify(exec);

export interface ZoomEffectResult {
  success: boolean;
  outputPath: string;
  error?: string;
  applied: boolean;
  reason: string;
}

export async function applyZoomEffect(
  inputPath: string,
  outputPath: string,
  viralScore = 5,
  userConfig?: ProcessClipsUserConfig
): Promise<ZoomEffectResult> {
  const cfg = resolveZoomEffectConfig({
    zoomEnabled: userConfig?.zoomEnabled,
    zoomMode: userConfig?.zoomMode,
    zoomType: userConfig?.zoomType,
    zoomIntensity: userConfig?.zoomIntensity,
    zoomMinScore: userConfig?.zoomMinScore,
  });

  const shouldApply = determineIfShouldApply(cfg.mode, viralScore, cfg.minScore);

  if (!cfg.enabled || !shouldApply) {
    const reason = !cfg.enabled
      ? "Zoom effect dimatikan"
      : cfg.mode === "never"
      ? "Zoom mode=never"
      : `Viral score ${viralScore} < minScore ${cfg.minScore}`;
    fs.copyFileSync(inputPath, outputPath);
    return { success: true, outputPath, applied: false, reason };
  }

  if (!fs.existsSync(inputPath)) {
    return {
      success: false, outputPath: inputPath,
      error: "Input tidak ditemukan", applied: false, reason: "File not found",
    };
  }

  try {
    const zoomFilter = buildZoomFilter(cfg.type, cfg.intensity, cfg.duration);
    const cmd = [
      "ffmpeg", "-y",
      "-i", `"${inputPath}"`,
      "-vf", `"${zoomFilter}"`,
      "-c:a", "copy",
      "-threads", "2",
      "-c:v", "libx264", "-crf", "23", "-preset", "fast",
      "-pix_fmt", "yuv420p",
      `"${outputPath}"`,
    ].join(" ");

    await execAsync(cmd, { timeout: 180000 });

    if (!fs.existsSync(outputPath)) throw new Error("Output tidak terbuat");

    return {
      success: true, outputPath, applied: true,
      reason: `Zoom ${cfg.type} applied (score: ${viralScore}, intensity: ${cfg.intensity}×)`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[zoom] ❌ Gagal:", msg);
    try { fs.copyFileSync(inputPath, outputPath); } catch { /* ignore */ }
    return { success: false, outputPath, error: msg, applied: false, reason: `Failed: ${msg}` };
  }
}

function determineIfShouldApply(
  mode: string, viralScore: number, minScore: number
): boolean {
  switch (mode) {
    case "always": return true;
    case "never": return false;
    case "auto":
    default: return viralScore >= minScore;
  }
}

function buildZoomFilter(type: ZoomEffectType, intensity: number, durationSec: number): string {
  const fps = 30;
  const frames = Math.round(fps * durationSec);
  const maxZoom = intensity;
  const cx = `iw/2-(iw/zoom/2)`;
  const cy = `ih/2-(ih/zoom/2)`;
  let zoomExpr: string;

  switch (type) {
    case "in":
      zoomExpr = `min(1+(on*${((maxZoom - 1) / frames).toFixed(6)}),${maxZoom})`;
      break;
    case "out":
      zoomExpr = `max(${maxZoom}-(on*${((maxZoom - 1) / frames).toFixed(6)}),1)`;
      break;
    case "in-out": {
      const half = Math.round(frames / 2);
      const step = ((maxZoom - 1) / half).toFixed(6);
      zoomExpr = `if(lte(on,${half}),1+(on*${step}),max(${maxZoom}-((on-${half})*${step}),1))`;
      break;
    }
    case "pulse": {
      const q = Math.round(frames / 4);
      const step = ((maxZoom - 1) / q).toFixed(6);
      zoomExpr = `if(lte(on,${q}),1+(on*${step}),if(lte(on,${q * 2}),max(${maxZoom}-((on-${q})*${step}),1),if(lte(on,${q * 3}),1+((on-${q * 2})*${step}),max(${maxZoom}-((on-${q * 3})*${step}),1))))`;
      break;
    }
    default:
      zoomExpr = `min(1+(on*${((maxZoom - 1) / frames).toFixed(6)}),${maxZoom})`;
  }

  return `zoompan=z='${zoomExpr}':x='${cx}':y='${cy}':d=1:s=1080x1920:fps=${fps}`;
}
