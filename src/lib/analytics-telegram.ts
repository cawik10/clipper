/**
 * 📈 PERINTAH TELEGRAM /analytics (FITUR BARU!)
 * =====================================================================
 * Didaftarkan ke bot lewat satu baris di src/lib/telegram-bot.ts:
 *     registerAnalyticsCommands(bot);
 *
 * Perintah:
 *   /analytics                 → laporan performa (klip terbanyak views + niche terbaik)
 *   /analytics 30              → laporan untuk klip 30 hari terakhir
 *   /analytics sync            → tarik views terbaru dari YouTube sekarang
 *   /analytics learn           → suruh AI belajar dari klip sukses sekarang
 *   /analytics apply           → terapkan hasil belajar yang menunggu persetujuan
 *   /analytics reset           → hapus hasil belajar (kembali ke DEFAULT_NICHE_PROMPT)
 *   /analytics weekly on|off   → laporan mingguan otomatis
 *   /analytics learning on|off → Smart Learning Loop
 *   /analytics views <id> <n>  → isi views manual (video private yang tidak terbaca API)
 *   /analytics retitle         → 🩺 status & riwayat Auto-Title Doctor
 *   /analytics retitle run     → 🩺 periksa klip ber-views rendah & ganti judulnya sekarang
 */

import { InlineKeyboard, type Bot, type Context } from "grammy";
import {
  getOrCreateUserState,
  patchUserState,
  setManualViews,
  syncUserStats,
  getLastSyncAt,
} from "@/lib/analytics-store";
import { buildAnalyticsReport, escapeHtml, getReportScheduleLabel } from "@/lib/analytics-report";
import {
  applyPendingLearning,
  resetLearning,
  runSmartLearning,
  type LearningResult,
} from "@/lib/analytics-learning";
import {
  getSyncIntervalMinutes,
  isAnalyticsEnabled,
  isLearningEnabled,
  isWeeklyReportEnabled,
} from "@/lib/analytics-config";
import {
  isAutoRetitleEnabled,
  isRetitleDryRun,
} from "@/lib/auto-title-doctor-config";
import { describeRetitleRules, getRetitleCounts, getRetitleHistory, runAutoRetitle } from "@/lib/auto-title-doctor";

const HTML = { parse_mode: "HTML" as const, link_preview_options: { is_disabled: true } };

async function buildKeyboard(userId: string): Promise<InlineKeyboard> {
  const state = await getOrCreateUserState(userId);
  const kb = new InlineKeyboard()
    .text("🔄 Sync Views", "an_sync")
    .text("🧠 Pelajari Sekarang", "an_learn")
    .row()
    .text(`📅 Laporan Mingguan: ${state.weeklyReportEnabled ? "ON ✅" : "OFF ⛔"}`, "an_weekly")
    .row()
    .text(`🤖 Smart Learning: ${state.learningEnabled ? "ON ✅" : "OFF ⛔"}`, "an_learning");
  if (state.learnedPrompt) kb.row().text("🗑 Reset Hasil Belajar", "an_reset");
  return kb;
}

function formatLearning(r: LearningResult): string {
  const icon = r.status === "learned" || r.status === "pending" ? "🧠" : "ℹ️";
  let text = `${icon} <b>${escapeHtml(r.message)}</b>`;
  if (r.prompt) {
    text += `\n\n🎯 <b>Arahan niche baru:</b>\n<i>"${escapeHtml(r.prompt)}"</i>`;
    if (r.topNiche) text += `\n\n🏆 Niche terbaik: <b>${escapeHtml(r.topNiche)}</b>`;
    if (r.insights?.length) text += `\n\n💡 <b>Temuan AI:</b>\n${r.insights.map((i) => `▫️ ${escapeHtml(i)}`).join("\n")}`;
    text += `\n\n<i>Metode: ${r.method === "ai" ? "analisis AI" : "heuristik (AI tidak tersedia)"} · sampel ${r.sampleSize} klip</i>`;
  }
  return text;
}

