import OpenAI from "openai";
import { ClipResult } from "@/db/schema";

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
  maxClips: number = 3,
  minDuration: number = 20,
  maxDuration: number = 40
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

KRITERIA SELEKSI MOMEN VIRAL:
1. Hook kuat di awal (3 detik pertama harus menarik)
2. Konten emosional, mengejutkan, lucu, atau informatif
3. Kalimat yang lengkap dan bermakna
4. Cocok untuk format vertikal 9:16
5. Durasi WAJIB antara ${minDuration}-${maxDuration} detik
6. Hindari momen intro/outro atau iklan
7. Prioritaskan: puncak emosi, reveal penting, poin mengejutkan

INSTRUKSI:
- Setiap klip harus memiliki durasi antara ${minDuration} dan ${maxDuration} detik
- Pilih momen yang bisa berdiri sendiri tanpa konteks sebelumnya
- Buat judul YouTube Shorts yang menarik (max 70 karakter)
- Buat deskripsi singkat (max 150 karakter)
- Berikan tags relevan (5-10 tags)

Output JSON array (tanpa markdown):
[
  {
    "index": 0,
    "startTime": <number>,
    "endTime": <number>,
    "duration": <number>,
    "title": "<judul menarik> #Shorts",
    "description": "<deskripsi>",
    "tags": ["tag1", "tag2"],
    "viralScore": <1-10>,
    "reason": "<alasan>"
  }
]`;

  if (openai) {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "Kamu adalah ahli konten digital. Berikan output JSON yang valid.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 2000,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content || "{}";
      try {
        const parsed = JSON.parse(content);
        const clips = Array.isArray(parsed) ? parsed : parsed.clips || parsed.moments || [];
        return validateAndFixClips(clips, input.duration, minDuration, maxDuration);
      } catch {
        return fallbackAnalysis(input, maxClips, minDuration, maxDuration);
      }
    } catch (err) {
      console.error("OpenAI analysis failed:", err);
    }
  }

  // Gemini fallback
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
    return validateAndFixClips(clips, input.duration, minDuration, maxDuration);
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
      const end = start + targetDuration;
      clips.push({
        index: i,
        startTime: Math.round(Math.max(0, start)),
        endTime: Math.round(Math.min(duration, end)),
        duration: targetDuration,
        title: `${title.slice(0, 40)} - Klip ${i + 1} #Shorts`,
        description: `Momen terbaik dari ${title.slice(0, 60)}`,
        tags: ["shorts", "viral", "trending"],
        viralScore: 6,
        reason: "Dipilih berdasarkan pembagian waktu merata",
      });
    }
    return clips;
  }

  const scores = scoreTranscriptSegments(transcript);
  const selected = selectTopSegments(scores, transcript, maxClips, targetDuration, minDuration, maxDuration, duration);

  selected.forEach((seg, i) => {
    const segText = transcript
      .filter((t) => t.start >= seg.start && t.end <= seg.end)
      .map((t) => t.text)
      .join(" ");
    clips.push({
      index: i,
      startTime: Math.round(seg.start),
      endTime: Math.round(seg.end),
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
    "hack", "top", "number", "percent", "jangan", "harus", "wajib",
    "penting", "terbesar", "terbaik", "pertama", "satu-satunya",
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
    if (end > videoDuration) {
      end = videoDuration;
      start = Math.max(0, end - targetDuration);
    }
    const actualDuration = end - start;
    if (actualDuration < minDuration || actualDuration > maxDuration + 5) continue;

    const hasOverlap = selected.some((s) => !(end <= s.start || start >= s.end));
    if (hasOverlap) continue;

    const transcriptStart = transcript.find((t) => t.start >= start - 2);
    const transcriptEnd = [...transcript].reverse().find((t) => t.end <= end + 2);
    const finalStart = transcriptStart ? Math.max(0, transcriptStart.start) : start;
    const finalEnd = transcriptEnd ? Math.min(videoDuration, transcriptEnd.end) : end;
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
  maxDuration: number
): Omit<ClipResult, "filePath" | "thumbnailPath">[] {
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
    .slice(0, 5);
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
  const titleWords = videoTitle
    .split(" ")
    .filter((w) => w.length > 3)
    .map((w) => w.toLowerCase())
    .slice(0, 3);
  return [...baseTags, ...titleWords].slice(0, 8);
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export async function generateShortsTitle(
  clipContent: string,
  videoContext: string,
  language: string = "id"
): Promise<string> {
  const openai = getOpenAIClient();
  const prompt = `Buat judul YouTube Shorts yang viral (maks 70 karakter) untuk klip:
Konten: ${clipContent}
Konteks: ${videoContext}
Bahasa: ${language === "id" ? "Indonesia" : "English"}
Kriteria: gunakan angka jika relevan, kata hook (Ternyata, Rahasia, SHOCKING), pertanyaan, tambah #Shorts.
Hanya judul, tanpa penjelasan.`;

  if (openai) {
    try {
      const res = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.8,
        max_tokens: 100,
      });
      return res.choices[0]?.message?.content?.trim() || `${clipContent.slice(0, 50)} #Shorts`;
    } catch { /* fallthrough */ }
  }

  return `${videoContext.slice(0, 45)} - Momen Viral #Shorts`;
}
