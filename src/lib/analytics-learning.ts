/**
 * 🧠 SMART LEARNING LOOP (FITUR BARU!)
 * =====================================================================
 * AI mempelajari klip mana yang sukses (views tinggi) vs kurang berhasil,
 * lalu menghasilkan "learned prompt" — arahan niche baru yang otomatis
 * dipakai menggantikan DEFAULT_NICHE_PROMPT untuk pembuatan klip berikutnya.
 *
 * Aturan penerapan (lihat `resolveNichePromptForJob`):
 *   • User punya /niche kustom sendiri → prompt kustom TETAP menang
 *     (bot tidak menimpa pilihan eksplisit user).
 *   • User memakai default (kosong / sama dengan DEFAULT_NICHE_PROMPT) →
 *     learned prompt dipakai sebagai default yang terus beradaptasi.
 *
 * Provider AI & model diatur di src/lib/ai-provider.ts (Gemini/Groq).
 * Kalau semua provider gagal, otomatis fallback ke heuristik non-AI.
 * Parameter (minimal klip, % sukses, auto-apply, dll): src/lib/analytics-config.ts
 */

import { db } from "@/db";
import { analyticsLearningLog, analyticsUserState, type ClipPerformanceRow } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { generateAiText, hasAnyAiProvider } from "@/lib/ai-provider";
import { NICHE_PRESETS, getDefaultNichePrompt, sanitizeNichePrompt } from "@/lib/niche-prompt";
import {
  getLearnedPromptMaxLength,
  getLearningIntervalDays,
  getLearningMinClips,
  getLearningMinViews,
  getLearningTopPercent,
  isAnalyticsEnabled,
  isLearningAutoApply,
  isLearningEnabled,
} from "@/lib/analytics-config";
import {
  buildNicheBreakdown,
  ensureAnalyticsTables,
  getOrCreateUserState,
  getPerformanceRows,
  patchUserState,
  withStats,
} from "@/lib/analytics-store";

// ─── PENERAPAN KE PEMBUATAN KLIP ─────────────────────────────────────────

/**
 * Dipanggil oleh job-processor sebelum AI Analysis. TIDAK PERNAH melempar
 * error — kalau ada masalah, kembalikan prompt asli user.
 */
export async function resolveNichePromptForJob(
  userId: string,
  userNichePrompt: string | null | undefined
): Promise<string | null | undefined> {
  try {
    if (!isAnalyticsEnabled() || !isLearningEnabled()) return userNichePrompt;
    await ensureAnalyticsTables();
    const rows = await db.select().from(analyticsUserState).where(eq(analyticsUserState.telegramUserId, userId));
    const state = rows[0];
    if (!state || !state.learningEnabled || !state.learnedPrompt) return userNichePrompt;

    const envDefault = sanitizeNichePrompt(getDefaultNichePrompt());
    const custom = sanitizeNichePrompt(userNichePrompt ?? null);
    if (custom && custom !== envDefault) return userNichePrompt; // pilihan eksplisit user menang

    return state.learnedPrompt;
  } catch (err) {
    console.warn("[analytics] resolveNichePromptForJob gagal, pakai prompt asli:", err);
    return userNichePrompt;
  }
}

// ─── PROSES BELAJAR ──────────────────────────────────────────────────────

export type LearningStatus = "learned" | "pending" | "insufficient" | "too_soon" | "disabled";

export interface LearningResult {
  status: LearningStatus;
  message: string;
  sampleSize: number;
  prompt?: string;
  insights?: string[];
  topNiche?: string | null;
  method?: "ai" | "heuristic";
  applied?: boolean;
}

function fmt(n: number): string {
  return n.toLocaleString("id-ID");
}

function describeClip(r: ClipPerformanceRow): string {
  const parts = [`"${r.title}"`, `niche=${r.niche}`, `views=${fmt(r.views)}`];
  if (r.likes) parts.push(`likes=${fmt(r.likes)}`);
  if (r.viralScore != null) parts.push(`skor_AI=${r.viralScore}/10`);
  if (r.duration) parts.push(`durasi=${r.duration}s`);
  if (r.hook) parts.push(`hook="${r.hook}"`);
  return `- ${parts.join(" | ")}`;
}

/** Parse objek JSON pertama dari teks bebas (extractJson bawaan memprioritaskan array, tidak cocok di sini). */
function parseJsonObject<T>(text: string): T | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

function clamp(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "), cut.lastIndexOf(", "));
  return (lastStop > max * 0.6 ? cut.slice(0, lastStop) : cut).trim().replace(/[,;]$/, "") + (lastStop > max * 0.6 ? "." : "");
}

