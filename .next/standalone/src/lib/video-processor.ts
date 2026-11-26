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
// 💬 Subtitle / Caption Burn-In (BARU!) — import terpisah, tidak mengubah import lain.
import { getSubtitleConfig } from "@/lib/subtitle-config";
import type { TranscriptSegmentWithWords, TranscriptWord } from "@/lib/subtitle-config";
import { applySubtitles, getClipWords } from "@/lib/subtitle-burner";
import type { ClipResult } from "@/db/schema";
// 🎯 Auto-Reframe Speaker Tracking (BARU!) — import terpisah, tidak
// mengubah import/fitur lain di atas. Lihat src/lib/auto-reframe.ts +
// src/lib/reframe-config.ts untuk detail & cara ganti/konfigurasi.
import { getAutoReframeConfig } from "@/lib/reframe-config";
import { buildReframeFilter } from "@/lib/auto-reframe";
import { applyHookOverlay } from "@/lib/hook-overlay"; // 🪝 AI Hook Overlay (BARU!)
import { checkAiBudget, recordAiUsage, getAudioSeconds } from "@/lib/cost-tracker"; // 💰 Cost Tracker (BARU!)
import { getGroqWhisperModel } from "@/lib/ai-provider";

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
  const cmd = [
      "yt-dlp",
      "--no-playlist",
      "--no-warnings",
      "--no-progress",
      "--merge-output-format", "mp4",
      "-f", '"bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]/best[ext=mp4]/best"',
      "--cookies", "cookies.txt",
      "--extractor-args", '"youtube:player_client=web_safari,web_embedded,-tv_downgraded"',
      "-o", `"${outputTemplate}"`,
      `"${url}"`,
    ].join(" ");

  console.log(`[download] Starting: ${url}`);

  await execAsync(cmd, { timeout: 600000, maxBuffer: 50 * 1024 * 1024 });

  if (onProgress) await onProgress(50);

  const files = fs.readdirSync(TMP_DIR).filter((f) => f.startsWith(jobId));
  if (!files.length) throw new Error("Download selesai tapi file tidak ditemukan");

  const filePath = path.join(TMP_DIR, files[0]);

  const infoCmd = `yt-dlp --cookies cookies.txt --extractor-args "youtube:player_client=android,ios" --dump-json --no-playlist "${url}"`;
  let title = "Video";
  let duration = 0;
  try {
    const { stdout } = await execAsync(infoCmd, { timeout: 30000, maxBuffer: 50 * 1024 * 1024 });
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
): Promise<TranscriptSegmentWithWords[]> {
  // 💰 Cost Tracker — batas biaya harian tercapai → skip transkripsi (job berjalan tetap lanjut tanpa transkrip).
  // Job yang sudah berjalan tidak terpengaruh (lolos pengecekan saat dimulai).
  const budget = await checkAiBudget();
  if (!budget.allowed) {
    console.warn("[transcribe] Batas biaya AI harian tercapai — transkripsi dilewati");
    return [];
  }

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

// 💬 Subtitle (BARU!) — minta timestamp per kata hanya kalau fitur subtitle aktif,
// supaya perilaku transkripsi lama tidak berubah saat SUBTITLE_ENABLED=false.
type RawWord = { word?: string; text?: string; start: number; end: number };

function attachWordsToSegments(
  segments: { start: number; end: number; text: string }[],
  rawWords: RawWord[] | undefined
): TranscriptSegmentWithWords[] {
  const result: TranscriptSegmentWithWords[] = segments.map((s) => ({
    start: s.start,
    end: s.end,
    text: s.text.trim(),
  }));
  if (!rawWords || !rawWords.length || !result.length) return result;

  for (const rw of rawWords) {
    const text = (rw.word ?? rw.text ?? "").trim();
    if (!text) continue;
    const mid = (rw.start + rw.end) / 2;
    let seg = result.find((s) => mid >= s.start - 0.05 && mid <= s.end + 0.05);
    if (!seg) {
      // pilih segmen terdekat
      seg = result.reduce((best, s) => {
        const d = Math.min(Math.abs(mid - s.start), Math.abs(mid - s.end));
        const bd = Math.min(Math.abs(mid - best.start), Math.abs(mid - best.end));
        return d < bd ? s : best;
      }, result[0]);
    }
    const w: TranscriptWord = { start: rw.start, end: rw.end, text };
    (seg.words ||= []).push(w);
  }
  return result;
}

/** Model Whisper OpenAI (juga dipakai Cost Tracker untuk menghitung harga). */
const OPENAI_WHISPER_MODEL = "whisper-1";

async function transcribeWithOpenAI(
  audioPath: string,
  language: string,
  apiKey: string
): Promise<TranscriptSegmentWithWords[]> {
  const wantWords = getSubtitleConfig().enabled;
  const OpenAI = (await import("openai")).default;
  const client = new OpenAI({ apiKey });
  const audioBuffer = fs.readFileSync(audioPath);
  const blob = new Blob([audioBuffer], { type: "audio/mp3" });
  const file = new File([blob], "audio.mp3", { type: "audio/mp3" });
  const response = await client.audio.transcriptions.create({
    model: OPENAI_WHISPER_MODEL,
    file,
    language: language === "id" ? "id" : language,
    response_format: "verbose_json",
    timestamp_granularities: wantWords ? ["segment", "word"] : ["segment"],
  });
  const data = response as unknown as {
    segments?: { start: number; end: number; text: string }[];
    words?: RawWord[];
    duration?: number;
  };
  // 💰 Cost Tracker — Whisper ditagih per durasi audio
  await recordAiUsage({
    provider: "openai",
    model: OPENAI_WHISPER_MODEL,
    feature: "transcribe",
    audioSeconds: typeof data.duration === "number" && data.duration > 0 ? data.duration : await getAudioSeconds(audioPath),
  });
  return attachWordsToSegments(data.segments || [], wantWords ? data.words : undefined);
}

async function transcribeWithGroq(
  audioPath: string,
  language: string,
  apiKey: string
): Promise<TranscriptSegmentWithWords[]> {
  const wantWords = getSubtitleConfig().enabled;
  const FormData = (await import("form-data")).default;
  const axios = (await import("axios")).default;
  const form = new FormData();
  form.append("file", fs.createReadStream(audioPath), { filename: "audio.mp3" });
  const groqWhisperModel = getGroqWhisperModel(); // env GROQ_WHISPER_MODEL (default whisper-large-v3)
  form.append("model", groqWhisperModel);
  form.append("language", language);
  form.append("response_format", "verbose_json");
  if (wantWords) {
    form.append("timestamp_granularities[]", "segment");
    form.append("timestamp_granularities[]", "word");
  }

  const response = await axios.post(
    "https://api.groq.com/openai/v1/audio/transcriptions",
    form,
    {
      headers: { Authorization: `Bearer ${apiKey}`, ...form.getHeaders() },
      timeout: 120000,
    }
  );
  const segments = response.data?.segments || [];
  // 💰 Cost Tracker — Whisper ditagih per durasi audio (Groq: minimal 10 detik/request)
  const reportedDuration = Number(response.data?.duration);
  await recordAiUsage({
    provider: "groq",
    model: groqWhisperModel,
    feature: "transcribe",
    audioSeconds: reportedDuration > 0 ? reportedDuration : await getAudioSeconds(audioPath),
  });
  return attachWordsToSegments(segments, wantWords ? response.data?.words : undefined);
}

// =====================================================================
// CLIP PROCESSING (Cut → Zoom → Watermark → Intro/Outro → Thumbnail)
// =====================================================================
export async function processClips(
  videoPath: string,
  clips: Omit<ClipResult, "filePath" | "thumbnailPath" | "youtubeVideoId" | "youtubeUrl">[],
  jobId: string,
  makeVertical: boolean = true,
  onProgress?: (clipIndex: number, total: number) => Promise<void>,
  // 💬 Subtitle (BARU!) — opsional; kalau tidak diisi, subtitle di-skip.
  transcript?: TranscriptSegmentWithWords[]
): Promise<ClipResult[]> {
  ensureDir(TMP_DIR);
  const mode = makeVertical ? getAspectRatioMode() : "none";
  const results: ClipResult[] = [];

  for (let i = 0; i < clips.length; i++) {
    if (onProgress) await onProgress(i, clips.length);
    try {
      const result = await processSingleClip(videoPath, clips[i], mode, jobId, i, transcript);
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
  clipIndex: number,
  transcript?: TranscriptSegmentWithWords[]
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
  const afterZoomRaw = zoomResult.applied ? zoomPath : cutPath;

  // Step 2b: 💬 Subtitle / Caption Burn-In (BARU!) — setelah zoom (caption tidak ikut
  // ter-zoom) & sebelum watermark/intro-outro. Gagal/dimatikan → klip lanjut apa adanya.
  const subPath = path.join(TMP_DIR, `clip_sub_${jobId}_${clipIndex}.mp4`);
  const subResult = await applySubtitles(
    afterZoomRaw,
    subPath,
    getClipWords(transcript, clip.startTime, clip.endTime)
  );
  if (subResult.applied) {
    console.log(`[clip] ✅ Subtitle (${subResult.wordCount} kata): klip ${clipIndex}`);
    try { fs.unlinkSync(afterZoomRaw); } catch { /* ignore */ }
  } else {
    console.log(`[clip] ⏭ Subtitle skipped (${subResult.reason})`);
  }
  const afterSub = subResult.applied ? subPath : afterZoomRaw;

  // Step 2c: 🪝 AI Hook Overlay (BARU!) — teks pembuka 1-2 detik pertama (hasil AI,
  // lihat src/lib/hook-config.ts). Sebelum watermark & intro/outro supaya t=0 = awal
  // klip. Gagal/dimatikan/tanpa hook → klip lanjut apa adanya.
  const hookPath = path.join(TMP_DIR, `clip_hook_${jobId}_${clipIndex}.mp4`);
  const hookResult = await applyHookOverlay(afterSub, hookPath, clip.hook);
  if (hookResult.applied) {
    console.log(`[clip] ✅ Hook overlay: klip ${clipIndex} → "${clip.hook}"`);
    try { fs.unlinkSync(afterSub); } catch { /* ignore */ }
  } else {
    console.log(`[clip] ⏭ Hook overlay skipped (${hookResult.reason})`);
  }
  const afterZoom = hookResult.applied ? hookPath : afterSub;

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

  // 🎯 Auto-Reframe Speaker Tracking (BARU!) — hanya aktif ketika mode
  // "crop" DAN AUTO_REFRAME_ENABLED=true. Semua mode lain (blur/pad/
  // stretch/none) berjalan persis seperti sebelumnya, tidak tersentuh.
  // Kalau deteksi wajah gagal/tidak ada wajah, otomatis fallback ke
  // crop statis yang sudah ada — proses tidak pernah gagal karena ini.
  let useFilterComplex: boolean;
  let filterValue: string;
  if (mode === "crop" && getAutoReframeConfig().enabled) {
    const reframed = await buildReframeFilter(inputPath, startTime, endTime);
    useFilterComplex = reframed.useFilterComplex;
    filterValue = reframed.filterValue;
    if (reframed.usedFallback) {
      console.log(`[auto-reframe] ⏭ Fallback ke crop statis (${reframed.reason})`);
    } else {
      console.log(`[auto-reframe] ✅ Dynamic crop mengikuti pembicara aktif`);
    }
  } else {
    ({ useFilterComplex, filterValue } = buildFFmpegFilterArgs(mode));
  }

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

  await execAsync(cmd, { timeout: 300000, maxBuffer: 50 * 1024 * 1024 });
  if (!fs.existsSync(outputPath)) throw new Error("Cut clip file tidak terbuat");
}
