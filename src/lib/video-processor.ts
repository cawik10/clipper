/**
 * VIDEO PROCESSOR
 * ===============
 * Handles: download, transcription, clip processing (cut → zoom → watermark → intro/outro)
 */
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import {
  getAspectRatioMode,
  buildFFmpegFilterArgs,
  TARGET_WIDTH,
  TARGET_HEIGHT,
} from "@/lib/video-config";
import { generateThumbnail } from "@/lib/thumbnail-generator";
import { applyWatermark } from "@/lib/watermark";
import { applyIntroOutro } from "@/lib/intro-outro";
import { applyZoomEffect } from "@/lib/zoom-effect";
import type { ClipResult } from "@/db/schema";

const execAsync = promisify(exec);

const TMP_DIR = process.env.TMP_DIR || "/tmp/autoclip";

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// =====================================================================
// PLATFORM DETECTION
// =====================================================================
export function detectPlatform(url: string): string {
  if (/youtube\.com|youtu\.be/.test(url)) return "youtube";
  if (/facebook\.com|fb\.watch/.test(url)) return "facebook";
  if (/tiktok\.com/.test(url)) return "tiktok";
  if (/instagram\.com/.test(url)) return "instagram";
  return "unknown";
}

// =====================================================================
// DOWNLOAD
// =====================================================================
export async function downloadVideo(
  url: string,
  jobId: string,
  onProgress?: (pct: number) => Promise<void>
): Promise<{ filePath: string; title: string; duration: number }> {
  ensureDir(TMP_DIR);
  const outputTemplate = path.join(TMP_DIR, `${jobId}.%(ext)s`);

 // --- SET ARGUMEN UTAMA ---
  const cmdArgs = [
    "yt-dlp",
    "--no-playlist",
    "--js-runtimes", "node",
    "--impersonate", "chrome", 
    "--extractor-args", "youtube:player_client=android,ios",
    "--merge-output-format", "mp4",
    "-f", '"bestvideo[height<=1080]+bestaudio/best[height<=1080]/best"',
    "--progress",
    "--newline"
  ];

  // --- HANDLE COOKIES JIKA ADA ---
  let cookiePath = "";
  if (process.env.YOUTUBE_COOKIES) {
    cookiePath = path.join(TMP_DIR, "youtube-cookies.txt");
    // Tangani jika newline menjadi literal \n saat di-paste ke Railway
    const cookieContent = process.env.YOUTUBE_COOKIES.replace(/\\n/g, "\n");
    fs.writeFileSync(cookiePath, cookieContent);
    cmdArgs.push("--cookies", `"${cookiePath}"`);
  }

  cmdArgs.push("-o", `"${outputTemplate}"`, `"${url}"`);
  const cmd = cmdArgs.join(" ");

  console.log(`[download] Starting: ${url}`);
  await execAsync(cmd, { timeout: 600000 });
  if (onProgress) await onProgress(50);

  const files = fs.readdirSync(TMP_DIR).filter((f) => f.startsWith(jobId));
  if (!files.length) throw new Error("Download selesai tapi file tidak ditemukan");
  const filePath = path.join(TMP_DIR, files[0]);

  // --- SERTAKAN COOKIE UNTUK INFO METADATA JUGA ---
  let infoCmd = `yt-dlp --dump-json --no-playlist --impersonate chrome --extractor-args "youtube:player_client=android,ios"`;
  if (cookiePath) infoCmd += ` --cookies "${cookiePath}"`;
  infoCmd += ` "${url}"`;

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
    } catch {
      /* ignore */
    }
  }
  if (onProgress) await onProgress(100);
  console.log(`[download] ✅ Done: ${filePath} (${duration}s)`);
  return { filePath, title, duration };
}

// =====================================================================
// TRANSCRIPTION
// =====================================================================
export async function transcribeAudio(
  videoPath: string,
  language: string = "id"
): Promise<{ start: number; end: number; text: string }[]> {
  ensureDir(TMP_DIR);
  const audioPath = videoPath.replace(/\.[^.]+$/, "_audio.mp3");
  const extractCmd = `ffmpeg -y -i "${videoPath}" -vn -ar 16000 -ac 1 -b:a 32k "${audioPath}"`;
  await execAsync(extractCmd, { timeout: 60000 });

  try {
    const openaiKey = process.env.OPENAI_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;

    if (openaiKey) {
      return await transcribeWithOpenAI(audioPath, language, openaiKey);
    } else if (groqKey) {
      return await transcribeWithGroq(audioPath, language, groqKey);
    } else {
      console.warn("[transcribe] Tidak ada API key tersedia, skip transkripsi");
      return [];
    }
  } finally {
    try {
      if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
    } catch {
      /* ignore */
    }
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
  const data = response as unknown as {
    segments?: { start: number; end: number; text: string }[];
  };
  return (data.segments || []).map((s) => ({
    start: s.start,
    end: s.end,
    text: s.text.trim(),
  }));
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
    {
      headers: { Authorization: `Bearer ${apiKey}`, ...form.getHeaders() },
      timeout: 120000,
    }
  );
  const segments = response.data?.segments || [];
  return segments.map((s: { start: number; end: number; text: string }) => ({
    start: s.start,
    end: s.end,
    text: s.text.trim(),
  }));
}

