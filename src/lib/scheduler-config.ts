/**
 * 📅 SCHEDULER / QUEUE POSTING — KONFIGURASI
 * ===========================================
 * Fitur BARU (additive): jadwalkan klip hasil AutoClip untuk diposting
 * otomatis di jam-jam "optimal" (jam dengan engagement tertinggi untuk
 * niche tertentu), bukan langsung saat klip selesai dibuat.
 *
 * 👉 SEMUANYA DI FILE INI MUDAH DIUBAH TANPA MENYENTUH BAGIAN LAIN APLIKASI:
 *    - Ubah `FALLBACK_NICHE_SLOTS` untuk jam optimal bawaan per niche
 *      (dipakai ketika AI tidak tersedia / gagal / belum ada API key).
 *    - Ubah `DEFAULT_SLOTS` untuk jam optimal umum (niche tidak dikenali).
 *    - Ubah `SCHEDULER_TIMEZONE` via Railway Variable untuk zona waktu lain.
 *    - Ubah `SCHEDULER_POLL_INTERVAL_MS` via Railway Variable untuk
 *      seberapa sering worker mengecek antrean (default 60 detik).
 *    - Matikan AI recommendation sepenuhnya dengan
 *      `SCHEDULER_AI_RECOMMEND_ENABLED=false` (akan selalu memakai fallback).
 *
 * Tidak ada bagian lain dari aplikasi (dashboard, job-processor, bot
 * command yang sudah ada) yang perlu diubah untuk menyesuaikan konfigurasi
 * scheduler — cukup edit env var di Railway atau nilai di file ini.
 */

import OpenAI from "openai";

export type SchedulePlatform = "youtube" | "tiktok";

export interface OptimalSlot {
  /** 0 = Minggu ... 6 = Sabtu, atau "weekday" / "weekend" / "any" */
  day: "weekday" | "weekend" | "any";
  hour: number; // 0-23, waktu lokal sesuai SCHEDULER_TIMEZONE
  minute: number; // 0-59
  label: string; // alasan singkat kenapa jam ini bagus
}

// ─── TIMEZONE & POLLING ──────────────────────────────────────────────────

/** Zona waktu yang dipakai untuk menghitung & menampilkan jam optimal. */
export function getSchedulerTimezone(): string {
  return process.env.SCHEDULER_TIMEZONE?.trim() || "Asia/Jakarta";
}

/** Interval (ms) antar pengecekan antrean oleh background worker. Default 60 detik. */
export function getSchedulerPollIntervalMs(): number {
  const raw = process.env.SCHEDULER_POLL_INTERVAL_MS;
  if (raw) {
    const parsed = parseInt(raw.trim(), 10);
    if (!isNaN(parsed) && parsed >= 5000) return parsed;
  }
  return 60_000;
}

/** Berapa menit toleransi keterlambatan sebelum sebuah slot dianggap gagal dieksekusi. */
export function getSchedulerGraceMinutes(): number {
  const raw = process.env.SCHEDULER_GRACE_MINUTES;
  if (raw) {
    const parsed = parseInt(raw.trim(), 10);
    if (!isNaN(parsed) && parsed >= 0) return parsed;
  }
  return 180; // 3 jam
}

/** Maksimal percobaan ulang (retry) sebelum sebuah antrean ditandai gagal permanen. */
export function getSchedulerMaxAttempts(): number {
  const raw = process.env.SCHEDULER_MAX_ATTEMPTS;
  if (raw) {
    const parsed = parseInt(raw.trim(), 10);
    if (!isNaN(parsed) && parsed >= 1) return parsed;
  }
  return 3;
}

/** Privacy default saat mem-publish draft YouTube yang dijadwalkan. */
export function getSchedulerPublishPrivacy(): "public" | "unlisted" {
  const raw = (process.env.SCHEDULER_PUBLISH_PRIVACY || "public").toLowerCase().trim();
  return raw === "unlisted" ? "unlisted" : "public";
}

// ─── AI RECOMMENDATION TOGGLE ────────────────────────────────────────────

export function isAiRecommendationEnabled(): boolean {
  const raw = process.env.SCHEDULER_AI_RECOMMEND_ENABLED;
  if (raw === undefined) return true;
  return raw.trim().toLowerCase() !== "false";
}

