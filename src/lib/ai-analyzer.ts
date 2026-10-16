/**
 * 🧠 AI ANALYSIS — PEMILIHAN MOMEN VIRAL
 * =====================================================================
 * Menganalisis transkrip video dan memilih momen-momen terbaik untuk
 * dijadikan klip Shorts. Menggunakan Gemini sebagai provider utama dan
 * Groq sebagai fallback otomatis (lihat src/lib/ai-provider.ts) — TIDAK
 * ada ketergantungan ke ChatGPT/OpenAI sama sekali.
 *
 * Kalau kedua provider AI gagal/tidak dikonfigurasi, fungsi ini tetap
 * mengembalikan hasil lewat `generateFallbackMoments()` (pembagian waktu
 * merata) supaya bot tetap bisa menghasilkan klip walau AI sedang down.
 *
 * 👉 Mudah diubah:
 *    - Provider & model AI → src/lib/ai-provider.ts
 *    - Niche prompt / arahan AI → src/lib/niche-prompt.ts
 */

import type { ClipResult } from "@/db/schema";
import { generateAiText, extractJson } from "@/lib/ai-provider";
import { buildNicheInstruction } from "@/lib/niche-prompt";

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface AnalyzeVideoInput {
  title?: string | null;
  duration: number;
  transcript: TranscriptSegment[];
  platform?: string;
  language?: string;
}

export type ClipCandidate = Omit<ClipResult, "filePath" | "thumbnailPath" | "youtubeVideoId" | "youtubeUrl">;

function formatTranscript(segments: TranscriptSegment[]): string {
  if (!segments.length) return "Tidak ada transkrip tersedia.";
  return segments
    .map((s) => `[${Math.round(s.start)}s-${Math.round(s.end)}s] ${s.text}`)
    .join("\n")
    .slice(0, 12000); // batasi supaya prompt tidak terlalu besar
}

function buildPrompt(
  video: AnalyzeVideoInput,
  maxClips: number,
  minDuration: number,
  maxDuration: number,
  targetDuration: number,
  nichePrompt?: string | null
): { system: string; user: string } {
  const system =
    "Kamu adalah AI ahli analisis video & content strategist yang bertugas menemukan momen-momen " +
    "paling viral dari sebuah video untuk dijadikan klip pendek (Shorts/Reels/TikTok). " +
    "Selalu balas HANYA dengan JSON array yang valid, tanpa teks tambahan, tanpa markdown code block.";

  const nicheInstruction = buildNicheInstruction(nichePrompt);

  const user =
    `Judul video: "${video.title || "Tidak diketahui"}"\n` +
    `Platform asal: ${video.platform || "tidak diketahui"}\n` +
    `Durasi total video: ${Math.round(video.duration)} detik\n` +
    `Bahasa: ${video.language || "id"}\n` +
    nicheInstruction +
    `\nTranskrip (format [awal-akhir] teks):\n${formatTranscript(video.transcript)}\n\n` +
    `TUGAS:\n` +
    `Pilih maksimal ${maxClips} momen TERBAIK & PALING VIRAL untuk dijadikan klip pendek. ` +
    `Setiap klip HARUS berdurasi antara ${minDuration}-${maxDuration} detik (target ideal ~${targetDuration} detik). ` +
    `Pilih momen yang punya hook kuat di awal, emosi/insight/drama/komedi yang jelas, dan berdiri sendiri (tidak butuh konteks sebelumnya). ` +
    `Jangan pilih rentang waktu yang tumpang-tindih satu sama lain.\n\n` +
    `Balas HANYA dengan JSON array seperti ini (tanpa teks lain):\n` +
    `[{"startTime": 12, "endTime": 42, "title": "Judul menarik < 60 karakter", ` +
    `"description": "Deskripsi singkat 1-2 kalimat untuk caption", ` +
    `"tags": ["tag1", "tag2", "tag3"], "viralScore": 8, "reason": "Alasan singkat kenapa momen ini viral"}]`;

  return { system, user };
}

function clampDuration(startTime: number, endTime: number, minDuration: number, maxDuration: number, totalDuration: number) {
  let start = Math.max(0, Math.round(startTime));
  let end = Math.max(start + 1, Math.round(endTime));
  let duration = end - start;

  if (duration < minDuration) end = start + minDuration;
  if (duration > maxDuration) end = start + maxDuration;

  if (totalDuration > 0 && end > totalDuration) {
    end = Math.round(totalDuration);
    start = Math.max(0, end - Math.min(maxDuration, Math.max(minDuration, duration)));
  }

  return { startTime: start, endTime: Math.max(end, start + 1) };
}

