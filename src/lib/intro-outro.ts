/**
 * INTRO / OUTRO PROCESSOR
 * =======================
 * Menggabungkan intro dan/atau outro ke setiap klip video secara otomatis.
 *
 * Mode:
 * 1. Jika INTRO_VIDEO_PATH / OUTRO_VIDEO_PATH diisi → gunakan file video tersebut
 * 2. Jika tidak → generate intro/outro otomatis (layar hitam + teks menggunakan FFmpeg)
 *
 * Konfigurasi via env vars (Railway → Variables):
 *   INTRO_ENABLED=false
 *   INTRO_VIDEO_PATH=/path/to/intro.mp4
 *   INTRO_DURATION=3
 *   INTRO_TEXT=AutoClip Bot
 *   INTRO_COLOR=#000000
 *   OUTRO_ENABLED=false
 *   OUTRO_VIDEO_PATH=/path/to/outro.mp4
 *   OUTRO_DURATION=3
 *   OUTRO_TEXT=Subscribe! 🔔
 *   OUTRO_COLOR=#000000
 */

import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { getIntroOutroConfig, TARGET_WIDTH, TARGET_HEIGHT } from "@/lib/video-config";

const execAsync = promisify(exec);

export interface IntroOutroResult {
  success: boolean;
  outputPath: string;
  error?: string;
  introAdded: boolean;
  outroAdded: boolean;
}

/**
 * Terapkan intro dan/atau outro ke file video.
 * @param inputPath   - Path video klip yang sudah diproses
 * @param outputPath  - Path output video final
 * @param jobId       - ID job untuk penamaan file temp
 */
