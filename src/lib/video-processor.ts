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
  type AspectRatioMode,
} from "@/lib/video-config";
import { generateThumbnail } from "@/lib/thumbnail-generator";
import { applyWatermark } from "@/lib/watermark";
import { applyIntroOutro } from "@/lib/intro-outro";
import { applyZoomEffect } from "@/lib/zoom-effect";
import { hasGroq, hasGemini, getGroqWhisperModel, getGeminiModel } from "@/lib/ai-provider";
import type { ClipResult } from "@/db/schema";

const execAsync = promisify(exec);

const TMP_DIR = process.env.TMP_DIR || "/tmp/autoclip";

const DOWNLOAD_DIR = "/tmp/autoclip";

function getVideoDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    exec(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
      (err, stdout) => {
        if (err) return reject(err);
        const duration = parseFloat(stdout.trim());
        if (isNaN(duration)) return reject(new Error("Gagal membaca durasi video"));
        resolve(duration);
      }
    );
  });
}

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
  onProgress?: (percent: number, rawOutput: string) => void
): Promise<{ filePath: string; title: string; duration: number }> {
  if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  }

  const outputTemplate = path.join(DOWNLOAD_DIR, `${jobId}.%(ext)s`);
  const hasCookies =
    fs.existsSync("cookies.txt") &&
    fs.readFileSync("cookies.txt", "utf-8").trim().length > 0;

  // `--print` menuliskan judul video ke stdout dengan prefix unik supaya
  // mudah diekstrak dari log tanpa perlu request terpisah ke yt-dlp.
  const baseFlags = [
    "--no-playlist",
    "--merge-output-format mp4",
    '-f "bestvideo[height<=1080]+bestaudio/best[height<=1080]/best"',
    "--socket-timeout 30",
    "--concurrent-fragments 4",
    "--progress",
    "--newline",
    `--print "AUTOCLIP_TITLE::%(title)s"`,
    `-o "${outputTemplate}"`,
  ];

  // Strategi 1: Menggunakan Cookies & Client Web
  // Strategi 1: Menggunakan Cookies & Client iOS / Web
  const cmdWithCookies = [
    "yt-dlp",
    ...baseFlags,
    hasCookies ? "--cookies cookies.txt" : "",
    '--extractor-args "youtube:player_client=ios,web,mweb"',
    `"${url}"`,
  ]
    .filter(Boolean)
    .join(" ");

  // Strategi 2 (Fallback): Client iOS / TV tanpa cookies jika cookie kadaluwarsa
  const cmdWithoutCookies = [
    "yt-dlp",
    ...baseFlags,
    '--extractor-args "youtube:player_client=ios,android,tv_embedded"',
    '--user-agent "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"',
    `"${url}"`,
  ].join(" ");

  const executeDownload = async (command: string) => {
    return new Promise<{ filePath: string; title: string; duration: number }>((resolve, reject) => {
      let stderrText = "";
      let stdoutText = "";

      const proc = exec(command, {
        maxBuffer: 1024 * 1024 * 50,
        timeout: 300000,
      });

      proc.stdout?.on("data", (data: Buffer) => {
        const text = data.toString();
        stdoutText += text;
        const match = text.match(/\[download\]\s+(\d+\.\d+)%/);
        if (match && onProgress) {
          onProgress(parseFloat(match[1]), text);
        }
      });

      proc.stderr?.on("data", (data: Buffer) => {
        stderrText += data.toString();
      });

      proc.on("close", async (code) => {
        if (code !== 0) {
          return reject(
            new Error(`yt-dlp exited with code ${code}: ${stderrText.trim()}`)
          );
        }
        const files = fs
          .readdirSync(DOWNLOAD_DIR)
          .filter((f) => f.startsWith(jobId));
        if (!files.length) {
          return reject(new Error("File hasil download tidak ditemukan"));
        }
        const downloadedFile = path.join(DOWNLOAD_DIR, files[0]);
        const titleMatch = stdoutText.match(/AUTOCLIP_TITLE::(.+)/);
        const title = titleMatch ? titleMatch[1].trim().slice(0, 200) : "Video Tanpa Judul";
        try {
          const duration = await getVideoDuration(downloadedFile);
          resolve({ filePath: downloadedFile, title, duration });
        } catch (err) {
          reject(err);
        }
      });

      proc.on("error", (err) => reject(err));
    });
  };

  try {
    console.log(`[downloadVideo] Memulai unduhan (Percobaan 1)...`);
    return await executeDownload(cmdWithCookies);
  } catch (firstErr) {
    const firstErrMsg = firstErr instanceof Error ? firstErr.message : String(firstErr);
    console.warn(`[downloadVideo] Percobaan 1 gagal (${firstErrMsg}). Mencoba Fallback (Percobaan 2)...`);
    try {
      return await executeDownload(cmdWithoutCookies);
    } catch (secondErr) {
      const secondErrMsg = secondErr instanceof Error ? secondErr.message : String(secondErr);
      throw new Error(`Gagal mengunduh video setelah percobaan fallback: ${secondErrMsg}`);
    }
  }
}