function generateFallbackMoments(
  duration: number,
  maxClips: number,
  targetDuration: number
): ClipCandidate[] {
  const validDuration = duration && duration > 0 ? duration : 180;
  const clips: ClipCandidate[] = [];
  const interval = Math.max(1, Math.floor(validDuration / (maxClips + 1)));
  const uniqueId = Math.floor(1000 + Math.random() * 9000);

  for (let i = 1; i <= maxClips; i++) {
    const start = Math.floor(i * interval);
    const clipDuration = Math.min(targetDuration, Math.max(5, validDuration - start));
    const end = start + clipDuration;

    if (clipDuration > 5 && end <= validDuration + 1) {
      clips.push({
        index: clips.length,
        startTime: start,
        endTime: end,
        duration: clipDuration,
        title: `Klip Menarik #${uniqueId}-${i}`,
        description: `Momen potongan otomatis dari segmen ${i} video.`,
        tags: ["shorts", "viral", "clip"],
        viralScore: 6,
        reason: "Dipilih otomatis (fallback) karena AI analysis tidak tersedia/gagal.",
      });
    }
  }

  if (!clips.length) {
    const end = Math.min(validDuration, targetDuration);
    clips.push({
      index: 0,
      startTime: 0,
      endTime: Math.max(end, 5),
      duration: Math.max(end, 5),
      title: `Klip Utama #${uniqueId}`,
      description: "Momen potongan otomatis dari bagian utama video.",
      tags: ["shorts", "viral", "clip"],
      viralScore: 6,
      reason: "Dipilih otomatis (fallback) karena AI analysis tidak tersedia/gagal.",
    });
  }

  return clips;
}

/**
 * Analisis video (judul + transkrip) dan kembalikan daftar momen terbaik
 * untuk dijadikan klip. Mencoba Gemini → Groq (lihat ai-provider.ts),
 * lalu jatuh ke pembagian waktu merata kalau semua provider AI gagal.
 */
export async function analyzeVideoForClips(
  video: AnalyzeVideoInput,
  maxClips: number = 5,
  minDuration: number = 20,
  maxDuration: number = 40,
  targetDuration: number = 30,
  nichePrompt?: string | null
): Promise<ClipCandidate[]> {
  const { system, user } = buildPrompt(video, maxClips, minDuration, maxDuration, targetDuration, nichePrompt);

  let rawList: unknown[] = [];
  try {
    const { text, provider } = await generateAiText(system, user);
    const parsed = extractJson<unknown>(text);
    if (Array.isArray(parsed)) {
      rawList = parsed;
    } else if (parsed && typeof parsed === "object" && Array.isArray((parsed as { clips?: unknown[] }).clips)) {
      rawList = (parsed as { clips: unknown[] }).clips;
    }
    console.log(`[ai-analyzer] Analisis berhasil via provider "${provider}" (${rawList.length} momen mentah).`);
  } catch (err) {
    console.warn("[ai-analyzer] Semua provider AI gagal, memakai fallback pembagian waktu merata:", err);
  }

  if (rawList.length > 0) {
    const mapped: ClipCandidate[] = rawList.slice(0, maxClips).map((raw, idx) => {
      const item = (raw || {}) as Record<string, unknown>;
      const { startTime, endTime } = clampDuration(
        Number(item.startTime) || 0,
        Number(item.endTime) || targetDuration,
        minDuration,
        maxDuration,
        video.duration
      );
      const tagsRaw = item.tags;
      const tags = Array.isArray(tagsRaw) ? tagsRaw.map((t) => String(t)).slice(0, 8) : ["shorts", "viral"];

      return {
        index: idx,
        startTime,
        endTime,
        duration: endTime - startTime,
        title: String(item.title || `Klip Momen ${idx + 1}`).slice(0, 100),
        description: String(item.description || item.summary || `Ringkasan klip ${idx + 1}`).slice(0, 500),
        tags,
        viralScore: Math.min(10, Math.max(1, Math.round(Number(item.viralScore) || 7))),
        reason: String(item.reason || "Momen menarik hasil analisis AI.").slice(0, 300),
      };
    });

    if (mapped.length > 0) return mapped;
  }

  console.log("[ai-analyzer] Menggunakan fallback pemotongan durasi merata.");
  return generateFallbackMoments(video.duration, maxClips, targetDuration);
}