// ─── FALLBACK / CURATED OPTIMAL HOURS PER NICHE ──────────────────────────
// Dipakai sebagai fallback (atau sumber utama kalau AI dimatikan) dan
// sebagai referensi preset cepat di Telegram (/besttime, /schedule).
// 👉 TAMBAH / UBAH ENTRI DI SINI UNTUK MENYESUAIKAN REKOMENDASI BAWAAN.
export const FALLBACK_NICHE_SLOTS: { keywords: string[]; label: string; slots: OptimalSlot[] }[] = [
  {
    keywords: ["lucu", "komedi", "kocak", "meme", "hiburan"],
    label: "Komedi / Hiburan",
    slots: [
      { day: "any", hour: 12, minute: 0, label: "Jam istirahat siang — orang scroll santai" },
      { day: "any", hour: 19, minute: 30, label: "Setelah jam kerja/sekolah, waktu rileks" },
      { day: "weekend", hour: 10, minute: 0, label: "Akhir pekan pagi, waktu santai" },
    ],
  },
  {
    keywords: ["bisnis", "finansial", "keuangan", "investasi", "startup", "marketing"],
    label: "Bisnis / Finansial",
    slots: [
      { day: "weekday", hour: 7, minute: 30, label: "Sebelum jam kerja — commuting time" },
      { day: "weekday", hour: 12, minute: 30, label: "Jam makan siang profesional" },
      { day: "weekday", hour: 20, minute: 0, label: "Malam hari, waktu evaluasi/belajar" },
    ],
  },
  {
    keywords: ["drama", "kontroversial", "konflik", "gosip", "berita"],
    label: "Drama / Konflik",
    slots: [
      { day: "any", hour: 11, minute: 0, label: "Pagi menjelang siang, jam ramai media sosial" },
      { day: "any", hour: 21, minute: 0, label: "Prime time malam hari" },
    ],
  },
  {
    keywords: ["edukasi", "tips", "belajar", "tutorial", "fakta", "sains"],
    label: "Edukasi / Tips",
    slots: [
      { day: "any", hour: 8, minute: 0, label: "Pagi hari, waktu produktif untuk belajar" },
      { day: "any", hour: 17, minute: 0, label: "Sore hari setelah aktivitas utama" },
      { day: "weekend", hour: 9, minute: 0, label: "Akhir pekan pagi, waktu luang" },
    ],
  },
  {
    keywords: ["motivasi", "inspirasi", "semangat", "self improvement", "mindset"],
    label: "Motivasi",
    slots: [
      { day: "any", hour: 6, minute: 30, label: "Pagi hari, waktu memulai hari" },
      { day: "any", hour: 21, minute: 30, label: "Malam hari sebelum tidur" },
    ],
  },
  {
    keywords: ["plot twist", "mengejutkan", "misteri", "reveal"],
    label: "Plot Twist / Misteri",
    slots: [
      { day: "any", hour: 13, minute: 0, label: "Setelah makan siang, waktu scroll santai" },
      { day: "any", hour: 22, minute: 0, label: "Malam hari, waktu menonton santai" },
    ],
  },
  {
    keywords: ["gaming", "game", "esport"],
    label: "Gaming",
    slots: [
      { day: "any", hour: 15, minute: 0, label: "Sore hari setelah sekolah/kerja" },
      { day: "any", hour: 20, minute: 30, label: "Prime time gaming malam hari" },
      { day: "weekend", hour: 14, minute: 0, label: "Akhir pekan siang, waktu bermain" },
    ],
  },
];

/** Jam optimal umum kalau niche tidak dikenali / tidak diisi (berbasis riset umum short-video). */
export const DEFAULT_SLOTS: OptimalSlot[] = [
  { day: "any", hour: 9, minute: 0, label: "Pagi hari, mulai aktif scroll" },
  { day: "any", hour: 12, minute: 0, label: "Jam istirahat siang" },
  { day: "any", hour: 19, minute: 0, label: "Prime time setelah jam kerja" },
];

/** Cari grup niche yang paling cocok berdasarkan kata kunci sederhana. */
function matchNicheGroup(nicheText: string | null | undefined) {
  if (!nicheText) return null;
  const lower = nicheText.toLowerCase();
  return (
    FALLBACK_NICHE_SLOTS.find((group) => group.keywords.some((kw) => lower.includes(kw))) || null
  );
}

/** Rekomendasi fallback (tanpa AI) — selalu tersedia & instan. */
export function getFallbackSlots(nicheText: string | null | undefined): {
  slots: OptimalSlot[];
  nicheLabel: string;
} {
  const group = matchNicheGroup(nicheText);
  if (group) return { slots: group.slots, nicheLabel: group.label };
  return { slots: DEFAULT_SLOTS, nicheLabel: nicheText?.trim() || "Umum" };
}

// ─── AI-POWERED RECOMMENDATION ───────────────────────────────────────────

