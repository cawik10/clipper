import { exec, spawn } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import os from "os";
import { ClipResult } from "@/db/schema";
import type { TranscriptSegment } from "@/lib/ai-analyzer";

export type { TranscriptSegment };

const execAsync = promisify(exec);

// Use /tmp for Vercel (writable) or local temp
function getTempDir(): string {
  const tmpDir = process.env.TEMP_DIR || os.tmpdir();
  const dir = path.join(tmpDir, "autoclip");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function getJobDir(jobId: string): string {
  const dir = path.join(getTempDir(), jobId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function cleanupJobDir(jobId: string): void {
  const dir = path.join(getTempDir(), jobId);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// Detect platform from URL
export function detectPlatform(url: string): string {
  if (/youtube\.com|youtu\.be/.test(url)) return "youtube";
  if (/facebook\.com|fb\.watch/.test(url)) return "facebook";
  if (/tiktok\.com/.test(url)) return "tiktok";
  if (/instagram\.com/.test(url)) return "instagram";
  if (/twitter\.com|x\.com/.test(url)) return "twitter";
  return "unknown";
}

// Check if yt-dlp is available
async function checkYtDlp(): Promise<string> {
  const candidates = ["yt-dlp", "yt-dlp-bin", "python3 -m yt_dlp"];
  for (const cmd of candidates) {
    try {
      await execAsync(`${cmd} --version`);
      return cmd;
    } catch {
      // try next
    }
  }
  throw new Error("yt-dlp not found. Please install yt-dlp.");
}

// Check if ffmpeg is available
async function checkFFmpeg(): Promise<boolean> {
  try {
    await execAsync("ffmpeg -version");
    return true;
  } catch {
    return false;
  }
}

// Download video using yt-dlp
export async function downloadVideo(
  url: string,
  jobId: string,
  onProgress?: (progress: number) => void
): Promise<{ filePath: string; title: string; duration: number }> {
  const jobDir = getJobDir(jobId);
  const outputTemplate = path.join(jobDir, "source.%(ext)s");

  const ytDlp = await checkYtDlp();
  const hasFFmpeg = await checkFFmpeg();

  const args = [
    url,
    "--cookies", path.join(process.cwd(), "youtube-cookies.txt"),
    "-o", outputTemplate,
    "--format", hasFFmpeg
      ? "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best[height<=1080]/best"
      : "best[height<=720]/best",
    "--merge-output-format", "mp4",
    "--no-playlist",
    "--restrict-filenames",
    "--write-info-json",
    "--no-warnings",
    "--progress",
  ];

  return new Promise((resolve, reject) => {
    const proc = spawn(ytDlp.includes(" ") ? "python3" : ytDlp,
      ytDlp.includes(" ") ? ["-m", "yt_dlp", ...args] : args
    );

    let lastProgress = 0;

    proc.stdout.on("data", (data: Buffer) => {
      const text = data.toString();
      const progressMatch = text.match(/(\d+\.?\d*)%/);
      if (progressMatch && onProgress) {
        const progress = parseFloat(progressMatch[1]);
        if (progress > lastProgress) {
          lastProgress = progress;
          onProgress(progress);
        }
      }
    });

    proc.stderr.on("data", (data: Buffer) => {
      console.error("yt-dlp stderr:", data.toString().slice(0, 200));
    });

    proc.on("close", async (code) => {
      if (code !== 0) {
        reject(new Error(`yt-dlp exited with code ${code}`));
        return;
      }

      // Find the downloaded file
      const files = fs.readdirSync(jobDir);
      const videoFile = files.find((f) =>
        f.startsWith("source") && (f.endsWith(".mp4") || f.endsWith(".mkv") || f.endsWith(".webm"))
      );

      if (!videoFile) {
        reject(new Error("Downloaded video file not found"));
        return;
      }

      const filePath = path.join(jobDir, videoFile);

      // Read info JSON for title and duration
      const infoFile = files.find((f) => f.endsWith(".info.json"));
      let title = "Untitled Video";
      let duration = 0;

      if (infoFile) {
        try {
          const info = JSON.parse(fs.readFileSync(path.join(jobDir, infoFile), "utf-8"));
          title = info.title || title;
          duration = info.duration || 0;
        } catch {
          // ignore
        }
      }

      // If duration not from info, probe with ffprobe
      if (!duration && hasFFmpeg) {
        try {
          const { stdout } = await execAsync(
            `ffprobe -v quiet -print_format json -show_format "${filePath}"`
          );
          const probe = JSON.parse(stdout);
          duration = parseFloat(probe.format?.duration || "0");
        } catch {
          // ignore
        }
      }

      resolve({ filePath, title, duration });
    });

    proc.on("error", reject);
  });
}

// Transcribe audio using Whisper API or local method
export async function transcribeAudio(
  filePath: string,
  language?: string
): Promise<import("@/lib/ai-analyzer").TranscriptSegment[]> {
  // Extract audio first
  const audioPath = filePath.replace(/\.[^.]+$/, ".mp3");

  const hasFFmpeg = await checkFFmpeg();
  if (!hasFFmpeg) {
    console.warn("FFmpeg not available, skipping transcription");
    return [];
  }

  try {
    await execAsync(
      `ffmpeg -i "${filePath}" -vn -acodec mp3 -ab 128k -y "${audioPath}"`
    );
  } catch (err) {
    console.error("Audio extraction failed:", err);
    return [];
  }

  // Try OpenAI Whisper API
  if (process.env.OPENAI_API_KEY) {
    try {
      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const audioStream = fs.createReadStream(audioPath);
      const transcription = await openai.audio.transcriptions.create({
        file: audioStream as Parameters<typeof openai.audio.transcriptions.create>[0]["file"],
        model: "whisper-1",
        response_format: "verbose_json",
        timestamp_granularities: ["segment"],
        language: language || undefined,
      });

      // Clean up audio file
      if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);

      interface WhisperSegment {
        start: number;
        end: number;
        text: string;
      }

      if (transcription.segments) {
        return transcription.segments.map((seg: WhisperSegment) => ({
          start: seg.start,
          end: seg.end,
          text: seg.text.trim(),
        }));
      }
    } catch (err) {
      console.error("Whisper transcription failed:", err);
    }
  }

  // Groq Whisper fallback
  if (process.env.GROQ_API_KEY) {
    try {
      return await transcribeWithGroq(audioPath, language);
    } catch (err) {
      console.error("Groq transcription failed:", err);
    }
  }

  // Clean up
  if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);

  return [];
}

async function transcribeWithGroq(
  audioPath: string,
  language?: string
): Promise<import("@/lib/ai-analyzer").TranscriptSegment[]> {
  const FormData = (await import("form-data")).default;
  const axios = (await import("axios")).default;

  const form = new FormData();
  form.append("file", fs.createReadStream(audioPath));
  form.append("model", "whisper-large-v3");
  form.append("response_format", "verbose_json");
  if (language) form.append("language", language);

  const response = await axios.post(
    "https://api.groq.com/openai/v1/audio/transcriptions",
    form,
    {
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        ...form.getHeaders(),
      },
    }
  );

  if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);

  interface GroqSegment {
    start: number;
    end: number;
    text: string;
  }

  if (response.data.segments) {
    return response.data.segments.map((seg: GroqSegment) => ({
      start: seg.start,
      end: seg.end,
      text: seg.text.trim(),
    }));
  }

  return [];
}