// =====================================================================
// CLIP PROCESSING (Cut → Zoom → Watermark → Intro/Outro → Thumbnail)
// =====================================================================
export async function processClips(
  videoPath: string,
  clips: Omit<ClipResult, "filePath" | "thumbnailPath" | "youtubeVideoId" | "youtubeUrl">[],
  jobId: string,
  makeVertical: boolean = true,
  onProgress?: (clipIndex: number, total: number) => Promise<void>
): Promise<ClipResult[]> {
  ensureDir(TMP_DIR);
  const mode = makeVertical ? getAspectRatioMode() : "none";
  const results: ClipResult[] = [];

  for (let i = 0; i < clips.length; i++) {
    if (onProgress) await onProgress(i, clips.length);
    try {
      const result = await processSingleClip(videoPath, clips[i], mode, jobId, i);
      results.push(result);
    } catch (err) {
      console.error(`[clip] ❌ Klip ${i} gagal:`, err);
      results.push({
        ...clips[i],
        index: i,
        filePath: undefined,
        thumbnailPath: undefined,
      });
    }
  }

  return results;
}

async function processSingleClip(
  videoPath: string,
  clip: Omit<ClipResult, "filePath" | "thumbnailPath" | "youtubeVideoId" | "youtubeUrl">,
  mode: ReturnType<typeof getAspectRatioMode>,
  jobId: string,
  clipIndex: number
): Promise<ClipResult> {
  // Step 1: Cut + convert to 9:16
  const cutPath = path.join(TMP_DIR, `clip_cut_${jobId}_${clipIndex}.mp4`);
  await cutAndConvertClip(videoPath, clip.startTime, clip.endTime, cutPath, mode);
  console.log(`[clip] ✅ Step 1/4 Cut selesai: klip ${clipIndex}`);

  // Step 2: Zoom effect
  const zoomPath = path.join(TMP_DIR, `clip_zoom_${jobId}_${clipIndex}.mp4`);
  const zoomResult = await applyZoomEffect(cutPath, zoomPath, clip.viralScore);
  if (zoomResult.applied) {
    console.log(`[clip] ✅ Step 2/4 Zoom effect: ${zoomResult.reason}`);
    try { fs.unlinkSync(cutPath); } catch { /* ignore */ }
  } else {
    console.log(`[clip] ⏭ Step 2/4 Zoom skipped: ${zoomResult.reason}`);
  }
  const afterZoom = zoomResult.applied ? zoomPath : cutPath;

  // Step 3: Watermark
  const wmPath = path.join(TMP_DIR, `clip_wm_${jobId}_${clipIndex}.mp4`);
  const wmResult = await applyWatermark(afterZoom, wmPath);
  if (wmResult.type !== "none") {
    console.log(`[clip] ✅ Step 3/4 Watermark (${wmResult.type}): klip ${clipIndex}`);
    try { if (afterZoom !== cutPath) fs.unlinkSync(afterZoom); } catch { /* ignore */ }
  } else {
    console.log(`[clip] ⏭ Step 3/4 Watermark skipped`);
  }
  const afterWm = wmResult.success && wmResult.type !== "none" ? wmPath : afterZoom;

  // Step 4: Intro / Outro
  const finalPath = path.join(TMP_DIR, `clip_final_${jobId}_${clipIndex}.mp4`);
  const ioResult = await applyIntroOutro(afterWm, finalPath, `${jobId}_${clipIndex}`);
  if (ioResult.introAdded || ioResult.outroAdded) {
    console.log(
      `[clip] ✅ Step 4/4 Intro/Outro: intro=${ioResult.introAdded} outro=${ioResult.outroAdded}`
    );
    try { if (afterWm !== cutPath) fs.unlinkSync(afterWm); } catch { /* ignore */ }
  } else {
    console.log(`[clip] ⏭ Step 4/4 Intro/Outro skipped`);
  }

  const finalFile = ioResult.success ? finalPath : afterWm;

  if (finalFile !== finalPath && fs.existsSync(finalFile)) {
    try {
      fs.renameSync(finalFile, finalPath);
    } catch {
      fs.copyFileSync(finalFile, finalPath);
      try { fs.unlinkSync(finalFile); } catch { /* ignore */ }
    }
  }

  const usedFinalPath = fs.existsSync(finalPath) ? finalPath : finalFile;

  // Step 5: Thumbnail
  let thumbnailPath: string | undefined;
  if (fs.existsSync(usedFinalPath)) {
    const thumbResult = await generateThumbnail(usedFinalPath, TMP_DIR, clipIndex, clip.duration);
    if (thumbResult.success) thumbnailPath = thumbResult.thumbnailPath;
  }

  return {
    ...clip,
    index: clipIndex,
    filePath: usedFinalPath,
    thumbnailPath,
  };
}

async function cutAndConvertClip(
  inputPath: string,
  startTime: number,
  endTime: number,
  outputPath: string,
  mode: ReturnType<typeof getAspectRatioMode>
): Promise<void> {
  const duration = endTime - startTime;
  const { useFilterComplex, filterValue } = buildFFmpegFilterArgs(mode);

  let cmd: string;
  if (useFilterComplex) {
    cmd = [
      "ffmpeg",
      "-y",
      "-ss", startTime.toString(),
      "-t", duration.toString(),
      "-i", `"${inputPath}"`,
      "-filter_complex", `"${filterValue}"`,
      "-map", '"[out]"',
      "-map", "0:a?",
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
  } else {
    cmd = [
      "ffmpeg",
      "-y",
      "-ss", startTime.toString(),
      "-t", duration.toString(),
      "-i", `"${inputPath}"`,
      "-vf", `"${filterValue}"`,
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
  }

  await execAsync(cmd, { timeout: 300000 });
  if (!fs.existsSync(outputPath)) throw new Error("Cut clip file tidak terbuat");
}