// =====================================================================
// TRANSCRIPTION
// =====================================================================
export async function transcribeAudio(
  videoPath: string,
  language: string = "id",
  durationSeconds: number = 0
): Promise<{ start: number; end: number; text: string }[]> {
  ensureDir(TMP_DIR);
  const audioPath = videoPath.replace(/\.[^.]+$/, "_audio.mp3");
  const extractCmd = `ffmpeg -y -i "${videoPath}" -vn -ar 16000 -ac 1 -b:a 32k "${audioPath}"`;
  await execAsync(extractCmd, { timeout: 60000 });

  // 🎙️ Prioritas: Groq Whisper (cepat, timestamp akurat per-kalimat) →
  // fallback Gemini (multimodal audio, timestamp diperkirakan merata).
  // ChatGPT/OpenAI Whisper TIDAK dipakai lagi (sesuai permintaan) — kalau
  // ingin ganti provider/model, lihat src/lib/ai-provider.ts.
  try {
    if (hasGroq()) {
      try {
        const result = await transcribeWithGroq(audioPath, language);
        if (result.length) return result;
      } catch (err) {
        console.warn("[transcribe] Groq Whisper gagal, mencoba Gemini...", err);
      }
    }

    if (hasGemini()) {
      try {
        const result = await transcribeWithGemini(audioPath, language, durationSeconds);
        if (result.length) return result;
      } catch (err) {
        console.warn("[transcribe] Gemini transcription gagal:", err);
      }
    }

    console.warn("[transcribe] Tidak ada provider AI yang berhasil, lanjut tanpa transkrip.");
    return [];
  } finally {
    try {
      if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
    } catch {
      /* ignore */
    }
  }
}

async function transcribeWithGroq(
  audioPath: string,
  language: string
): Promise<{ start: number; end: number; text: string }[]> {
  const FormData = (await import("form-data")).default;
  const axios = (await import("axios")).default;
  const form = new FormData();
  form.append("file", fs.createReadStream(audioPath), { filename: "audio.mp3" });
  form.append("model", getGroqWhisperModel());
  form.append("language", language);
  form.append("response_format", "verbose_json");

  const response = await axios.post(
    "https://api.groq.com/openai/v1/audio/transcriptions",
    form,
    {
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, ...form.getHeaders() },
      timeout: 120000,
    }
  );
  const segments = response.data?.segments || [];
  return segments.map((s: { start: number; end: number; text: string }) => ({
    start: s.start,
    end: s.end,
    text: (s.text || "").trim(),
  }));
}

/**
 * Fallback transkripsi via Gemini (multimodal audio understanding). Gemini
 * tidak memberi timestamp per-kata seperti Whisper, jadi transkrip dibagi
 * menjadi beberapa "segmen semu" yang disebar merata sepanjang durasi video
 * supaya tetap kompatibel dengan AI analyzer yang memakai rentang waktu.
 */
