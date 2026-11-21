/**
 * ✂️ PERINTAH & TOMBOL TELEGRAM — AUTO-PRUNE KLIP GAGAL (FITUR BARU!)
 * =====================================================================
 * Didaftarkan ke bot lewat satu baris di src/lib/telegram-bot.ts:
 *     registerAutoPruneCommands(bot);
 *
 * Perintah:
 *   /prune         → status, aturan, & jumlah usulan
 *   /prune list    → kirim ulang usulan yang masih menunggu keputusan (dengan tombol)
 *   /prune run     → cari klip gagal sekarang (sync views dulu)
 *
 * Tombol di tiap usulan (callback data `prune:<aksi>:<id>`):
 *   h = sembunyikan · d = hapus (minta konfirmasi) · dc = konfirmasi hapus
 *   k = pertahankan · b = batal konfirmasi
 */

import { InlineKeyboard, type Bot, type Context } from "grammy";
import { syncUserStats } from "@/lib/analytics-store";
import { escapeHtml } from "@/lib/analytics-report";
import {
  applyPruneDecision,
  buildPruneKeyboard,
  buildPruneMessage,
  getOwnedSuggestion,
  getPendingSuggestions,
  getPruneCounts,
  getPruneHistory,
  runAutoPrune,
  sendPruneSuggestions,
  type PruneDecision,
} from "@/lib/auto-prune";
import {
  PRUNE_TEXT,
  describePruneRules,
  getPruneActions,
  getPruneHideTo,
  getPruneMaxPerNotify,
  isAutoPruneEnabled,
  isPruneDeleteConfirmRequired,
} from "@/lib/auto-prune-config";

const HTML = { parse_mode: "HTML" as const, link_preview_options: { is_disabled: true } };

