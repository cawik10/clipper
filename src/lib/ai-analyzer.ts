import OpenAI from "openai";
import { ClipResult } from "@/db/schema";
import { getMaxClipsConfig } from "@/lib/video-config";

function getOpenAIClient(): OpenAI | null {
  if (process.env.OPENAI_API_KEY) {
    return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return null;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface VideoAnalysisInput {
  title: string;
  duration: number;
  transcript: TranscriptSegment[];
  platform?: string;
  language?: string;
}

export async function analyzeVideoForClips(
  input: VideoAnalysisInput,
  maxClips: number = getMaxClipsConfig(),
  minDuration = 20,
  maxDuration = 40
): Promise<Omit<ClipResult, "filePath" | "thumbnailPath">[]> {
  const openai = getOpenAIClient();
  const transcriptText = input.transcript
    .map((seg) => `[${formatTime(seg.start)}-${formatTime(seg.end)}] ${seg.text}`)
    .join("\n");

  const prompt = `Kamu adalah ahli konten viral YouTube Shorts. Analisis transkrip video berikut dan temukan ${maxClips} momen terbaik yang berpotensi viral.

INFORMASI VIDEO:
- Judul: ${input.title}
- Durasi Total: ${formatTime(input.duration)}
- Platform Sumber: ${input.platform || "YouTube"}
- Bahasa: ${input.language || "id"}

TRANSKRIP (format [MULAI-SELESAI] teks):
${transcriptText.slice(0, 8000)}

KRITERIA:
1. Hook kuat di awal
2. Konten emosional, mengejutkan, lucu, atau informatif
3. Kalimat lengkap dan bermakna
4. Durasi WAJIB antara ${minDuration}-${maxDuration} detik
5. Hindari intro/outro/iklan

Output JSON array (tanpa markdown):
[{"index":0,"startTime":0,"endTime":30,"duration":30,"title":"Judul #Shorts","description":"Deskripsi","tags":["shorts","viral"],"viralScore":8,"reason":"Alasan"}]`;

  if (openai) {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Kamu adalah ahli konten digital. Berikan output JSON yang valid." },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 3000,
        response_format: { type: "json_object" },
      });
      const content = response.choices[0]?.message?.content || "{}";
      try {
        const parsed = JSON.parse(content);
        const clips = Array.isArray(parsed) ? parsed : parsed.clips || parsed.moments || [];
        return validateAndFixClips(clips, input.duration, minDuration, maxDuration, maxClips);
      } catch {
        return fallbackAnalysis(input, maxClips, minDuration, maxDuration);
      }
    } catch (err) {
      console.error("OpenAI analysis failed:", err);
    }
  }

  if (process.env.GEMINI_API_KEY) {
    try {
      return await analyzeWithGemini(prompt, input, maxClips, minDuration, maxDuration);
    } catch (err) {
      console.error("Gemini analysis failed:", err);
    }
  }

  return fallbackAnalysis(input, maxClips, minDuration, maxDuration);
}

async function analyzeWithGemini(
  prompt: string,
  input: VideoAnalysisInput,
  maxClips: number,
  minDuration: number,
  maxDuration: number
): Promise<Omit<ClipResult, "filePath" | "thumbnailPath">[]> {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
  const result = await model.generateContent(prompt + "\n\nBALAS HANYA DENGAN JSON ARRAY.");
  const text = result.response.text();
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    const clips = JSON.parse(jsonMatch[0]);
    return validateAndFixClips(clips, input.duration, minDuration, maxDuration, maxClips);
  }
  return fallbackAnalysis(input, maxClips, minDuration, maxDuration);
}

function fallbackAnalysis(
  input: VideoAnalysisInput,
  maxClips: number,
  minDuration: number,
  maxDuration: number
): Omit<ClipResult, "filePath" | "thumbnailPath">[] {
  const { duration, transcript, title } = input;
  const targetDuration = Math.min(Math.max(30, minDuration), maxDuration);
  const clips: Omit<ClipResult, "filePath" | "thumbnailPath">[] = [];

  if (transcript.length === 0) {
    const segments = Math.min(maxClips, Math.floor(duration / targetDuration));
    const skipIntro = Math.min(30, duration * 0.1);
    const skipOutro = Math.min(30, duration * 0.1);
    const usableDuration = duration - skipIntro - skipOutro;
    const spacing = usableDuration / (segments + 1);
    for (let i = 0; i < segments; i++) {
      const start = skipIntro + spacing * (i + 1) - targetDuration / 2;
      const end = Math.min(duration - skipOutro, start + targetDuration);
      clips.push({
        index: i, startTime: Math.round(Math.max(0, start)), endTime: Math.round(end),
        duration: Math.round(end - Math.max(0, start)),
        title: `${title.slice(0, 40)} - Bagian ${i + 1} #Shorts`,
        description: `Klip ${i + 1} dari video ${title}`,
        tags: ["shorts", "viral", "trending"],
        viralScore: 7,
        reason: "Dipilih secara merata dari video (tanpa transkripsi)",
      });
    }
    return clips;
  }

  const scores = scoreTranscriptSegments(transcript);
  const selected = selectTopSegments(scores, transcript, maxClips, targetDuration, minDuration, maxDuration, duration);
  selected.forEach((seg, i) => {
    const segText = transcript.filter((t) => t.start >= seg.start && t.end <= seg.end).map((t) => t.text).join(" ");
    clips.push({
      index: i, startTime: Math.round(seg.start), endTime: Math.round(seg.end),
      duration: Math.round(seg.end - seg.start),
      title: generateTitle(segText, title, i),
      description: generateDescription(segText),
      tags: generateTags(segText, title),
      viralScore: seg.score,
      reason: "Dipilih berdasarkan analisis konten transkrip",
    });
  });
  return clips;
}