async function learnWithAi(args: {
  winners: ClipPerformanceRow[];
  losers: ClipPerformanceRow[];
  nicheLines: string;
  currentPrompt: string;
  maxLen: number;
}): Promise<{ prompt: string; insights: string[]; bestNiche: string | null }> {
  const system =
    "Kamu adalah analis konten short-form (YouTube Shorts) yang tajam. Tugasmu: mempelajari pola klip yang " +
    "sukses vs kurang berhasil, lalu menulis arahan singkat untuk AI pemilih momen viral agar klip berikutnya " +
    "lebih berpotensi mendapat views. Balas HANYA dengan satu objek JSON valid, tanpa teks lain.";

  const user = `DATA PERFORMA KLIP (views nyata dari YouTube):

KLIP SUKSES (views tertinggi):
${args.winners.map(describeClip).join("\n")}

KLIP KURANG BERHASIL (views terendah):
${args.losers.length ? args.losers.map(describeClip).join("\n") : "- (tidak ada pembanding)"}

RANKING NICHE (total views):
${args.nicheLines}

ARAHAN NICHE SAAT INI: ${args.currentPrompt ? `"${args.currentPrompt}"` : "(belum ada — AI memilih momen viral secara umum)"}

TUGAS:
1. Temukan pola: jenis momen/topik, gaya judul, hook, dan durasi yang membuat klip sukses.
2. Tulis "learned_prompt": arahan imperatif dalam Bahasa Indonesia untuk AI pemilih momen (maksimal ${args.maxLen} karakter). Fokus ke JENIS MOMEN yang harus diprioritaskan dan yang harus dihindari. Jangan menyebut angka views.
3. Tulis "insights": 3 poin ringkas (maks 110 karakter per poin) berisi temuan utama.
4. "best_niche": nama niche dengan performa terbaik.

FORMAT:
{"learned_prompt":"...","insights":["...","...","..."],"best_niche":"..."}`;

  // 💰 Cost Tracker: label fitur + user pemilik klip untuk pencatatan biaya
  const result = await generateAiText(system, user, { feature: "learning", userId: args.winners[0]?.telegramUserId });
  const parsed = parseJsonObject<{ learned_prompt?: string; insights?: unknown; best_niche?: string }>(result.text);
  const prompt = typeof parsed?.learned_prompt === "string" ? clamp(parsed.learned_prompt, args.maxLen) : "";
  if (!prompt) throw new Error("AI tidak mengembalikan learned_prompt yang valid");
  const insights = Array.isArray(parsed?.insights)
    ? (parsed!.insights as unknown[]).filter((i): i is string => typeof i === "string").map((i) => i.trim()).slice(0, 4)
    : [];
  return { prompt, insights, bestNiche: typeof parsed?.best_niche === "string" ? parsed.best_niche : null };
}

/** Fallback tanpa AI: ambil niche terbaik + contoh judul klip sukses. */
function learnHeuristic(args: {
  winners: ClipPerformanceRow[];
  rows: ClipPerformanceRow[];
  maxLen: number;
}): { prompt: string; insights: string[]; bestNiche: string | null } {
  const niches = buildNicheBreakdown(args.rows).filter((n) => n.niche !== "Umum");
  const best = niches[0] ?? null;
  const preset = best ? NICHE_PRESETS.find((p) => p.label === best.niche) : null;
  const examples = args.winners.slice(0, 2).map((w) => `'${w.title.replace(/["']/g, "")}'`).join("; ");

  let prompt = preset ? preset.prompt : "Prioritaskan momen yang mirip dengan klip yang paling banyak ditonton.";
  if (examples) prompt += ` Cari momen sejenis klip sukses seperti: ${examples}.`;

  const insights: string[] = [];
  if (best) insights.push(`Niche terbaik: ${best.niche} (rata-rata ${fmt(best.avgViews)} views/klip).`);
  if (args.winners[0]) insights.push(`Klip teratas: "${args.winners[0].title.slice(0, 80)}" (${fmt(args.winners[0].views)} views).`);
  return { prompt: clamp(prompt, args.maxLen), insights, bestNiche: best?.niche ?? null };
}

