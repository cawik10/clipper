/**
 * VIDEO PROCESSOR
 * ===============
 * Handles: download, transcription, clip processing
 * Supports per-user settings for aspect-ratio, watermark, zoom, intro/outro, thumbnail.
 */
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import {
  resolveAspectRatioMode,
  AspectRatioMode,
} from "@/lib/video-config";
import type { ClipResult } from "@/db/schema";

const execAsync = promisify(exec);
export const TMP_DIR = process.env.TMP_DIR || "/tmp/autoclip";

export const TARGET_WIDTH = 1080;
export const TARGET_HEIGHT = 1920;

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ─── PLATFORM DETECTION ───────────────────────────────────────────────────

export function detectPlatform(url: string): string {
  if (/youtube\.com|youtu\.be/.test(url)) return "youtube";
  if (/facebook\.com|fb\.watch/.test(url)) return "facebook";
  if (/tiktok\.com/.test(url)) return "tiktok";
  if (/instagram\.com/.test(url)) return "instagram";
  return "unknown";
}

// ─── ASPECT RATIO FILTER ─────────────────────────────────────────────────

export function buildFFmpegFilterArgs(mode: AspectRatioMode): {
  useFilterComplex: boolean;
  filterValue: string;
} {
  const W = TARGET_WIDTH;
  const H = TARGET_HEIGHT;
  switch (mode) {
    case "blur":
      return {
        useFilterComplex: true,
        filterValue:
          `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,` +
          `crop=${W}:${H},gblur=sigma=20[bg];` +
          `[0:v]scale=${W}:${H}:force_original_aspect_ratio=decrease[fg];` +
          `[bg][fg]overlay=(W-w)/2:(H-h)/2[out]`,
      };
    case "crop":
      return {
        useFilterComplex: false,
        filterValue: `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`,
      };
    case "pad":
      return {
        useFilterComplex: false,
        filterValue: `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2`,
      };
    case "stretch":
      return {
        useFilterComplex: false,
        filterValue: `scale=${W}:${H}`,
      };
    case "none":
    default:
      return {
        useFilterComplex: false,
        filterValue: "copy",
      };
  }
}

// ─── DOWNLOAD ─────────────────────────────────────────────────────────────

export async function downloadVideo(
  url: string,
  jobId: string,
  onProgress?: (pct: number) => Promise<void>
): Promise<{ filePath: string; title: string; duration: number }> {
  ensureDir(TMP_DIR);
  const outputTemplate = path.join(TMP_DIR, `${jobId}.%(ext)s`);

  const cookiePath = process.env.YTDLP_COOKIE_PATH || "";

  let cmd = [
    "yt-dlp",
    "--no-playlist",
    "--extractor-args", '"youtube:player_client=android,ios"',
    "--merge-output-format", "mp4",
    "-f", '"bestvideo[height<=1080]+bestaudio/best[height<=1080]/best"',
    "--newline",
    "-o", `"${outputTemplate}"`,
  ];

  if (cookiePath && fs.existsSync(cookiePath)) {
    cmd.splice(1, 0, "--cookies", `"${cookiePath}"`);
  }

  cmd.push(`"${url}"`);

  const fullCmd = cmd.join(" ");
  let lastProgress = 0;

  await new Promise<void>((resolve, reject) => {
    const proc = exec(fullCmd, { timeout: 600000 });
    proc.stdout?.on("data", async (data: string) => {
      const match = data.match(/(\d+\.\d+)%/);
      if (match && onProgress) {
        const pct = parseFloat(match[1]);
        if (pct - lastProgress >= 10) {
          lastProgress = pct;
          await onProgress(pct).catch(() => {});
        }
      }
    });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`yt-dlp exited with code ${code}`));
    });
    proc.on("error", reject);
  });

  const files = fs.readdirSync(TMP_DIR).filter((f) => f.startsWith(jobId));
  if (!files.length) throw new Error("Download selesai tapi file tidak ditemukan");

  const filePath = path.join(TMP_DIR, files[0]);

  let infoCmd = `yt-dlp --dump-json --no-playlist "${url}"`;
  if (cookiePath && fs.existsSync(cookiePath)) {
    infoCmd = `yt-dlp --dump-json --no-playlist --cookies "${cookiePath}" "${url}"`;
  }

  let title = "Video";
  let duration = 0;

  try {
    const { stdout } = await execAsync(infoCmd, { timeout: 30000 });
    const info = JSON.parse(stdout.trim().split("\n")[0]);
    title = info.title || "Video";
    duration = info.duration || 0;
  } catch {
    try {
      const probeCmd = `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${filePath}"`;
      const { stdout } = await execAsync(probeCmd, { timeout: 15000 });
      duration = parseFloat(stdout.trim()) || 0;
    } catch { /* ignore */ }
  }

  if (onProgress) await onProgress(100);
  return { filePath, title, duration };
}