async function transcribeWithGemini(
  audioPath: string,
  language: string,
  durationSeconds: number
): Promise<{ start: number; end: number; text: string }[]> {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({ model: getGeminiModel() });
  const audioBuffer = fs.readFileSync(audioPath);

  const langLabel = language === "id" ? "Indonesia" : language;
  const result = await model.generateContent([
    { inlineData: { data: audioBuffer.toString("base64"), mimeType: "audio/mp3" } },
    {
      text:
        `Transkrip audio ini ke teks bahasa ${langLabel} secara lengkap dan akurat, kata demi kata. ` +
        `Balas HANYA dengan teks transkripnya saja, tanpa komentar/pembuka/penutup tambahan.`,
    },
  ]);
  const text = (result.response?.text() || "").trim();
  if (!text) return [];

  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
  if (!sentences.length) return [];

  const total = durationSeconds > 0 ? durationSeconds : Math.max(30, sentences.length * 4);
  const step = total / sentences.length;

  return sentences.map((sentence, i) => ({
    start: Math.round(i * step),
    end: Math.round(Math.min(total, (i + 1) * step)),
    text: sentence.trim(),
  }));
}

// =====================================================================
// CLIP PROCESSING (Cut → Zoom → Watermark → Intro/Outro → Thumbnail)
// =====================================================================

/**
 * Potong & proses semua momen hasil AI analysis menjadi klip final.
 *   - `makeVertical=true`  → konversi ke 9:16 sesuai ASPECT_RATIO_MODE
 *     (lihat src/lib/video-config.ts), lalu tambahkan zoom/watermark/
 *     intro-outro/thumbnail sesuai konfigurasi aktif.
 *   - `makeVertical=false` → video dibiarkan pada rasio aslinya ("Original
 *     (Keep Ratio)" di tombol Telegram), tahapan lain tetap berjalan.
 */
export async function processClips(
  filePath: string,
  moments: Array<Omit<ClipResult, "filePath" | "thumbnailPath" | "youtubeVideoId" | "youtubeUrl">>,
  jobId: string,
  makeVertical: boolean = true,
  onProgress?: (clipIndex: number, total: number) => void | Promise<void>
): Promise<ClipResult[]> {
  ensureDir(TMP_DIR);
  const mode = makeVertical ? getAspectRatioMode() : "none";
  const results: ClipResult[] = [];

  for (let i = 0; i < moments.length; i++) {
    try {
      const result = await processSingleClip(filePath, moments[i], mode, jobId, i);
      results.push(result);
    } catch (err) {
      console.error(`[clip] ❌ Klip ${i} gagal diproses:`, err);
    }
    if (onProgress) await onProgress(i, moments.length);
  }

  if (results.length === 0) {
    throw new Error("Semua klip gagal diproses");
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
  // Step 1: Cut + convert aspect ratio
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

/**
 * Potong video sumber pada rentang [startTime, endTime] lalu konversi sesuai
 * `aspectRatioMode` (blur | crop | pad | stretch | none). Logika filter FFmpeg
 * diambil dari src/lib/video-config.ts (`buildFFmpegFilterArgs`) supaya semua
 * mode 9:16 konsisten dengan dokumentasi env var `ASPECT_RATIO_MODE`.
 */
export async function cutAndConvertClip(
  inputPath: string,
  startTime: number,
  endTime: number,
  outputPath: string,
  aspectRatioMode: AspectRatioMode | string = "blur"
): Promise<string> {
  const duration = Math.max(1, Math.abs(endTime - startTime));
  const mode = (Object.prototype.hasOwnProperty.call(
    { blur: 1, crop: 1, pad: 1, stretch: 1, none: 1 },
    aspectRatioMode
  )
    ? aspectRatioMode
    : "blur") as AspectRatioMode;

  const { useFilterComplex, filterValue } = buildFFmpegFilterArgs(mode);

  const videoArgs = useFilterComplex
    ? `-filter_complex "${filterValue}" -map "[out]" -map 0:a?`
    : `-vf "${filterValue}" -map 0:v:0 -map 0:a?`;

  const ffmpegCmd =
    `ffmpeg -y -ss ${startTime} -t ${duration} -i "${inputPath}" ${videoArgs} ` +
    `-threads 2 -c:v libx264 -crf 23 -preset fast -c:a aac -ar 44100 -ac 2 -pix_fmt yuv420p "${outputPath}"`;

  return new Promise((resolve, reject) => {
    exec(ffmpegCmd, { timeout: 120000, maxBuffer: 1024 * 1024 * 20 }, (err, _stdout, stderr) => {
      if (err) reject(new Error(`ffmpeg gagal memotong klip: ${err.message}\n${String(stderr).slice(-500)}`));
      else resolve(outputPath);
    });
  });
}
