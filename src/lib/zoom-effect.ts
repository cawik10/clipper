/**
 * ZOOM EFFECT PROCESSOR
 * =====================
 * Menambahkan efek zoom otomatis pada momen highlight (viral score tinggi).
 * Menggunakan FFmpeg zoompan filter untuk animasi zoom yang smooth.
 *
 * Konfigurasi via env vars (Railway → Variables):
 *   ZOOM_EFFECT_ENABLED=true         ← Aktifkan zoom effect
 *   ZOOM_EFFECT_MODE=auto            ← auto | always | never
 *   ZOOM_EFFECT_INTENSITY=1.05       ← 1.0–1.3 (1.05 = subtle, 1.15 = medium, 1.3 = strong)
 *   ZOOM_EFFECT_DURATION=2.0         ← Durasi zoom dalam detik
 *   ZOOM_EFFECT_MIN_SCORE=7          ← Min viral score untuk auto mode (1-10)
 *   ZOOM_EFFECT_TYPE=in              ← in | out | in-out | pulse
 *
 * Catatan: zoompan filter bisa lambat untuk video panjang.
 * Zoom diterapkan HANYA di awal klip (duration detik pertama) agar cepat.
 */

import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { getZoomEffectConfig, type ZoomEffectType } from "@/lib/video-config";

const execAsync = promisify(exec);

export interface ZoomEffectResult {
  success: boolean;
  outputPath: string;
  error?: string;
  applied: boolean;
  reason: string;
}

/**
 * Terapkan zoom effect ke video klip.
 * @param inputPath   - Path video input
 * @param outputPath  - Path video output
 * @param viralScore  - Viral score dari AI (1-10), digunakan untuk mode auto
 */
export async function applyZoomEffect(
  inputPath: string,
  outputPath: string,
  viralScore: number = 5
): Promise<ZoomEffectResult> {
  const cfg = getZoomEffectConfig();

  // Cek apakah zoom harus diterapkan
  const shouldApply = determineIfShouldApply(cfg.mode, viralScore, cfg.minScore);

  if (!cfg.enabled || !shouldApply) {
    const reason = !cfg.enabled
      ? "Zoom effect dimatikan (ZOOM_EFFECT_ENABLED=false)"
      : cfg.mode === "never"
      ? "Zoom mode=never"
      : `Viral score ${viralScore} < min score ${cfg.minScore} (mode auto)`;

    fs.copyFileSync(inputPath, outputPath);
    return { success: true, outputPath, applied: false, reason };
  }

  if (!fs.existsSync(inputPath)) {
    return { success: false, outputPath: inputPath, applied: false, error: "Input file tidak ditemukan", reason: "" };
  }

  try {
    const zoomFilter = buildZoomFilter(cfg.type, cfg.intensity, cfg.duration);
    const reason = `Zoom ${cfg.type} | intensity=${cfg.intensity} | duration=${cfg.duration}s | score=${viralScore}/10`;

    console.log(`[zoom-effect] Applying zoom effect: ${reason}`);

    const cmd = [
      "ffmpeg", "-y",
      "-i", `"${inputPath}"`,
      "-vf", `"${zoomFilter}"`,
      "-threads", "2",
      "-c:v", "libx264",
      "-crf", "23",
      "-preset", "fast",
      "-c:a", "copy",
      `"${outputPath}"`,
    ].join(" ");

    await execAsync(cmd, { timeout: 180000 });

    if (!fs.existsSync(outputPath)) {
      throw new Error("Output file tidak terbuat setelah zoom effect");
    }

    console.log(`[zoom-effect] ✅ Zoom effect berhasil: ${path.basename(outputPath)}`);
    return { success: true, outputPath, applied: true, reason };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[zoom-effect] ❌ Gagal menerapkan zoom:", msg);
    // Fallback: kembalikan file asli
    try { fs.copyFileSync(inputPath, outputPath); } catch { /* ignore */ }
    return {
      success: false,
      outputPath: inputPath,
      applied: false,
      error: msg,
      reason: `Gagal: ${msg}`,
    };
  }
}

/**
 * Tentukan apakah zoom harus diterapkan berdasarkan mode & skor.
 */
function determineIfShouldApply(
  mode: string,
  viralScore: number,
  minScore: number
): boolean {
  switch (mode) {
    case "always": return true;
    case "never": return false;
    case "auto":
    default:
      return viralScore >= minScore;
  }
}

/**
 * Build FFmpeg zoompan filter berdasarkan tipe zoom.
 *
 * zoompan syntax: zoompan=z='expr':x='expr':y='expr':d=N:s=WxH
 *   z    = zoom level expression (mulai dari 1.0)
 *   x, y = posisi crop (center = iw/2-(iw/zoom/2) dll)
 *   d    = durasi dalam frame (fps * detik)
 *   s    = resolusi output (harus sama dengan video)
 */
function buildZoomFilter(
  type: ZoomEffectType,
  intensity: number,
  durationSec: number
): string {
  const fps = 30;
  const frames = Math.round(fps * durationSec);
  const maxZoom = intensity;

  // x, y center agar zoom dari tengah
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

  // Gunakan d=1 agar tidak menduplikasi frame, dan s=1080x1920 agar resolusi tetap vertikal
  return `zoompan=z='${zoomExpr}':x='${cx}':y='${cy}':d=1:s=1080x1920:fps=${fps}`;
}
