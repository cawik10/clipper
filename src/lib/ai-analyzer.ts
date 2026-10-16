import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-3.8-flash" });

async function analyzeWithGroq(prompt: string): Promise<string> {
  const groqApiKey = process.env.GROQ_API_KEY;
  if (!groqApiKey) {
    throw new Error("GROQ_API_KEY tidak dikonfigurasi");
  }

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${groqApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama3-8b-8192", // Model aktif & gratis di Groq API
      messages: [
        { role: "system", content: "Kamu adalah AI analisis video. Kembalikan JSON array murni." },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq API Error ${response.status}: ${errText}`);
  }

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content || "";
}

function generateFallbackMoments(
  duration: number,
  maxClips: number,
  targetDuration: number
): Array<{ startTime: number; endTime: number; title: string; summary: string }> {
  const validDuration = duration && duration > 0 ? duration : 180;
  const clips = [];
  const interval = Math.floor(validDuration / (maxClips + 1));
  const uniqueId = Math.floor(1000 + Math.random() * 9000);

  for (let i = 1; i <= maxClips; i++) {
    const start = Math.floor(i * interval);
    const clipDuration = Math.min(targetDuration, validDuration - start);
    const end = start + clipDuration;

    if (clipDuration > 5) {
      clips.push({
        startTime: start,
        endTime: end,
        title: `Klip Auto #${uniqueId} - Segmen ${i}`,
        summary: `Momen potongan otomatis interval ${i}`,
      });
    }
  }

  return clips.length > 0
    ? clips
    : [
        {
          startTime: 0,
          endTime: Math.min(validDuration, targetDuration),
          title: `Klip Auto #${uniqueId} - Segmen Utama`,
          summary: "Momen potongan otomatis",
        },
      ];
}

export async function analyzeVideoForClips(
  transcript: string,
  duration: number,
  maxClips: number = 3,
  targetDuration: number = 30
): Promise<Array<{ startTime: number; endTime: number; title: string; summary: string }>> {
  const prompt = `Analisis video berikut dan pilih maksimal ${maxClips} momen terbaik berdurasi ~${targetDuration} detik.
Durasi total: ${duration} detik.
Transkrip: ${transcript || "Tidak ada transkrip."}

Kembalikan HANYA JSON Array valid:
[{"startTime": 10, "endTime": 40, "title": "Judul Klip", "summary": "Ringkasan"}]`;

  let responseText = "";

  // 1. Coba Gemini API
  try {
    const result = await model.generateContent(prompt);
    responseText = result.response?.text() || "";
  } catch (geminiErr) {
    console.warn("[ai-analyzer] Gemini API error, mencoba fallback ke Groq...", geminiErr);
    // 2. Fallback ke Groq API
    try {
      responseText = await analyzeWithGroq(prompt);
    } catch (groqErr) {
      console.warn("[ai-analyzer] Groq API juga gagal/belum diisi:", groqErr);
    }
  }

  // 3. Safe Parsing
  if (responseText) {
    try {
      const jsonMatch = responseText.match(/\[[\s\S]*\]/) || responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const rawParsed = JSON.parse(jsonMatch[0]);
        let list: any[] = [];

        if (Array.isArray(rawParsed)) {
          list = rawParsed;
        } else if (rawParsed && Array.isArray(rawParsed.clips)) {
          list = rawParsed.clips;
        }

        if (list.length > 0) {
          return list.slice(0, maxClips).map((item, idx) => ({
            startTime: Number(item.startTime) || 0,
            endTime: Number(item.endTime) || targetDuration,
            title: String(item.title || `Klip Momen ${idx + 1}`),
            summary: String(item.summary || `Ringkasan klip ${idx + 1}`),
          }));
        }
      }
    } catch (parseErr) {
      console.warn("[ai-analyzer] Parse JSON gagal:", parseErr);
    }
  }

  // 4. Fallback Waktu Merata Unik
  console.log("[ai-analyzer] Menggunakan Fallback Pemotongan Durasi Merata.");
  return generateFallbackMoments(duration, maxClips, targetDuration);
}