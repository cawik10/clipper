/**
 * 📈 AI ANALYTICS — BACKGROUND WORKER (FITUR BARU!)
 * =====================================================================
 * Dijalankan sekali saat server boot (lihat src/instrumentation.ts), lalu
 * "bangun" setiap ANALYTICS_WORKER_INTERVAL_MINUTES untuk:
 *   1. Menarik views terbaru tiap klip dari YouTube (tiap
 *      ANALYTICS_SYNC_INTERVAL_MINUTES).
 *   2. Mengirim LAPORAN MINGGUAN ke Telegram pada hari & jam yang diatur
 *      (ANALYTICS_REPORT_DAY / ANALYTICS_REPORT_HOUR / ANALYTICS_TIMEZONE).
 *   3. Menjalankan Smart Learning Loop tepat sebelum laporan dikirim, sehingga
 *      laporan juga memuat arahan niche baru hasil belajar AI.
 *
 * Aman dari pengiriman ganda (walau ada >1 instance / restart): tiap user
 * "mengklaim" slot laporan lewat UPDATE atomik di analytics_user_state.
 *
 * Bisa dipicu manual / lewat Railway Cron: GET /api/analytics/run?secret=...
 */

import {
  getAnalyticsTimezone,
  getReportDay,
  getReportHour,
  getSyncIntervalMinutes,
  getWorkerIntervalMs,
  isAnalyticsEnabled,
  isLearningEnabled,
  isWeeklyReportEnabled,
} from "@/lib/analytics-config";
import {
  ensureAnalyticsTables,
  getLastSyncAt,
  getOrCreateUserState,
  listTrackedUserIds,
  markReportBaseline,
  discoverUploadedClips,
  patchUserState,
  resolveChatId,
  syncUserStats,
} from "@/lib/analytics-store";
import { buildAnalyticsReport } from "@/lib/analytics-report";
import { buildWeeklyCostSection } from "@/lib/cost-report"; // 💰 Cost Tracker (BARU!)
import { runSmartLearning } from "@/lib/analytics-learning";
import { runAutoRetitleForUsers } from "@/lib/auto-title-doctor";
import { isAutoRetitleEnabled } from "@/lib/auto-title-doctor-config";
import { runAutoPruneForUsers } from "@/lib/auto-prune"; // ✂️ Auto-Prune Klip Gagal (BARU!)
import { isAutoPruneEnabled } from "@/lib/auto-prune-config";
import { db } from "@/db";
import { analyticsUserState } from "@/db/schema";
import { and, eq, isNull, ne, or } from "drizzle-orm";

const globalForAnalytics = globalThis as typeof globalThis & {
  __autoclipAnalyticsStarted?: boolean;
  __autoclipAnalyticsTimer?: ReturnType<typeof setInterval>;
  __autoclipAnalyticsRunning?: boolean;
};