async function syncAndNotify(ctx: Context, userId: string): Promise<string> {
  const s = await syncUserStats(userId);
  if (!s.tracked) {
    return "ℹ️ Belum ada klip yang terupload ke YouTube. Proses video dulu & hubungkan YouTube lewat /connect.";
  }
  let text = `🔄 <b>Sync selesai</b>\n• Klip dilacak: ${s.tracked}${s.newClips ? ` (+${s.newClips} baru)` : ""}\n• Views terbaca: ${s.updated}`;
  if (s.unreadable) {
    text += `\n• Tidak terbaca: ${s.unreadable} (private/draft?)\n\n💡 Kirim /connect lagi untuk memberi izin baca statistik, atau set <code>YOUTUBE_API_KEY</code> di Railway untuk video public/unlisted.`;
    if (s.note) text += `\n<i>${escapeHtml(s.note.slice(0, 220))}</i>`;
  }
  return text;
}

async function replyReport(ctx: Context, userId: string, days: number | null, autoSync: boolean) {
  const chatId = ctx.chat?.id?.toString() ?? null;
  await getOrCreateUserState(userId, chatId);
  let loading: { message_id: number } | null = null;
  if (autoSync) {
    const last = await getLastSyncAt(userId);
    const stale = !last || Date.now() - last.getTime() > Math.min(getSyncIntervalMinutes(), 30) * 60_000;
    if (stale) {
      loading = await ctx.reply("⏳ Mengambil statistik terbaru dari YouTube...");
      await syncUserStats(userId).catch((err) => console.warn("[analytics] sync saat /analytics gagal:", err));
    }
  }
  const report = await buildAnalyticsReport(userId, { days });
  const footer = `\n\n📅 <i>Laporan mingguan otomatis: ${escapeHtml(getReportScheduleLabel())}</i>`;
  if (loading && ctx.chat) await ctx.api.deleteMessage(ctx.chat.id, loading.message_id).catch(() => {});
  await ctx.reply((report + footer).slice(0, 4000), { ...HTML, reply_markup: await buildKeyboard(userId) });
}

function disabledMessage(): string {
  return "📈 Fitur AI Analytics sedang dinonaktifkan oleh admin (<code>ANALYTICS_ENABLED=false</code>).";
}