export function registerAutoPruneCommands(bot: Bot<Context>): void {
  bot.command("prune", async (ctx) => {
    const userId = ctx.from?.id?.toString();
    if (!userId) return;
    if (!isAutoPruneEnabled()) {
      await ctx.reply(
        "✂️ <b>Auto-Prune Klip Gagal</b> sedang nonaktif.\nAdmin bisa menyalakannya dengan <code>AUTO_PRUNE_ENABLED=true</code> di Railway Variables.",
        HTML
      );
      return;
    }
    const sub = (ctx.match || "").toString().trim().split(/\s+/)[0].toLowerCase();

    try {
      if (sub === "run") {
        const wait = await ctx.reply("✂️ Memeriksa klip yang performanya gagal...");
        await syncUserStats(userId).catch(() => {});
        const r = await runAutoPrune(userId, { notify: false });
        if (ctx.chat) await ctx.api.deleteMessage(ctx.chat.id, wait.message_id).catch(() => {});
        await ctx.reply(
          `✂️ <b>Selesai</b>\n• Klip memenuhi kriteria (menunggu keputusan): ${r.candidates}\n• Usulan baru: ${r.suggested}` +
            (r.skipped ? `\n<i>${escapeHtml(r.skipped)}</i>` : "") +
            (r.errors.length ? `\n<i>${escapeHtml(r.errors[0].slice(0, 200))}</i>` : "") +
            (r.candidates ? "\n\nKetik <code>/prune list</code> untuk melihat & memutuskan." : ""),
          HTML
        );
        return;
      }

      if (sub === "list") {
        const rows = await getPendingSuggestions(userId, getPruneMaxPerNotify() * 2);
        if (!rows.length) {
          await ctx.reply("✅ Tidak ada usulan yang menunggu keputusan.", HTML);
          return;
        }
        const total = (await getPruneCounts(userId)).pending;
        await sendPruneSuggestions(userId, rows, { totalPending: total, readableCount: 0 });
        return;
      }

      const [counts, history] = await Promise.all([getPruneCounts(userId), getPruneHistory(userId, 5)]);
      const icon: Record<string, string> = { hidden: "🙈", deleted: "🗑", kept: "✅" };
      const lines = history.map((h) => `${icon[h.status] || "•"} ${escapeHtml(h.title.slice(0, 50))} (${h.views} views)`);
      await ctx.reply(
        "✂️ <b>Auto-Prune Klip Gagal</b> — ON ✅\n" +
          `<i>Aturan: ${escapeHtml(describePruneRules())}</i>\n` +
          `<i>Tombol: ${getPruneActions().map((a) => (a === "hide" ? `sembunyikan → ${getPruneHideTo()}` : "hapus")).join(", ")}</i>\n\n` +
          `Menunggu keputusan: <b>${counts.pending}</b> · Disembunyikan: ${counts.hidden} · Dihapus: ${counts.deleted} · Dipertahankan: ${counts.kept}` +
          (lines.length ? `\n\n<b>Keputusan terakhir</b>\n${lines.join("\n")}` : "") +
          "\n\n<code>/prune list</code> — lihat usulan\n<code>/prune run</code> — cari klip gagal sekarang\n" +
          "<i>Bot hanya mengusulkan; kamu yang memutuskan.</i>",
        HTML
      );
    } catch (err) {
      console.error("[auto-prune] /prune gagal:", err);
      await ctx.reply("⚠️ Terjadi kesalahan saat memproses /prune. Coba lagi sebentar lagi.");
    }
  });

  // Tombol: prune:<h|d|dc|k|b>:<id>
  bot.callbackQuery(/^prune:(h|d|dc|k|b):(\d+)$/, async (ctx) => {
    const userId = ctx.from?.id?.toString();
    const [, act, rawId] = ctx.match as unknown as [string, string, string];
    const id = parseInt(rawId, 10);
    if (!userId) return;

    try {
      // Minta konfirmasi sebelum hapus permanen
      if (act === "d" && isPruneDeleteConfirmRequired()) {
        const row = await getOwnedSuggestion(userId, id);
        if (!row || row.status !== "pending") {
          await ctx.answerCallbackQuery({ text: "Usulan sudah diputuskan." });
          return;
        }
        const kb = new InlineKeyboard().text("🗑 Ya, hapus permanen", `prune:dc:${id}`).text("↩️ Batal", `prune:b:${id}`);
        await ctx.answerCallbackQuery();
        await ctx.editMessageText(`${buildPruneMessage(row)}\n\n${PRUNE_TEXT.confirmDelete}`, { ...HTML, reply_markup: kb });
        return;
      }

      if (act === "b") {
        const row = await getOwnedSuggestion(userId, id);
        await ctx.answerCallbackQuery({ text: "Dibatalkan" });
        if (row) await ctx.editMessageText(buildPruneMessage(row), { ...HTML, reply_markup: buildPruneKeyboard(id) });
        return;
      }

      const decision: PruneDecision = act === "h" ? "hide" : act === "k" ? "keep" : "delete";
      await ctx.answerCallbackQuery({ text: "Memproses..." });
      const result = await applyPruneDecision(userId, id, decision);

      if (result.ok && result.row) {
        await ctx.editMessageText(`${buildPruneMessage(result.row)}\n\n${result.message}`, { ...HTML, reply_markup: undefined });
      } else if (result.row && result.status && result.status !== "pending") {
        // sudah diputuskan sebelumnya → hilangkan tombol
        await ctx.editMessageText(`${buildPruneMessage(result.row)}\n\nℹ️ ${escapeHtml(result.message)}`, { ...HTML, reply_markup: undefined });
      } else {
        // gagal: tombol tetap ada supaya bisa dicoba lagi
        await ctx.reply(`⚠️ ${escapeHtml(result.message)}`, HTML);
        if (result.row) await ctx.editMessageReplyMarkup({ reply_markup: buildPruneKeyboard(id) }).catch(() => {});
      }
    } catch (err) {
      console.error("[auto-prune] tombol gagal:", err);
      await ctx.answerCallbackQuery({ text: "Terjadi kesalahan, coba lagi." }).catch(() => {});
    }
  });
}