export async function applyIntroOutro(
  inputPath: string,
  outputPath: string,
  jobId: string
): Promise<IntroOutroResult> {
  const cfg = getIntroOutroConfig();

  if (!cfg.introEnabled && !cfg.outroEnabled) {
    // Tidak ada intro/outro — copy langsung
    fs.copyFileSync(inputPath, outputPath);
    return { success: true, outputPath, introAdded: false, outroAdded: false };
  }

  if (!fs.existsSync(inputPath)) {
    return { success: false, outputPath: inputPath, error: "Input tidak ditemukan", introAdded: false, outroAdded: false };
  }

  const tmpDir = path.dirname(inputPath);

  try {
    // Siapkan file intro (jika aktif)
    let introPath: string | null = null;
    if (cfg.introEnabled) {
      if (cfg.introVideoPath && fs.existsSync(cfg.introVideoPath)) {
        introPath = cfg.introVideoPath;
        console.log(`[intro-outro] Menggunakan file intro: ${introPath}`);
      } else {
        introPath = path.join(tmpDir, `intro_${jobId}.mp4`);
        await generateSlateVideo(introPath, cfg.introDuration, cfg.introText, cfg.introColor);
        console.log(`[intro-outro] ✅ Intro otomatis dibuat: ${introPath}`);
      }
    }

    // Siapkan file outro (jika aktif)
    let outroPath: string | null = null;
    if (cfg.outroEnabled) {
      if (cfg.outroVideoPath && fs.existsSync(cfg.outroVideoPath)) {
        outroPath = cfg.outroVideoPath;
        console.log(`[intro-outro] Menggunakan file outro: ${outroPath}`);
      } else {
        outroPath = path.join(tmpDir, `outro_${jobId}.mp4`);
        await generateSlateVideo(outroPath, cfg.outroDuration, cfg.outroText, cfg.outroColor);
        console.log(`[intro-outro] ✅ Outro otomatis dibuat: ${outroPath}`);
      }
    }

    // Normalize semua segmen ke resolusi & codec yang sama agar bisa concat
    const segments: string[] = [];

    if (introPath) {
      const normIntro = path.join(tmpDir, `norm_intro_${jobId}.mp4`);
      await normalizeSegment(introPath, normIntro);
      segments.push(normIntro);
    }

    const normMain = path.join(tmpDir, `norm_main_${jobId}.mp4`);
    await normalizeSegment(inputPath, normMain);
    segments.push(normMain);

    if (outroPath) {
      const normOutro = path.join(tmpDir, `norm_outro_${jobId}.mp4`);
      await normalizeSegment(outroPath, normOutro);
      segments.push(normOutro);
    }

    // Buat concat list file
    const concatList = path.join(tmpDir, `concat_${jobId}.txt`);
    const concatContent = segments.map((s) => `file '${s}'`).join("\n");
    fs.writeFileSync(concatList, concatContent);

    // Gabungkan semua segmen
    const concatCmd = [
      "ffmpeg", "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", `"${concatList}"`,
      "-c", "copy",
      `"${outputPath}"`,
    ].join(" ");

    await execAsync(concatCmd, { timeout: 180000 });

    if (!fs.existsSync(outputPath)) {
      throw new Error("Output file tidak terbuat setelah concat");
    }

    // Cleanup temp files
    setTimeout(() => {
      const toDelete = [concatList, normMain, ...segments.filter((s) => s !== normMain)];
      if (introPath && !cfg.introVideoPath) toDelete.push(introPath);
      if (outroPath && !cfg.outroVideoPath) toDelete.push(outroPath);
      toDelete.forEach((f) => {
        try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch { /* ignore */ }
      });
    }, 5000);

    console.log(`[intro-outro] ✅ Intro/Outro berhasil ditambahkan: ${path.basename(outputPath)}`);
    return {
      success: true,
      outputPath,
      introAdded: !!introPath,
      outroAdded: !!outroPath,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[intro-outro] ❌ Gagal:", msg);
    // Fallback: kembalikan file asli
    try { fs.copyFileSync(inputPath, outputPath); } catch { /* ignore */ }
    return { success: false, outputPath: inputPath, error: msg, introAdded: false, outroAdded: false };
  }
}

/**
 * Generate video slate otomatis (layar warna + teks menggunakan FFmpeg lavfi).
 * Digunakan ketika file intro/outro tidak tersedia.
 */
async function generateSlateVideo(
  outputPath: string,
  duration: number,
  text: string,
  bgColor: string
): Promise<void> {
  // Escape teks untuk FFmpeg drawtext
  const escapedText = text
    .replace(/\\/g, "\\\\\\\\")
    .replace(/'/g, "\\'")
    .replace(/:/g, "\\:");

  // Konversi hex color (#RRGGBB) ke FFmpeg color format
  const ffmpegColor = bgColor.startsWith("#") ? `0x${bgColor.slice(1)}` : bgColor;

  const fontSize = Math.round(TARGET_WIDTH * 0.05); // 5% of width
  const fontY = `(h-th)/2`;
  const fontX = `(w-tw)/2`;

  // Filter: color background + fade in/out + centered text
  const vf = [
    `color=c=${ffmpegColor}:size=${TARGET_WIDTH}x${TARGET_HEIGHT}:duration=${duration}:rate=30`,
    `[v]`,
  ].join("");

  const drawtextFilter = `drawtext=text='${escapedText}':fontsize=${fontSize}:fontcolor=white@0.9:x=${fontX}:y=${fontY}:box=1:boxcolor=black@0.3:boxborderw=12:font='DejaVu Sans'`;

  const vfWithFade = [
    `fade=t=in:st=0:d=0.5`,
    `fade=t=out:st=${Math.max(0, duration - 0.5)}:d=0.5`,
    drawtextFilter,
  ].join(",");

  const cmd = [
    "ffmpeg", "-y",
    "-f", "lavfi",
    "-i", `color=c=${ffmpegColor}:size=${TARGET_WIDTH}x${TARGET_HEIGHT}:duration=${duration}:rate=30`,
    "-f", "lavfi",
    "-i", `anullsrc=channel_layout=stereo:sample_rate=44100`,
    "-vf", `"${vfWithFade}"`,
    "-threads", "2",
    "-c:v", "libx264",
    "-c:a", "aac",
    "-t", duration.toString(),
    "-shortest",
    "-pix_fmt", "yuv420p",
    `"${outputPath}"`,
  ].join(" ");

  await execAsync(cmd, { timeout: 60000 });
  if (!fs.existsSync(outputPath)) throw new Error("Slate video tidak terbuat");
}

/**
 * Normalize segmen video ke resolusi target & codec yang konsisten.
 * Ini penting agar FFmpeg concat berjalan mulus.
 */
async function normalizeSegment(inputPath: string, outputPath: string): Promise<void> {
  const cmd = [
    "ffmpeg", "-y",
    "-i", `"${inputPath}"`,
    "-vf", `"scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=decrease,pad=${TARGET_WIDTH}:${TARGET_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black,setsar=1"`,
    "-threads", "2",
    "-c:v", "libx264",
    "-crf", "23",
    "-preset", "fast",
    "-c:a", "aac",
    "-ar", "44100",
    "-ac", "2",
    "-pix_fmt", "yuv420p",
    `"${outputPath}"`,
  ].join(" ");

  await execAsync(cmd, { timeout: 120000 });
  if (!fs.existsSync(outputPath)) throw new Error(`Normalize gagal: ${outputPath}`);
}