/** Waktu lokal (di zona waktu analytics) → hari (0=Minggu), jam, dan kunci tanggal YYYY-MM-DD. */
export function getLocalTimeParts(date: Date, timeZone: string): { weekday: number; hour: number; dateKey: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return {
    weekday,
    hour: parseInt(get("hour"), 10) % 24,
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

/** Apakah saat ini sudah waktunya kirim laporan mingguan? Return kunci unik laporan (tanggal lokal) atau null. */
export function getDueReportKey(now = new Date()): string | null {
  if (!isWeeklyReportEnabled()) return null;
  const local = getLocalTimeParts(now, getAnalyticsTimezone());
  if (local.weekday === getReportDay() && local.hour >= getReportHour()) return local.dateKey;
  return null;
}

/** Klaim slot laporan (atomik). True kalau berhasil → caller wajib mengirim laporan. */
async function claimReportSlot(userId: string, key: string): Promise<{ claimed: boolean; previousKey: string | null }> {
  const state = await getOrCreateUserState(userId);
  const res = await db
    .update(analyticsUserState)
    .set({ lastReportKey: key, lastReportAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(analyticsUserState.telegramUserId, userId),
        or(isNull(analyticsUserState.lastReportKey), ne(analyticsUserState.lastReportKey, key))
      )
    )
    .returning({ id: analyticsUserState.id });
  return { claimed: res.length > 0, previousKey: state.lastReportKey };
}

async function sendTelegram(chatId: string, text: string): Promise<void> {
  const { bot } = await import("@/lib/telegram-bot");
  // Batas pesan Telegram 4096 karakter
  await bot.api.sendMessage(chatId, text.slice(0, 4000), {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
  });
}

export interface WeeklyReportResult {
  userId: string;
  sent: boolean;
  skipped?: string;
  error?: string;
}

/** Sinkron views → belajar → kirim laporan untuk satu user. Dipakai worker & API manual. */
export async function sendWeeklyReport(userId: string): Promise<WeeklyReportResult> {
  try {
    await syncUserStats(userId);
    let learningNote = "";
    if (isLearningEnabled()) {
      const learning = await runSmartLearning(userId).catch((err) => {
        console.warn("[analytics] Smart Learning gagal:", err);
        return null;
      });
      if (learning && (learning.status === "learned" || learning.status === "pending")) {
        learningNote = `\n\n✨ <b>AI baru saja belajar dari ${learning.sampleSize} klip!</b>${learning.status === "pending" ? "\nKirim /analytics apply untuk menerapkan." : "\nArahan niche untuk klip berikutnya sudah diperbarui otomatis."}`;
      }
    }
    const report = await buildAnalyticsReport(userId, { weekly: true });
    const chatId = await resolveChatId(userId);
    // 💰 Cost Tracker (BARU!) — biaya AI minggu ini ditempel di laporan (kosong kalau fitur mati / belum ada biaya).
    // Kalau terlalu panjang untuk satu pesan Telegram, dikirim sebagai pesan terpisah.
    const costNote = await buildWeeklyCostSection(userId).catch((err) => {
      console.warn("[cost] Bagian biaya laporan mingguan gagal:", err);
      return "";
    });
    if (costNote && (report + learningNote + costNote).length > 4000) {
      await sendTelegram(chatId, report + learningNote);
      await sendTelegram(chatId, costNote.trim());
    } else {
      await sendTelegram(chatId, report + learningNote + costNote);
    }
    await markReportBaseline(userId);
    return { userId, sent: true };
  } catch (err) {
    return { userId, sent: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export interface AnalyticsCycleResult {
  enabled: boolean;
  discovered: number;
  synced: number;
  reportsSent: number;
  errors: number;
  /** 🩺 Auto-Title Doctor: jumlah klip yang judulnya diganti (atau disimulasikan) di siklus ini */
  retitled: number;
  /** ✂️ Auto-Prune: jumlah usulan sembunyikan/hapus klip baru di siklus ini */
  pruneSuggested: number;
}

/**
 * Satu siklus worker. `force` = abaikan jeda sync & jadwal laporan (dipakai
 * endpoint manual). `userId` = batasi ke satu user.
 */
export async function runAnalyticsCycle(opts: { force?: boolean; userId?: string } = {}): Promise<AnalyticsCycleResult> {
  const result: AnalyticsCycleResult = { enabled: isAnalyticsEnabled(), discovered: 0, synced: 0, reportsSent: 0, errors: 0, retitled: 0, pruneSuggested: 0 };
  if (!result.enabled) return result;
  if (globalForAnalytics.__autoclipAnalyticsRunning) return result;
  globalForAnalytics.__autoclipAnalyticsRunning = true;

  try {
    await ensureAnalyticsTables();
    result.discovered = await discoverUploadedClips(opts.userId);
    const userIds = opts.userId ? [opts.userId] : await listTrackedUserIds();
    const dueKey = opts.force ? `manual-${Date.now()}` : getDueReportKey();
    const syncMs = getSyncIntervalMinutes() * 60_000;
    const syncedUsers: string[] = []; // 🩺 Auto-Title Doctor hanya jalan untuk user yang views-nya baru disinkron

    for (const userId of userIds) {
      try {
        const state = await getOrCreateUserState(userId);

        // 1) Laporan mingguan (sudah termasuk sync + learning)
        if (dueKey && (opts.force || state.weeklyReportEnabled)) {
          const claim = opts.force ? { claimed: true, previousKey: state.lastReportKey } : await claimReportSlot(userId, dueKey);
          if (claim.claimed) {
            const sent = await sendWeeklyReport(userId);
            if (sent.sent) {
              result.reportsSent++;
              result.synced++;
              syncedUsers.push(userId);
              continue;
            }
            result.errors++;
            console.error(`[analytics] Laporan untuk user ${userId} gagal:`, sent.error);
            // Kembalikan klaim supaya dicoba lagi di tick berikutnya (kecuali bot diblokir user)
            if (!opts.force && !/403|blocked|chat not found/i.test(sent.error || "")) {
              await patchUserState(userId, { lastReportKey: claim.previousKey, lastReportAt: null });
            }
            continue;
          }
        }

        // 2) Sync berkala
        const last = await getLastSyncAt(userId);
        if (opts.force || !last || Date.now() - last.getTime() >= syncMs) {
          await syncUserStats(userId);
          result.synced++;
          syncedUsers.push(userId);
        }
      } catch (err) {
        result.errors++;
        console.error(`[analytics] Siklus user ${userId} gagal:`, err instanceof Error ? err.message : err);
      }
    }

    // 🩺 Auto-Title Doctor (BARU!) — klip tayang > 24 jam dengan views rendah → judul & hashtag baru via AI.
    // Hanya aktif kalau ANALYTICS_AUTO_RETITLE_LOW_VIEWS=true. Kegagalan di sini tidak mengganggu siklus lain.
    if (isAutoRetitleEnabled() && syncedUsers.length) {
      try {
        const doctor = await runAutoRetitleForUsers(syncedUsers, { force: opts.force });
        result.retitled = doctor.reduce((n, r) => n + r.retitled, 0);
        for (const r of doctor) {
          if (r.errors.length) console.warn(`[title-doctor] user ${r.userId}: ${r.errors.slice(0, 3).join(" | ")}`);
        }
      } catch (err) {
        console.error("[title-doctor] siklus gagal:", err instanceof Error ? err.message : err);
      }
    }

    // ✂️ Auto-Prune Klip Gagal (BARU!) — klip > 14 hari, views < 50, sudah di-retitle → USULAN
    // sembunyikan/hapus ke Telegram (user yang memutuskan). Kegagalan di sini tidak mengganggu siklus lain.
    if (isAutoPruneEnabled() && syncedUsers.length) {
      try {
        const prune = await runAutoPruneForUsers(syncedUsers);
        result.pruneSuggested = prune.reduce((n, r) => n + r.suggested, 0);
        for (const r of prune) {
          if (r.errors.length) console.warn(`[auto-prune] user ${r.userId}: ${r.errors.slice(0, 3).join(" | ")}`);
        }
      } catch (err) {
        console.error("[auto-prune] siklus gagal:", err instanceof Error ? err.message : err);
      }
    }
  } finally {
    globalForAnalytics.__autoclipAnalyticsRunning = false;
  }
  return result;
}

export function startAnalyticsWorker(): void {
  if (!isAnalyticsEnabled()) {
    console.log("[analytics] Worker tidak dijalankan (ANALYTICS_ENABLED=false).");
    return;
  }
  if (globalForAnalytics.__autoclipAnalyticsStarted) return;
  globalForAnalytics.__autoclipAnalyticsStarted = true;

  const intervalMs = getWorkerIntervalMs();
  const tick = async () => {
    try {
      const r = await runAnalyticsCycle();
      if (r.synced > 0 || r.reportsSent > 0 || r.errors > 0 || r.retitled > 0 || r.pruneSuggested > 0) {
        console.log(`[analytics] Sync ${r.synced} user, ${r.reportsSent} laporan terkirim, ${r.retitled} judul diperbaiki, ${r.pruneSuggested} usulan prune, ${r.errors} error.`);
      }
    } catch (err) {
      console.error("[analytics] Tick worker gagal:", err);
    }
  };

  setTimeout(tick, 30_000);
  globalForAnalytics.__autoclipAnalyticsTimer = setInterval(tick, intervalMs);
  console.log(`[analytics] Worker aktif — cek setiap ${Math.round(intervalMs / 60_000)} menit.`);
}