export async function runSmartLearning(userId: string, opts: { force?: boolean } = {}): Promise<LearningResult> {
  if (!isAnalyticsEnabled() || !isLearningEnabled()) {
    return { status: "disabled", message: "Smart Learning dinonaktifkan (ANALYTICS_LEARNING_ENABLED=false).", sampleSize: 0 };
  }
  const state = await getOrCreateUserState(userId);
  if (!state.learningEnabled && !opts.force) {
    return { status: "disabled", message: "Smart Learning dimatikan untuk akunmu. Aktifkan lewat /analytics.", sampleSize: 0 };
  }

  if (!opts.force && state.learnedAt) {
    const ageDays = (Date.now() - state.learnedAt.getTime()) / 86_400_000;
    if (ageDays < getLearningIntervalDays()) {
      return {
        status: "too_soon",
        message: `Belajar terakhir ${ageDays.toFixed(1)} hari lalu (jeda minimal ${getLearningIntervalDays()} hari).`,
        sampleSize: state.learnedSampleSize ?? 0,
      };
    }
  }

  const rows = withStats(await getPerformanceRows(userId));
  const minClips = getLearningMinClips();
  if (rows.length < minClips) {
    return {
      status: "insufficient",
      message: `Data belum cukup: ${rows.length}/${minClips} klip yang statistiknya terbaca. Upload lebih banyak klip & pastikan views bisa dibaca.`,
      sampleSize: rows.length,
    };
  }

  const sorted = [...rows].sort((a, b) => b.views - a.views);
  const k = Math.max(1, Math.min(10, Math.ceil((sorted.length * getLearningTopPercent()) / 100)));
  const minViews = getLearningMinViews();
  const winners = sorted.slice(0, k).filter((r) => r.views >= minViews);
  if (!winners.length) {
    return {
      status: "insufficient",
      message: `Belum ada klip yang mencapai ${fmt(minViews)} views (ANALYTICS_LEARNING_MIN_VIEWS).`,
      sampleSize: rows.length,
    };
  }
  const losers = sorted.slice(-k).filter((r) => !winners.includes(r));

  const niches = buildNicheBreakdown(rows);
  const nicheLines = niches
    .slice(0, 6)
    .map((n) => `- ${n.niche}: ${fmt(n.views)} views, ${n.clips} klip (rata-rata ${fmt(n.avgViews)}/klip)`)
    .join("\n");
  const envDefault = sanitizeNichePrompt(getDefaultNichePrompt()) ?? "";
  const currentPrompt = state.learnedPrompt || envDefault;
  const maxLen = getLearnedPromptMaxLength();

  let outcome: { prompt: string; insights: string[]; bestNiche: string | null };
  let method: "ai" | "heuristic" = "ai";
  try {
    if (!hasAnyAiProvider()) throw new Error("Tidak ada API key AI");
    outcome = await learnWithAi({ winners, losers, nicheLines, currentPrompt, maxLen });
  } catch (err) {
    console.warn("[analytics] Smart Learning via AI gagal, pakai heuristik:", err instanceof Error ? err.message : err);
    method = "heuristic";
    outcome = learnHeuristic({ winners, rows, maxLen });
  }

  const finalPrompt = sanitizeNichePrompt(outcome.prompt);
  if (!finalPrompt) {
    return { status: "insufficient", message: "Hasil belajar kosong, dibatalkan.", sampleSize: rows.length };
  }

  const autoApply = isLearningAutoApply();
  await db.insert(analyticsLearningLog).values({
    telegramUserId: userId,
    previousPrompt: state.learnedPrompt ?? (envDefault || null),
    newPrompt: finalPrompt,
    insights: JSON.stringify(outcome.insights),
    sampleSize: rows.length,
    topNiche: outcome.bestNiche,
    method,
    applied: autoApply,
  });

  if (autoApply) {
    await patchUserState(userId, {
      learnedPrompt: finalPrompt,
      learnedInsights: JSON.stringify(outcome.insights),
      learnedAt: new Date(),
      learnedSampleSize: rows.length,
    });
  }

  return {
    status: autoApply ? "learned" : "pending",
    message: autoApply
      ? "AI selesai belajar dan prompt baru sudah aktif untuk klip berikutnya."
      : "AI selesai belajar. Kirim /analytics apply untuk menerapkan prompt baru.",
    sampleSize: rows.length,
    prompt: finalPrompt,
    insights: outcome.insights,
    topNiche: outcome.bestNiche,
    method,
    applied: autoApply,
  };
}

/** Terapkan hasil belajar terakhir yang masih menunggu persetujuan (mode ANALYTICS_LEARNING_AUTO_APPLY=false). */
export async function applyPendingLearning(userId: string): Promise<{ prompt: string } | null> {
  await ensureAnalyticsTables();
  const rows = await db
    .select()
    .from(analyticsLearningLog)
    .where(and(eq(analyticsLearningLog.telegramUserId, userId), eq(analyticsLearningLog.applied, false)))
    .orderBy(desc(analyticsLearningLog.createdAt))
    .limit(1);
  const log = rows[0];
  if (!log) return null;
  await getOrCreateUserState(userId);
  await patchUserState(userId, {
    learnedPrompt: log.newPrompt,
    learnedInsights: log.insights,
    learnedAt: new Date(),
    learnedSampleSize: log.sampleSize,
  });
  await db
    .update(analyticsLearningLog)
    .set({ applied: true })
    .where(and(eq(analyticsLearningLog.telegramUserId, userId), eq(analyticsLearningLog.applied, false)));
  return { prompt: log.newPrompt };
}

/** Hapus hasil belajar → kembali ke DEFAULT_NICHE_PROMPT / tanpa arahan. */
export async function resetLearning(userId: string): Promise<void> {
  await getOrCreateUserState(userId);
  await patchUserState(userId, { learnedPrompt: null, learnedInsights: null, learnedAt: null, learnedSampleSize: null });
}

export function parseInsights(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
