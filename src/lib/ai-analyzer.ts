import OpenAI from "openai";
import { ClipResult } from "@/db/schema";

// Use OpenAI or Google Gemini for analysis
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
): Promise<Omit<ClipResult, "filePath" | "youtubeVideoId" | "youtubeUrl">[]> {
  const openai = getOpenAIClient();

  // Build transcript text with timestamps
  const transcriptText = input.transcript
    .map((seg) => `[${formatTime(seg.start)}-${formatTime(seg.end)}] ${seg.text}`)
    .join("\n");

  const prompt = `Kamu adalah ahli konten viral YouTube Shorts. Analisis transkrip video berikut dan temukan ${maxClips} momen terbaik yang berpotensi viral di YouTube Shorts.

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
3. Kalimat yang lengkap dan bermakna (tidak terpotong di tengah)
4. Cocok untuk format vertikal 9:16 (fokus speaker/visual)
5. Durasi WAJIB antara ${minDuration}-${maxDuration} detik
6. Hindari momen intro/outro atau iklan
7. Prioritaskan: puncak emosi, reveal penting, poin yang mengejutkan

INSTRUKSI:
- Setiap klip harus memiliki durasi antara ${minDuration} dan ${maxDuration} detik
- Pilih momen yang bisa berdiri sendiri tanpa konteks sebelumnya
- Pastikan startTime dan endTime akurat sesuai transkrip
- Buat judul YouTube Shorts yang menarik (max 70 karakter, gunakan hook/pertanyaan/angka)
- Buat deskripsi singkat yang menarik (max 150 karakter)
- Berikan tags relevan (5-10 tags)

Berikan output dalam format JSON array berikut (tanpa markdown, hanya JSON murni):
[
  {
    "index": 0,
    "startTime": <detik>,
    "endTime": <detik>,
    "duration": <detik>,
    "title": "<judul menarik untuk YouTube Shorts>",
    "description": "<deskripsi singkat>",
    "tags": ["tag1", "tag2", "tag3"],
    "viralScore": <1-10>,
    "reason": "<alasan momen ini viral>"
  }
]`;

  if (openai) {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "Kamu adalah ahli konten digital dan analis video viral. Berikan output JSON yang valid dan akurat.",
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
        const clips = Array.isArray(parsed) ? parsed : (parsed.clips || parsed.moments || []);
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

  // Fallback: rule-based analysis
  return fallbackAnalysis(input, maxClips, minDuration, maxDuration);
}

async function analyzeWithGemini(
  prompt: string,
  input: VideoAnalysisInput,
  maxClips: number,
  minDuration: number,
  maxDuration: number
): Promise<Omit<ClipResult, "filePath" | "youtubeVideoId" | "youtubeUrl">[]> {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const result = await model.generateContent(prompt + "\n\nBALAS HANYA DENGAN JSON ARRAY, TANPA MARKDOWN.");
  const text = result.response.text();

  // Extract JSON from response
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
): Omit<ClipResult, "filePath" | "youtubeVideoId" | "youtubeUrl">[] {
  const { duration, transcript, title } = input;
  const targetDuration = Math.min(Math.max(30, minDuration), maxDuration);
  const clips: Omit<ClipResult, "filePath" | "youtubeVideoId" | "youtubeUrl">[] = [];

  if (transcript.length === 0) {
    // No transcript - divide video into equal parts
    const segments = Math.min(maxClips, Math.floor(duration / targetDuration));
    const skipIntro = Math.min(30, duration * 0.1);
    const skipOutro = Math.min(30, duration * 0.1);
    const usableDuration = duration - skipIntro - skipOutro;
    const spacing = usableDuration / (segments + 1);

    for (let i = 0; i < segments; i++) {
      const start = skipIntro + spacing * (i + 0.5) - targetDuration / 2;
      const end = start + targetDuration;
      clips.push({
        index: i,
        startTime: Math.round(Math.max(0, start)),
        endTime: Math.round(Math.min(duration, end)),
        duration: targetDuration,
        title: `${title} - Bagian ${i + 1} #Shorts`,
        description: `Momen menarik dari video "${title}"`,
        tags: ["shorts", "viral", "trending"],
        viralScore: 6,
        reason: "Dipilih berdasarkan distribusi merata video",
      });
    }
    return clips;
  }

  // With transcript - find high-energy segments
  const segmentScores = scoreTranscriptSegments(transcript);
  const topSegments = selectTopSegments(
    segmentScores,
    transcript,
    maxClips,
    targetDuration,
    minDuration,
    maxDuration,
    duration
  );

  topSegments.forEach((seg, i) => {
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
    "never", "always", "best", "worst", "most", "least", "first", "last",
    "truth", "lie", "fact", "myth", "hack", "top", "number", "percent",
    "jangan", "harus", "wajib", "penting", "terbesar", "terbaik",
    "pertama", "satu-satunya", "tidak pernah", "selalu",
  ];

  return transcript.map((seg) => {
    let score = 5;
    const text = seg.text.toLowerCase();

    viralKeywords.forEach((kw) => {
      if (text.includes(kw)) score += 1;
    });

    // Boost for questions
    if (text.includes("?")) score += 1;
    // Boost for exclamations
    if (text.includes("!")) score += 0.5;
    // Boost for numbers/statistics
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

    // Expand segment to target duration
    const center = (seg.start + seg.end) / 2;
    let start = Math.max(0, center - targetDuration / 2);
    let end = start + targetDuration;

    if (end > videoDuration) {
      end = videoDuration;
      start = Math.max(0, end - targetDuration);
    }

    const actualDuration = end - start;
    if (actualDuration < minDuration) continue;
    if (actualDuration > maxDuration) {
      end = start + maxDuration;
    }

    // Check overlap with already selected
    const hasOverlap = selected.some(
      (s) => !(end <= s.start || start >= s.end)
    );
    if (hasOverlap) continue;

    // Align to transcript boundaries
    const transcriptStart = transcript.find((t) => t.start >= start - 2);
    const transcriptEnd = [...transcript].reverse().find((t) => t.end <= end + 2);

    const finalStart = transcriptStart
      ? Math.max(0, transcriptStart.start - 0.5)
      : start;
    const finalEnd = transcriptEnd
      ? Math.min(videoDuration, transcriptEnd.end + 0.5)
      : end;

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
): Omit<ClipResult, "filePath" | "youtubeVideoId" | "youtubeUrl">[] {
  return clips
    .filter((c) => c.startTime !== undefined && c.endTime !== undefined)
    .map((clip, i) => {
      const start = Math.max(0, Number(clip.startTime) || 0);
      let end = Math.min(videoDuration, Number(clip.endTime) || start + 30);
      const duration = end - start;

      // Fix duration constraints
      if (duration < minDuration) {
        end = Math.min(videoDuration, start + minDuration);
      }
      if (duration > maxDuration) {
        end = start + maxDuration;
      }

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
  const titleOptions = [
    `${words}... #Shorts`,
    `Fakta Mengejutkan: ${words.slice(0, 30)} #Shorts`,
    `${videoTitle.slice(0, 30)} - Bagian ${index + 1} #Shorts`,
  ];
  return titleOptions[index % titleOptions.length].slice(0, 70);
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

// Generate attractive YouTube Shorts title using AI
export async function generateShortsTitle(
  clipContent: string,
  videoContext: string,
  language: string = "id"
): Promise<string> {
  const openai = getOpenAIClient();

  const prompt = `Buat judul YouTube Shorts yang viral dan menarik perhatian (maksimal 70 karakter) untuk klip berikut:

Konten Klip: ${clipContent}
Konteks Video: ${videoContext}
Bahasa: ${language === "id" ? "Indonesia" : "English"}

Kriteria judul yang bagus:
- Gunakan angka jika relevan (contoh: "5 Tips...")
- Gunakan kata hook (Ternyata, Rahasia, Faktanya, SHOCKING)
- Pertanyaan yang membuat orang penasaran
- Tambahkan #Shorts di akhir
- Maksimal 70 karakter
- Membuat orang ingin menonton sampai selesai

Berikan HANYA judul, tanpa penjelasan tambahan.`;

  if (openai) {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.8,
        max_tokens: 100,
      });
      return response.choices[0]?.message?.content?.trim() || `${clipContent.slice(0, 50)} #Shorts`;
    } catch {
      // fallthrough
    }
  }

  return `${videoContext.slice(0, 45)} - Momen Viral #Shorts`;
}