// Cut video clip using FFmpeg
export async function cutVideoClip(
  sourceFile: string,
  startTime: number,
  endTime: number,
  outputPath: string,
  makeVertical: boolean = true
): Promise<string> {
  const hasFFmpeg = await checkFFmpeg();
  if (!hasFFmpeg) {
    throw new Error("FFmpeg is required for video cutting");
  }

  const duration = endTime - startTime;

  let filterComplex = "";
  if (makeVertical) {
    // Convert to 9:16 vertical (1080x1920) for Shorts
    filterComplex = [
      `-vf "scale=1080:1920:force_original_aspect_ratio=decrease,`,
      `pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,`,
      `setsar=1"`,
    ].join("");
  } else {
    filterComplex = `-vf "scale=trunc(iw/2)*2:trunc(ih/2)*2"`;
  }

  const cmd = [
    "ffmpeg",
    "-y",
    "-ss", startTime.toString(),
    "-i", `"${sourceFile}"`,
    "-t", duration.toString(),
    makeVertical ? filterComplex : filterComplex,
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "23",
    "-c:a", "aac",
    "-b:a", "128k",
    "-movflags", "+faststart",
    `"${outputPath}"`,
  ].join(" ");

  try {
    await execAsync(cmd, { timeout: 300000 }); // 5 minute timeout
    return outputPath;
  } catch (err) {
    console.error("FFmpeg cut failed:", err);
    throw new Error(`Video cutting failed: ${err}`);
  }
}

// Process all clips for a job
export async function processClips(
  sourceFile: string,
  clips: Omit<ClipResult, "filePath" | "youtubeVideoId" | "youtubeUrl">[],
  jobId: string,
  makeVertical: boolean = true,
  onProgress?: (clipIndex: number, total: number) => void
): Promise<ClipResult[]> {
  const jobDir = getJobDir(jobId);
  const results: ClipResult[] = [];

  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const outputPath = path.join(jobDir, `clip_${i}.mp4`);

    try {
      if (onProgress) onProgress(i, clips.length);
      await cutVideoClip(sourceFile, clip.startTime, clip.endTime, outputPath, makeVertical);
      results.push({ ...clip, filePath: outputPath });
    } catch (err) {
      console.error(`Failed to cut clip ${i}:`, err);
      results.push({ ...clip, filePath: undefined });
    }
  }

  return results;
}

// Get video duration with ffprobe
export async function getVideoDuration(filePath: string): Promise<number> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v quiet -print_format json -show_format "${filePath}"`
    );
    const probe = JSON.parse(stdout);
    return parseFloat(probe.format?.duration || "0");
  } catch {
    return 0;
  }
}
