/**
 * INTRO / OUTRO PROCESSOR
 * =======================
 * Menggabungkan intro dan/atau outro ke setiap klip video secara otomatis.
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

export async function applyIntroOutro(
  inputPath: string,
  outputPath: string,
  jobId: string
): Promise<IntroOutroResult> {
  const cfg = getIntroOutroConfig();

  if (!cfg.introEnabled && !cfg.outroEnabled) {
    fs.copyFileSync(inputPath, outputPath);
    return { success: true, outputPath, introAdded: false, outroAdded: false };
  }

  if (!fs.existsSync(inputPath)) {
    return {
      success: false,
      outputPath: inputPath,
      error: "Input tidak ditemukan",
      introAdded: false,
      outroAdded: false,
    };
  }

  const tmpDir = path.dirname(inputPath);

  try {
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

    const concatList = path.join(tmpDir, `concat_${jobId}.txt`);
    const concatContent = segments.map((s) => `file '${s}'`).join("\n");
    fs.writeFileSync(concatList, concatContent);

    const concatCmd = [
      "ffmpeg",
      "-y",
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

    setTimeout(() => {
      const toDelete = [concatList, normMain, ...segments.filter((s) => s !== normMain)];
      if (introPath && !cfg.introVideoPath) toDelete.push(introPath);
      if (outroPath && !cfg.outroVideoPath) toDelete.push(outroPath);
      toDelete.forEach((f) => {
        try {
          if (fs.existsSync(f)) fs.unlinkSync(f);
        } catch {
          /* ignore */
        }
      });
    }, 5000);

    console.log(`[intro-outro] ✅ Intro/Outro berhasil ditambahkan: ${path.basename(outputPath)}`);
    return { success: true, outputPath, introAdded: !!introPath, outroAdded: !!outroPath };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[intro-outro] ❌ Gagal:", msg);
    try {
      fs.copyFileSync(inputPath, outputPath);
    } catch {
      /* ignore */
    }
    return { success: false, outputPath: inputPath, error: msg, introAdded: false, outroAdded: false };
  }
}

async function generateSlateVideo(
  outputPath: string,
  duration: number,
  text: string,
  bgColor: string
): Promise<void> {
  const escapedText = text
    .replace(/\\/g, "\\\\\\\\")
    .replace(/'/g, "\\'")
    .replace(/:/g, "\\:");
  const ffmpegColor = bgColor.startsWith("#") ? `0x${bgColor.slice(1)}` : bgColor;
  const fontSize = Math.round(TARGET_WIDTH * 0.05);
  const fontY = `(h-th)/2`;
  const fontX = `(w-tw)/2`;
  const drawtextFilter = `drawtext=text='${escapedText}':fontsize=${fontSize}:fontcolor=white@0.9:x=${fontX}:y=${fontY}:box=1:boxcolor=black@0.3:boxborderw=12:font='DejaVu Sans'`;
  const vfWithFade = [
    `fade=t=in:st=0:d=0.5`,
    `fade=t=out:st=${Math.max(0, duration - 0.5)}:d=0.5`,
    drawtextFilter,
  ].join(",");

  const cmd = [
    "ffmpeg",
    "-y",
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

async function normalizeSegment(inputPath: string, outputPath: string): Promise<void> {
  const cmd = [
    "ffmpeg",
    "-y",
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