export function registerAnalyticsCommands(bot: Bot<Context>): void {
  bot.command("analytics", async (ctx) => {
    const userId = ctx.from?.id?.toString();
    if (!userId) return;
    if (!isAnalyticsEnabled()) {
      await ctx.reply(disabledMessage(), HTML);
      return;
    }
    const arg = (ctx.match || "").toString().trim();
    const [cmd, ...rest] = arg.split(/\s+/);
    const sub = (cmd || "").toLowerCase();
    await getOrCreateUserState(userId, ctx.chat?.id?.toString() ?? null);

    try {
      if (!sub) return await replyReport(ctx, userId, null, true);

      if (/^\d+$/.test(sub)) {
        const days = Math.min(365, Math.max(1, parseInt(sub, 10)));
        return await replyReport(ctx, userId, days, true);
      }

      if (sub === "sync") {
        await ctx.reply(await syncAndNotify(ctx, userId), HTML);
        return;
      }

      if (sub === "learn") {
        const wait = await ctx.reply("🧠 AI sedang mempelajari klip suksesmu...");
        await syncUserStats(userId).catch(() => {});
        const result = await runSmartLearning(userId, { force: true });
        if (ctx.chat) await ctx.api.deleteMessage(ctx.chat.id, wait.message_id).catch(() => {});
        await ctx.reply(formatLearning(result), HTML);
        return;
      }

      if (sub === "apply") {
        const applied = await applyPendingLearning(userId);
        await ctx.reply(
          applied
            ? `✅ <b>Hasil belajar diterapkan!</b>\n<i>"${escapeHtml(applied.prompt)}"</i>`
            : "ℹ️ Tidak ada hasil belajar yang menunggu persetujuan.",
          HTML
        );
        return;
      }

      if (sub === "reset") {
        await resetLearning(userId);
        await ctx.reply("↩️ Hasil belajar dihapus. AI kembali memakai DEFAULT_NICHE_PROMPT / niche kustommu.", HTML);
        return;
      }

      if (sub === "weekly" || sub === "learning") {
        const on = /^(on|aktif|nyala|1|true)$/i.test(rest[0] || "");
        const off = /^(off|mati|0|false)$/i.test(rest[0] || "");
        if (!on && !off) {
          await ctx.reply(`Gunakan: <code>/analytics ${sub} on</code> atau <code>/analytics ${sub} off</code>`, HTML);
          return;
        }
        await patchUserState(userId, sub === "weekly" ? { weeklyReportEnabled: on } : { learningEnabled: on });
        await ctx.reply(
          sub === "weekly"
            ? `📅 Laporan mingguan otomatis: <b>${on ? "ON" : "OFF"}</b>`
            : `🤖 Smart Learning: <b>${on ? "ON" : "OFF"}</b>`,
          HTML
        );
        return;
      }

      // 🩺 Auto-Title Doctor (BARU!)
      if (sub === "retitle") {
        if (!isAutoRetitleEnabled()) {
          await ctx.reply(
            "🩺 <b>Auto-Title Doctor</b> sedang nonaktif.\nAdmin bisa menyalakannya dengan <code>ANALYTICS_AUTO_RETITLE_LOW_VIEWS=true</code> di Railway Variables.",
            HTML
          );
          return;
        }
        if ((rest[0] || "").toLowerCase() === "run") {
          const wait = await ctx.reply("🩺 Memeriksa klip ber-views rendah...");
          await syncUserStats(userId).catch(() => {});
          const r = await runAutoRetitle(userId, { force: true });
          if (ctx.chat) await ctx.api.deleteMessage(ctx.chat.id, wait.message_id).catch(() => {});
          // Detail perubahan sudah dikirim lewat notifikasi worker; di sini cukup ringkasan.
          await ctx.reply(
            `🩺 <b>Selesai</b>\n• Kandidat: ${r.candidates}\n• ${r.dryRun ? "Disimulasikan" : "Judul diganti"}: ${r.retitled}\n• Gagal: ${r.failed}` +
              (r.skipped ? `\n<i>${escapeHtml(r.skipped)}</i>` : "") +
              (r.errors.length ? `\n<i>${escapeHtml(r.errors[0].slice(0, 200))}</i>` : ""),
            HTML
          );
          return;
        }
        const [counts, history] = await Promise.all([getRetitleCounts(userId), getRetitleHistory(userId, 5)]);
        const lines = history.map((h) => {
          const icon = h.status === "success" ? "✅" : h.status === "dry_run" ? "🧪" : "⚠️";
          return `${icon} <a href="https://youtu.be/${h.youtubeVideoId}">${h.youtubeVideoId}</a>: ${escapeHtml(h.oldTitle.slice(0, 40))} → <b>${escapeHtml((h.newTitle || h.error || "-").slice(0, 60))}</b>`;
        });
        await ctx.reply(
          "🩺 <b>Auto-Title Doctor</b> — ON ✅" +
            (isRetitleDryRun() ? " (mode simulasi)" : "") +
            `\n<i>Aturan: ${escapeHtml(describeRetitleRules())}</i>\n\n` +
            `Diganti: <b>${counts.success}</b> · Simulasi: ${counts.dryRun} · Gagal: ${counts.failed}` +
            (lines.length ? `\n\n${lines.join("\n")}` : "\n\nBelum ada riwayat.") +
            "\n\n<code>/analytics retitle run</code> — periksa &amp; perbaiki sekarang",
          HTML
        );
        return;
      }

      if (sub === "views") {
        const raw = rest[0] || "";
        const views = parseInt((rest[1] || "").replace(/[.,_]/g, ""), 10);
        const videoId =
          raw.match(/(?:youtu\.be\/|v=|shorts\/)([A-Za-z0-9_-]{11})/)?.[1] ??
          (/^[A-Za-z0-9_-]{11}$/.test(raw) ? raw : undefined);
        if (!videoId || isNaN(views) || views < 0) {
          await ctx.reply("Format: <code>/analytics views &lt;videoId atau link&gt; &lt;jumlah views&gt;</code>", HTML);
          return;
        }
        const ok = await setManualViews(userId, videoId, views);
        await ctx.reply(ok ? `✅ Views <code>${videoId}</code> diset ke <b>${views.toLocaleString("id-ID")}</b>.` : "❌ Video tidak ditemukan di daftar klipmu.", HTML);
        return;
      }

      await ctx.reply(
        "📈 <b>AI Analytics</b>\n\n" +
          "<code>/analytics</code> — laporan performa\n" +
          "<code>/analytics 30</code> — klip 30 hari terakhir\n" +
          "<code>/analytics sync</code> — tarik views terbaru\n" +
          "<code>/analytics learn</code> — AI belajar sekarang\n" +
          "<code>/analytics apply</code> — terapkan hasil belajar\n" +
          "<code>/analytics reset</code> — hapus hasil belajar\n" +
          "<code>/analytics weekly on|off</code> — laporan mingguan\n" +
          "<code>/analytics learning on|off</code> — Smart Learning\n" +
          "<code>/analytics views &lt;id&gt; &lt;jumlah&gt;</code> — isi views manual\n" +
          "<code>/analytics retitle</code> — 🩺 Auto-Title Doctor (status &amp; riwayat)\n" +
          "<code>/analytics retitle run</code> — 🩺 perbaiki judul klip ber-views rendah sekarang",
        HTML
      );
    } catch (err) {
      console.error("[analytics] /analytics error:", err);
      await ctx.reply(`❌ Gagal memproses /analytics: ${escapeHtml(err instanceof Error ? err.message : String(err))}`, HTML);
    }
  });

  // ─── Tombol inline ────────────────────────────────────────────────────

  bot.callbackQuery("an_sync", async (ctx) => {
    const userId = ctx.from.id.toString();
    await ctx.answerCallbackQuery("🔄 Menyinkronkan...");
    try {
      await ctx.reply(await syncAndNotify(ctx, userId), HTML);
      await replyReport(ctx, userId, null, false);
    } catch (err) {
      await ctx.reply(`❌ Sync gagal: ${escapeHtml(err instanceof Error ? err.message : String(err))}`, HTML);
    }
  });

  bot.callbackQuery("an_learn", async (ctx) => {
    const userId = ctx.from.id.toString();
    await ctx.answerCallbackQuery("🧠 AI sedang belajar...");
    try {
      await syncUserStats(userId).catch(() => {});
      const result = await runSmartLearning(userId, { force: true });
      await ctx.reply(formatLearning(result), HTML);
    } catch (err) {
      await ctx.reply(`❌ Gagal belajar: ${escapeHtml(err instanceof Error ? err.message : String(err))}`, HTML);
    }
  });

  bot.callbackQuery("an_weekly", async (ctx) => {
    const userId = ctx.from.id.toString();
    const state = await getOrCreateUserState(userId);
    await patchUserState(userId, { weeklyReportEnabled: !state.weeklyReportEnabled });
    await ctx.answerCallbackQuery(`Laporan mingguan ${!state.weeklyReportEnabled ? "ON" : "OFF"}${isWeeklyReportEnabled() ? "" : " (dimatikan admin)"}`);
    await ctx.editMessageReplyMarkup({ reply_markup: await buildKeyboard(userId) }).catch(() => {});
  });

  bot.callbackQuery("an_learning", async (ctx) => {
    const userId = ctx.from.id.toString();
    const state = await getOrCreateUserState(userId);
    await patchUserState(userId, { learningEnabled: !state.learningEnabled });
    await ctx.answerCallbackQuery(`Smart Learning ${!state.learningEnabled ? "ON" : "OFF"}${isLearningEnabled() ? "" : " (dimatikan admin)"}`);
    await ctx.editMessageReplyMarkup({ reply_markup: await buildKeyboard(userId) }).catch(() => {});
  });

  bot.callbackQuery("an_reset", async (ctx) => {
    const userId = ctx.from.id.toString();
    await resetLearning(userId);
    await ctx.answerCallbackQuery("↩️ Hasil belajar dihapus");
    await ctx.editMessageReplyMarkup({ reply_markup: await buildKeyboard(userId) }).catch(() => {});
    await ctx.reply("↩️ Hasil belajar dihapus. AI kembali memakai DEFAULT_NICHE_PROMPT / niche kustommu.");
  });
}