// ─── TRANSCRIPTION ────────────────────────────────────────────────────────

export async function transcribeAudio(
  videoPath: string,
  language = "id"
): Promise<{ start: number; end: number; text: string }[]> {
  ensureDir(TMP_DIR);
  const audioPath = videoPath.replace(/\.[^.]+$/, "_audio.mp3");
  const extractCmd = `ffmpeg -y -i "${videoPath}" -vn -ar 16000 -ac 1 -b:a 32k "${audioPath}"`;
  await execAsync(extractCmd, { timeout: 60000 });

  try {
    const openaiKey = process.env.OPENAI_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;

    if (openaiKey) return await transcribeWithOpenAI(audioPath, language, openaiKey);
    if (groqKey) return await transcribeWithGroq(audioPath, language, groqKey);

    console.warn("[transcribe] Tidak ada API key, skip transkripsi");
    return [];
  } finally {
    try { if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath); } catch { /* ignore */ }
  }
}

async function transcribeWithOpenAI(
  audioPath: string,
  language: string,
  apiKey: string
): Promise<{ start: number; end: number; text: string }[]> {
  const OpenAI = (await import("openai")).default;
  const client = new OpenAI({ apiKey });
  const audioBuffer = fs.readFileSync(audioPath);
  const blob = new Blob([audioBuffer], { type: "audio/mp3" });
  const file = new File([blob], "audio.mp3", { type: "audio/mp3" });
  const response = await client.audio.transcriptions.create({
    model: "whisper-1",
    file,
    language: language === "id" ? "id" : language,
    response_format: "verbose_json",
    timestamp_granularities: ["segment"],
  });
  const data = response as unknown as { segments?: { start: number; end: number; text: string }[] };
  return (data.segments || []).map((s) => ({ start: s.start, end: s.end, text: s.text.trim() }));
}

async function transcribeWithGroq(
  audioPath: string,
  language: string,
  apiKey: string
): Promise<{ start: number; end: number; text: string }[]> {
  const FormData = (await import("form-data")).default;
  const axios = (await import("axios")).default;
  const form = new FormData();
  form.append("file", fs.createReadStream(audioPath), { filename: "audio.mp3" });
  form.append("model", "whisper-large-v3");
  form.append("language", language);
  form.append("response_format", "verbose_json");
  const response = await axios.post(
    "https://api.groq.com/openai/v1/audio/transcriptions",
    form,
    { headers: { Authorization: `Bearer ${apiKey}`, ...form.getHeaders() }, timeout: 120000 }
  );
  const segments = response.data?.segments || [];
  return segments.map((s: { start: number; end: number; text: string }) => ({
    start: s.start, end: s.end, text: s.text.trim(),
  }));
}

// ─── CLIP PROCESSING ─────────────────────────────────────────────────────

export interface ProcessClipsUserConfig {
  aspectRatioMode?: string | null;
  watermarkEnabled?: boolean | null;
  watermarkText?: string | null;
  watermarkPosition?: string | null;
  watermarkFontSize?: number | null;
  watermarkColor?: string | null;
  watermarkOpacity?: number | null;
  watermarkBox?: boolean | null;
  thumbnailEnabled?: boolean | null;
  thumbnailMode?: string | null;
  thumbnailQuality?: number | null;
  zoomEnabled?: boolean | null;
  zoomMode?: string | null;
  zoomType?: string | null;
  zoomIntensity?: number | null;
  zoomMinScore?: number | null;
  introEnabled?: boolean | null;
  introText?: string | null;
  introDuration?: number | null;
  outroEnabled?: boolean | null;
  outroText?: string | null;
  outroDuration?: number | null;
}

export async function processClips(
  videoPath: string,
  clips: Omit<ClipResult, "filePath" | "thumbnailPath">[],
  jobId: string,
  makeVertical = true,
  onProgress?: (clipIndex: number, total: number) => Promise<void>,
  userConfig?: ProcessClipsUserConfig
): Promise<ClipResult[]> {
  ensureDir(TMP_DIR);
  const mode = makeVertical
    ? resolveAspectRatioMode(userConfig?.aspectRatioMode)
    : "none";

  const results: ClipResult[] = [];

  for (let i = 0; i < clips.length; i++) {
    if (onProgress) await onProgress(i, clips.length);
    try {
      const result = await processSingleClip(videoPath, clips[i], mode, jobId, i, userConfig);
      results.push(result);
    } catch (err) {
      console.error(`[clip] ❌ Klip ${i} gagal:`, err);
      results.push({ ...clips[i], index: i });
    }
  }

  return results;
}