function scoreTranscriptSegments(
  transcript: TranscriptSegment[]
): { start: number; end: number; score: number }[] {
  const viralKeywords = [
    "rahasia", "ternyata", "mengejutkan", "viral", "tips", "cara", "trik",
    "luar biasa", "incredible", "amazing", "wow", "surprising", "secret",
    "never", "always", "best", "worst", "most", "truth", "fact", "myth",
    "hack", "top", "number", "percent", "jangan", "harus", "wajib", "penting",
    "terbesar", "terbaik", "pertama", "satu-satunya",
  ];
  return transcript.map((seg) => {
    let score = 5;
    const text = seg.text.toLowerCase();
    viralKeywords.forEach((kw) => { if (text.includes(kw)) score += 1; });
    if (text.includes("?")) score += 1;
    if (text.includes("!")) score += 0.5;
    if (/\d+%|\d+ juta|\d+ ribu|\d+ billion/.test(text)) score += 1;
    return { start: seg.start, end: seg.end, score: Math.min(score, 10) };
  });
}

function selectTopSegments(
  scores: { start: number; end: number; score: number }[],
  transcript: TranscriptSegment[],
  maxClips: number,
  targetDuration: number,
  minDuration: number,
  maxDuration: number,
  videoDuration: number
): { start: number; end: number; score: number }[] {
  const selected: { start: number; end: number; score: number }[] = [];
  const sorted = [...scores].sort((a, b) => b.score - a.score);

  for (const seg of sorted) {
    if (selected.length >= maxClips) break;
    const center = (seg.start + seg.end) / 2;
    let start = Math.max(0, center - targetDuration / 2);
    let end = start + targetDuration;
    if (end > videoDuration) { end = videoDuration; start = Math.max(0, end - targetDuration); }

    const actualDuration = end - start;
    if (actualDuration < minDuration || actualDuration > maxDuration + 5) continue;

    const hasOverlap = selected.some((s) => !(end <= s.start || start >= s.end));
    if (hasOverlap) continue;

    const transcriptStart = transcript.find((t) => t.start >= start - 2);
    const transcriptEnd = [...transcript].reverse().find((t) => t.end <= end + 2);
    let finalStart = start;
    let finalEnd = end;
    if (transcriptStart) finalStart = Math.max(0, transcriptStart.start);
    if (transcriptEnd) finalEnd = Math.min(videoDuration, transcriptEnd.end);

    const finalDuration = finalEnd - finalStart;
    if (finalDuration < minDuration || finalDuration > maxDuration + 5) {
      selected.push({ start, end, score: seg.score });
    } else {
      selected.push({ start: finalStart, end: finalEnd, score: seg.score });
    }
  }

  return selected.sort((a, b) => a.start - b.start);
}

function validateAndFixClips(
  clips: Partial<ClipResult>[],
  videoDuration: number,
  minDuration: number,
  maxDuration: number,
  maxClips?: number
): Omit<ClipResult, "filePath" | "thumbnailPath">[] {
  const limit = maxClips ?? getMaxClipsConfig();
  return clips
    .filter((c) => c.startTime !== undefined && c.endTime !== undefined)
    .map((clip, i) => {
      const start = Math.max(0, Number(clip.startTime) || 0);
      let end = Math.min(videoDuration, Number(clip.endTime) || start + 30);
      const duration = end - start;
      if (duration < minDuration) end = Math.min(videoDuration, start + minDuration);
      if (duration > maxDuration) end = start + maxDuration;
      return {
        index: i,
        startTime: Math.round(start),
        endTime: Math.round(end),
        duration: Math.round(end - start),
        title: clip.title || `Clip ${i + 1} #Shorts`,
        description: clip.description || "",
        tags: Array.isArray(clip.tags) ? clip.tags : ["shorts"],
        viralScore: Number(clip.viralScore) || 7,
        reason: clip.reason || "AI-selected moment",
      };
    })
    .slice(0, limit);
}

function generateTitle(text: string, videoTitle: string, index: number): string {
  const words = text.split(" ").slice(0, 8).join(" ");
  const opts = [
    `${words}... #Shorts`,
    `Fakta Mengejutkan: ${words.slice(0, 30)} #Shorts`,
    `${videoTitle.slice(0, 30)} - Bagian ${index + 1} #Shorts`,
  ];
  return opts[index % opts.length].slice(0, 70);
}

function generateDescription(text: string): string {
  return text.slice(0, 120) + (text.length > 120 ? "..." : "");
}

function generateTags(text: string, videoTitle: string): string[] {
  const baseTags = ["shorts", "viral", "trending", "fyp"];
  const titleWords = videoTitle.split(" ").filter((w) => w.length > 3).map((w) => w.toLowerCase()).slice(0, 3);
  return [...baseTags, ...titleWords].slice(0, 8);
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