function getOpenAIClient(): OpenAI | null {
  if (process.env.OPENAI_API_KEY) {
    return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return null;
}

export interface AiSlotRecommendation {
  slots: OptimalSlot[];
  nicheLabel: string;
  aiPowered: boolean;
}

/**
 * Minta rekomendasi jam optimal posting ke AI (GPT-4o-mini) berdasarkan niche
 * & platform. Jika AI tidak tersedia / error / dimatikan, otomatis fallback
 * ke `getFallbackSlots` (tabel kurasi manual di atas) — jadi fitur ini tetap
 * selalu bisa dipakai walau tanpa API key.
 */
export async function getAiOptimalSlots(
  nicheText: string | null | undefined,
  platform: SchedulePlatform = "youtube",
  count = 3
): Promise<AiSlotRecommendation> {
  const fallback = getFallbackSlots(nicheText);

  if (!isAiRecommendationEnabled()) {
    return { ...fallback, aiPowered: false };
  }

  const openai = getOpenAIClient();
  if (!openai) {
    return { ...fallback, aiPowered: false };
  }

  const niche = nicheText?.trim() || "konten umum/general short video";
  const tz = getSchedulerTimezone();

  const prompt = `Kamu adalah ahli strategi social media & algoritma short-video (YouTube Shorts/TikTok/Reels).
Niche konten: "${niche}"
Platform: ${platform}
Zona waktu: ${tz}

Rekomendasikan ${count} jam terbaik (waktu lokal ${tz}) untuk mem-publish video pendek pada niche ini supaya jangkauan & engagement maksimal.
Pertimbangkan kebiasaan audiens niche tersebut (jam istirahat, jam pulang kerja/sekolah, prime time malam, dsb).

Jawab HANYA dengan JSON array (tanpa markdown, tanpa penjelasan tambahan), format:
[
  { "day": "any" | "weekday" | "weekend", "hour": <0-23>, "minute": <0-59>, "label": "<alasan singkat dalam Bahasa Indonesia, max 80 karakter>" }
]`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
      response_format: { type: "json_object" as const },
    }).catch(async () => {
      // Sebagian model/akun tidak mendukung response_format json_object untuk
      // prompt yang hasilnya array — retry tanpa constraint tersebut.
      return openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.4,
      });
    });

    const raw = response.choices[0]?.message?.content || "";
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("AI tidak mengembalikan format JSON array yang valid");

    const parsed = JSON.parse(jsonMatch[0]) as Partial<OptimalSlot>[];
    const slots: OptimalSlot[] = parsed
      .filter((s) => typeof s.hour === "number")
      .slice(0, count)
      .map((s) => ({
        day: s.day === "weekday" || s.day === "weekend" ? s.day : "any",
        hour: Math.min(23, Math.max(0, Math.round(s.hour as number))),
        minute: Math.min(59, Math.max(0, Math.round(s.minute ?? 0))),
        label: (s.label || "Rekomendasi AI berdasarkan niche").slice(0, 120),
      }));

    if (!slots.length) throw new Error("AI mengembalikan daftar jam kosong");

    return { slots, nicheLabel: niche, aiPowered: true };
  } catch (err) {
    console.warn("[scheduler-config] AI recommendation gagal, pakai fallback:", err);
    return { ...fallback, aiPowered: false };
  }
}

/** Hitung Date (UTC) berikutnya yang jatuh pada slot {day,hour,minute} sesuai timezone scheduler. */
export function nextDateForSlot(slot: OptimalSlot, from: Date = new Date()): Date {
  const tz = getSchedulerTimezone();

  // Ambil representasi tanggal "now" di timezone target lewat Intl, lalu
  // cari kandidat hari berikutnya (0-13 hari ke depan) yang cocok dengan
  // kriteria day (weekday/weekend/any) dan belum lewat jam targetnya.
  for (let addDays = 0; addDays < 14; addDays++) {
    const candidateBase = new Date(from.getTime() + addDays * 24 * 60 * 60 * 1000);
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(candidateBase);

    const get = (type: string) => parts.find((p) => p.type === type)?.value || "";
    const weekday = get("weekday"); // Sun, Mon, ...
    const isWeekend = weekday === "Sat" || weekday === "Sun";

    if (slot.day === "weekday" && isWeekend) continue;
    if (slot.day === "weekend" && !isWeekend) continue;

    const y = get("year");
    const m = get("month");
    const d = get("day");

    // Bangun timestamp untuk Y-M-D HH:mm:00 pada timezone target, dengan
    // mencari offset yang tepat memakai pendekatan dua langkah (good enough
    // untuk kebutuhan scheduler, tanpa perlu dependency timezone tambahan).
    const naiveUtc = new Date(`${y}-${m}-${d}T${String(slot.hour).padStart(2, "0")}:${String(slot.minute).padStart(2, "0")}:00Z`);
    const offsetMs = getTimezoneOffsetMs(tz, naiveUtc);
    const candidate = new Date(naiveUtc.getTime() - offsetMs);

    if (candidate.getTime() > from.getTime()) {
      return candidate;
    }
  }

  // Fallback aman: 1 jam dari sekarang.
  return new Date(from.getTime() + 60 * 60 * 1000);
}

/** Selisih (ms) antara UTC dan timezone target pada suatu titik waktu. */
function getTimezoneOffsetMs(timeZone: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") === 24 ? 0 : get("hour"),
    get("minute"),
    get("second")
  );
  return asUtc - date.getTime();
}

/** Format tampilan jam slot untuk Telegram/dashboard, mis. "19:30 WIB (Setiap hari)". */
export function formatSlotLabel(slot: OptimalSlot): string {
  const dayLabel = slot.day === "weekday" ? "Hari kerja" : slot.day === "weekend" ? "Akhir pekan" : "Setiap hari";
  const hh = String(slot.hour).padStart(2, "0");
  const mm = String(slot.minute).padStart(2, "0");
  return `${hh}:${mm} — ${dayLabel}`;
}