async function processSingleClip(
  videoPath: string,
  clip: Omit<ClipResult, "filePath" | "thumbnailPath">,
  mode: AspectRatioMode,
  jobId: string,
  clipIndex: number,
  userConfig?: ProcessClipsUserConfig
): Promise<ClipResult> {
  // Dynamic imports to avoid build issues if optional libs aren't present
  const { applyZoomEffect } = await import("@/lib/zoom-effect");
  const { applyWatermark } = await import("@/lib/watermark");
  const { applyIntroOutro } = await import("@/lib/intro-outro");
  const { generateThumbnail } = await import("@/lib/thumbnail-generator");

  // Step 1: Cut + convert
  const cutPath = path.join(TMP_DIR, `clip_cut_${jobId}_${clipIndex}.mp4`);
  await cutAndConvertClip(videoPath, clip.startTime, clip.endTime, cutPath, mode);

  // Step 2: Zoom effect (per-user config)
  const zoomPath = path.join(TMP_DIR, `clip_zoom_${jobId}_${clipIndex}.mp4`);
  const zoomResult = await applyZoomEffect(cutPath, zoomPath, clip.viralScore, userConfig);
  if (zoomResult.applied) {
    try { fs.unlinkSync(cutPath); } catch { /* ignore */ }
  }
  const afterZoom = zoomResult.applied ? zoomPath : cutPath;

  // Step 3: Watermark (per-user config)
  const wmPath = path.join(TMP_DIR, `clip_wm_${jobId}_${clipIndex}.mp4`);
  const wmResult = await applyWatermark(afterZoom, wmPath, userConfig);
  if (wmResult.type !== "none") {
    try { if (afterZoom !== cutPath) fs.unlinkSync(afterZoom); } catch { /* ignore */ }
  }
  const afterWm = wmResult.success && wmResult.type !== "none" ? wmPath : afterZoom;

  // Step 4: Intro / Outro (per-user config)
  const finalPath = path.join(TMP_DIR, `clip_final_${jobId}_${clipIndex}.mp4`);
  const ioResult = await applyIntroOutro(afterWm, finalPath, `${jobId}_${clipIndex}`, userConfig);
  if (ioResult.introAdded || ioResult.outroAdded) {
    try { if (afterWm !== cutPath) fs.unlinkSync(afterWm); } catch { /* ignore */ }
  }

  const finalFile = ioResult.success ? finalPath : afterWm;
  if (finalFile !== finalPath && fs.existsSync(finalFile)) {
    try { fs.renameSync(finalFile, finalPath); } catch {
      fs.copyFileSync(finalFile, finalPath);
      try { fs.unlinkSync(finalFile); } catch { /* ignore */ }
    }
  }

  const usedFinalPath = fs.existsSync(finalPath) ? finalPath : finalFile;

  // Step 5: Thumbnail (per-user config)
  let thumbnailPath: string | undefined;
  if (fs.existsSync(usedFinalPath)) {
    const thumbResult = await generateThumbnail(
      usedFinalPath, TMP_DIR, clipIndex, clip.duration, userConfig
    );
    if (thumbResult.success) thumbnailPath = thumbResult.thumbnailPath;
  }

  return { ...clip, index: clipIndex, filePath: usedFinalPath, thumbnailPath };
}

async function cutAndConvertClip(
  inputPath: string,
  startTime: number,
  endTime: number,
  outputPath: string,
  mode: AspectRatioMode
): Promise<void> {
  const duration = endTime - startTime;
  const { useFilterComplex, filterValue } = buildFFmpegFilterArgs(mode);

  let cmd: string;
  if (useFilterComplex) {
    cmd = [
      "ffmpeg", "-y",
      "-ss", startTime.toString(),
      "-t", duration.toString(),
      "-i", `"${inputPath}"`,
      "-filter_complex", `"${filterValue}"`,
      "-map", '"[out]"',
      "-map", "0:a?",
      "-threads", "2",
      "-c:v", "libx264", "-crf", "23", "-preset", "fast",
      "-c:a", "aac", "-ar", "44100", "-ac", "2",
      "-pix_fmt", "yuv420p",
      `"${outputPath}"`,
    ].join(" ");
  } else {
    cmd = [
      "ffmpeg", "-y",
      "-ss", startTime.toString(),
      "-t", duration.toString(),
      "-i", `"${inputPath}"`,
      "-vf", `"${filterValue}"`,
      "-threads", "2",
      "-c:v", "libx264", "-crf", "23", "-preset", "fast",
      "-c:a", "aac", "-ar", "44100", "-ac", "2",
      "-pix_fmt", "yuv420p",
      `"${outputPath}"`,
    ].join(" ");
  }

  await execAsync(cmd, { timeout: 300000 });
  if (!fs.existsSync(outputPath)) throw new Error("Cut clip file tidak terbuat");
}
