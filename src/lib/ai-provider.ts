/**
 * 🧠 AI PROVIDER — SATU-SATUNYA TEMPAT UNTUK GANTI/ATUR MODEL AI
 * =====================================================================
 * Semua pemanggilan AI teks di aplikasi ini (AI Analysis momen viral di
 * src/lib/ai-analyzer.ts, rekomendasi jam optimal di src/lib/scheduler.ts)
 * HARUS lewat helper di file ini, supaya:
 *   1. Provider & model gampang diganti tanpa menyentuh logika bisnis.
 *   2. Fallback antar-provider konsisten di seluruh aplikasi.
 *   3. ChatGPT/OpenAI TIDAK dipakai lagi untuk fitur AI analysis/rekomendasi
 *      (sesuai permintaan) — hanya Gemini & Groq.
 *
 * =====================================================================
 * ENV VARIABLES (atur di Railway → Variables, tanpa redeploy kode)
 * =====================================================================
 * GEMINI_API_KEY      ← Wajib untuk provider Gemini (prioritas #1).
 * GEMINI_MODEL         ← Nama model Gemini, default "gemini-3.8-flash".
 *                         Ganti ke versi lain kapan saja kalau Google
 *                         merilis model baru, mis. "gemini-2.5-flash".
 * GROQ_API_KEY         ← Wajib untuk provider Groq (prioritas #2 / fallback).
 * GROQ_MODEL           ← Nama model chat Groq, default
 *                         "llama-3.3-70b-versatile".
 * GROQ_WHISPER_MODEL   ← Model transkripsi audio Groq, default
 *                         "whisper-large-v3".
 * AI_PROVIDER_ORDER    ← Urutan provider dipisah koma, default
 *                         "gemini,groq". Contoh: "groq,gemini" untuk
 *                         memprioritaskan Groq.
 *
 * 👉 TIDAK ADA provider OpenAI/ChatGPT di sini secara sengaja. Kalau di
 *    masa depan ingin menambah provider baru, cukup tambah satu fungsi
 *    `callXxx()` baru lalu daftarkan di `PROVIDERS` di bawah.
 */

export type AiProviderName = "gemini" | "groq";

export interface AiTextResult {
  provider: AiProviderName;
  text: string;
}

/** Model Gemini yang dipakai untuk semua pemanggilan teks (analisis & rekomendasi). */
export function getGeminiModel(): string {
  return (process.env.GEMINI_MODEL || "gemini-3.8-flash").trim();
}

/** Model chat Groq (OpenAI-compatible) yang dipakai sebagai fallback. */
export function getGroqModel(): string {
  return (process.env.GROQ_MODEL || "llama-3.3-70b-versatile").trim();
}

/** Model Whisper Groq untuk transkripsi audio (lihat src/lib/video-processor.ts). */
export function getGroqWhisperModel(): string {
  return (process.env.GROQ_WHISPER_MODEL || "whisper-large-v3").trim();
}

export function hasGemini(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

export function hasGroq(): boolean {
  return !!process.env.GROQ_API_KEY;
}

export function hasAnyAiProvider(): boolean {
  return hasGemini() || hasGroq();
}

/** Urutan provider yang dicoba, bisa diatur lewat env `AI_PROVIDER_ORDER`. */
function getProviderOrder(): AiProviderName[] {
  const raw = (process.env.AI_PROVIDER_ORDER || "gemini,groq").toLowerCase();
  const order = raw
    .split(",")
    .map((p) => p.trim())
    .filter((p): p is AiProviderName => p === "gemini" || p === "groq");
  // Pastikan kedua provider selalu ada di daftar (tambahkan yang hilang di akhir)
  for (const p of ["gemini", "groq"] as AiProviderName[]) {
    if (!order.includes(p)) order.push(p);
  }
  return order;
}

async function callGemini(systemPrompt: string, userPrompt: string): Promise<string> {
  if (!hasGemini()) throw new Error("GEMINI_API_KEY tidak dikonfigurasi");
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({
    model: getGeminiModel(),
    systemInstruction: systemPrompt,
  });
  const result = await model.generateContent(userPrompt);
  return result.response?.text() || "";
}

async function callGroq(systemPrompt: string, userPrompt: string): Promise<string> {
  if (!hasGroq()) throw new Error("GROQ_API_KEY tidak dikonfigurasi");
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: getGroqModel(),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.4,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Groq API error ${response.status}: ${errText}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content || "";
}

const PROVIDERS: Record<AiProviderName, (system: string, user: string) => Promise<string>> = {
  gemini: callGemini,
  groq: callGroq,
};

/**
 * Jalankan prompt ke provider AI sesuai urutan prioritas (`AI_PROVIDER_ORDER`),
 * otomatis lanjut ke provider berikutnya kalau satu provider gagal/kosong.
 * Melempar error hanya kalau SEMUA provider gagal (atau tidak ada API key sama
 * sekali) — caller sebaiknya selalu punya fallback non-AI (lihat ai-analyzer.ts
 * & scheduler.ts) supaya bot tetap jalan walau AI down.
 */
export async function generateAiText(systemPrompt: string, userPrompt: string): Promise<AiTextResult> {
  const order = getProviderOrder();
  const errors: string[] = [];

  for (const providerName of order) {
    const hasKey = providerName === "gemini" ? hasGemini() : hasGroq();
    if (!hasKey) continue;

    try {
      const text = await PROVIDERS[providerName](systemPrompt, userPrompt);
      if (text && text.trim()) {
        return { provider: providerName, text };
      }
      errors.push(`${providerName}: respons kosong`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[ai-provider] Provider "${providerName}" gagal:`, msg);
      errors.push(`${providerName}: ${msg}`);
    }
  }

  throw new Error(
    errors.length
      ? `Semua provider AI gagal/tidak dikonfigurasi → ${errors.join(" | ")}`
      : "Tidak ada API key AI yang dikonfigurasi (GEMINI_API_KEY / GROQ_API_KEY)"
  );
}

/** Ekstrak JSON (array atau object) pertama yang ditemukan di dalam teks bebas hasil AI. */
export function extractJson<T = unknown>(text: string): T | null {
  if (!text) return null;
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  const objectMatch = text.match(/\{[\s\S]*\}/);
  const candidate = arrayMatch?.[0] || objectMatch?.[0];
  if (!candidate) return null;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    return null;
  }
}
