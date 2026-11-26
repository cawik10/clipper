/**
 * 🚨 PERINTAH & TOMBOL TELEGRAM — POST-UPLOAD CLAIM MONITOR (FITUR BARU!)
 * =====================================================================
 * Didaftarkan ke bot lewat satu baris di src/lib/telegram-bot.ts:
 *     registerClaimMonitorCommands(bot);
 *
 * Perintah:
 *   /claims                → status, aturan, ringkasan klaim & rasio per channel
 *   /claims list           → kirim ulang alert yang masih menunggu keputusan (dengan tombol)
 *   /claims channels       → rasio klaim lengkap per source channel
 *   /claims run            → cek status video di YouTube sekarang
 *   /blacklist             → daftar channel yang di-blacklist (auto + manual + env)
 *   /blacklist add <channel>      → blacklist manual (ID UCxxx / @handle / nama / URL)
 *   /blacklist remove <nomor|channel> → keluarkan dari blacklist
 *
 * Tombol di tiap alert (callback data `claim:<aksi>:<id>`):
 *   d = hapus (minta konfirmasi) · dc = konfirmasi hapus · p = private · i = abaikan · b = batal
 * Tombol di notifikasi auto-blacklist: `bl:rm:<id>` = keluarkan dari blacklist.
 */

import { InlineKeyboard, type Bot, type Context } from "grammy";
import { escapeHtml } from "@/lib/analytics-report";
import {
  applyClaimDecision,
  blacklistChannelManually,
  buildClaimKeyboard,
  buildClaimMessage,
  getChannelClaimStats,
  getClaimCounts,
  getClaimHistory,
  getOwnedClaim,
  getPendingClaims,
  runClaimMonitor,
  sendClaimAlerts,
  type ClaimDecision,
} from "@/lib/claim-monitor";
import {
  CLAIM_TEXT,
  describeBlacklistRule,
  getBlacklistEnforce,
  getClaimActions,
  getClaimHideTo,
  getClaimIntervalMinutes,
  getClaimMaxAlertsPerCycle,
  getClaimSignals,
  getEnvBlacklist,
  isAutoBlacklistEnabled,
  isClaimDeleteConfirmRequired,
  isClaimMonitorEnabled,
} from "@/lib/claim-monitor-config";
import { listBlacklist, removeBlacklistById, removeBlacklistEntry } from "@/lib/source-blacklist";

const HTML = { parse_mode: "HTML" as const, link_preview_options: { is_disabled: true } };

export const CLAIM_MONITOR_HELP =
  `\n\n🚨 *Post-Upload Claim Monitor:*\n` +
  `/claims - Status klaim video & rasio klaim per channel sumber\n` +
  `/blacklist - Lihat / tambah / hapus channel sumber yang di-blacklist`;

const ENFORCE_LABEL: Record<string, string> = {
  block: "⛔ block (job ditolak)",
  warn: "⚠️ warn (peringatan saja)",
  off: "⚪ off (hanya dicatat)",
};

function bar(percent: number): string {
  const filled = Math.round(Math.min(100, Math.max(0, percent)) / 10);
  return "▰".repeat(filled) + "▱".repeat(10 - filled);
}

function formatChannelLine(s: { channelName: string; claims: number; clips: number; ratioPercent: number; blacklisted: boolean }): string {
  return (
    `${s.blacklisted ? "⛔" : s.ratioPercent >= 30 ? "🔴" : s.claims > 0 ? "🟡" : "🟢"} <b>${escapeHtml(s.channelName.slice(0, 40))}</b>\n` +
    `    ${bar(s.ratioPercent)} ${s.ratioPercent}% (${s.claims}/${s.clips} klip)`
  );
}

export function registerClaimMonitorCommands(bot: Bot<Context>): void {
  // ─── /claims ───────────────────────────────────────────────────────────
  bot.command("claims", async (ctx) => {
    const userId = ctx.from?.id?.toString();
    if (!userId) return;
    if (!isClaimMonitorEnabled()) {
      await ctx.reply(
        "🚨 <b>Post-Upload Claim Monitor</b> sedang nonaktif.\nAdmin bisa menyalakannya dengan <code>CLAIM_MONITOR_ENABLED=true</code> di Railway Variables.",
        HTML
      );
      return;
    }
    const sub = (ctx.match || "").toString().trim().split(/\s+/)[0].toLowerCase();

    try {
      if (sub === "run" || sub === "cek") {
        const wait = await ctx.reply("🚨 Mengecek status video di YouTube...");
        const r = await runClaimMonitor({ userId, force: true, notify: false });
        if (ctx.chat) await ctx.api.deleteMessage(ctx.chat.id, wait.message_id).catch(() => {});
        const pending = (await getClaimCounts(userId)).pending;
        await ctx.reply(
          `🚨 <b>Pengecekan selesai</b>\n• Video dicek: ${r.checked}\n• Klaim baru: ${r.newClaims} · dilepas: ${r.cleared}\n• Video sudah hilang: ${r.missing}\n• Channel di-auto-blacklist: ${r.blacklisted}` +
            (r.errors.length ? `\n<i>⚠️ ${escapeHtml(r.errors[0].slice(0, 200))}</i>` : "") +
            (pending ? `\n\n<b>${pending}</b> klip menunggu keputusan — ketik <code>/claims list</code>.` : "\n\n✅ Tidak ada klip yang menunggu keputusan."),
          HTML
        );
        return;
      }

      if (sub === "list") {
        const rows = await getPendingClaims(userId, getClaimMaxAlertsPerCycle() * 2);
        if (!rows.length) {
          await ctx.reply("✅ Tidak ada klaim yang menunggu keputusan.", HTML);
          return;
        }
        const total = (await getClaimCounts(userId)).pending;
        await sendClaimAlerts(userId, rows, total);
        return;
      }

      if (sub === "channels" || sub === "channel" || sub === "rasio") {
        const stats = await getChannelClaimStats(userId);
        if (!stats.length) {
          await ctx.reply("ℹ️ Belum ada data. Rasio muncul setelah klip dari source channel dicek (<code>/claims run</code>).", HTML);
          return;
        }
        await ctx.reply(
          `📊 <b>Rasio Klaim per Source Channel</b>\n<i>Auto-blacklist: ${isAutoBlacklistEnabled() ? escapeHtml(describeBlacklistRule()) : "nonaktif"}</i>\n\n` +
            stats.slice(0, 20).map(formatChannelLine).join("\n\n"),
          HTML
        );
        return;
      }

      // default: ringkasan
      const [counts, history, stats] = await Promise.all([getClaimCounts(userId), getClaimHistory(userId, 5), getChannelClaimStats(userId)]);
      const icon: Record<string, string> = { private: "🔒", unlisted: "🔗", deleted: "🗑", ignored: "🙈" };
      const lines = history.map((h) => `${icon[h.actionStatus] || "•"} ${escapeHtml(h.title.slice(0, 50))}`);
      const top = stats.filter((s) => s.claims > 0).slice(0, 3);
      await ctx.reply(
        "🚨 <b>Post-Upload Claim Monitor</b> — ON ✅\n" +
          `<i>Cek tiap ${getClaimIntervalMinutes()} menit · sinyal: ${getClaimSignals().join(", ")}</i>\n` +
          `<i>Tombol: ${getClaimActions().map((a) => (a === "delete" ? "hapus" : `private → ${getClaimHideTo()}`)).join(", ")}, abaikan</i>\n\n` +
          `📹 Video dipantau: <b>${counts.tracked}</b> (sudah dicek: ${counts.checked})\n` +
          `🚩 Kena klaim/pembatasan: <b>${counts.claimed}</b> · menunggu keputusan: <b>${counts.pending}</b>\n` +
          `🔒 Private: ${counts.privated} · 🗑 Dihapus: ${counts.deleted} · 🙈 Diabaikan: ${counts.ignored}` +
          (top.length ? `\n\n<b>Channel paling sering diklaim</b>\n${top.map(formatChannelLine).join("\n")}` : "") +
          (lines.length ? `\n\n<b>Keputusan terakhir</b>\n${lines.join("\n")}` : "") +
          "\n\n<code>/claims list</code> — lihat alert menunggu\n<code>/claims channels</code> — rasio per channel\n<code>/claims run</code> — cek sekarang\n<code>/blacklist</code> — channel yang diblokir\n" +
          "<i>Bot hanya memberi alert; kamu yang memutuskan lewat tombol.</i>",
        HTML
      );
    } catch (err) {
      console.error("[claim-monitor] /claims gagal:", err);
      await ctx.reply("⚠️ Terjadi kesalahan saat memproses /claims. Coba lagi sebentar lagi.");
    }
  });

  // ─── /blacklist ────────────────────────────────────────────────────────
  bot.command("blacklist", async (ctx) => {
    const userId = ctx.from?.id?.toString();
    if (!userId) return;

    const arg = (ctx.match || "").toString().trim();
    const [rawSub, ...rest] = arg.split(/\s+/);
    const sub = (rawSub || "").toLowerCase();
    const value = rest.join(" ").trim();

    try {
      if (sub === "add" || sub === "tambah") {
        if (!value) {
          await ctx.reply("Format: <code>/blacklist add @namachannel</code> (boleh juga ID UCxxx, nama, atau URL channel)", HTML);
          return;
        }
        const res = await blacklistChannelManually(userId, value);
        await ctx.reply(
          res.added
            ? `⛔ <code>${escapeHtml(res.label)}</code> masuk blacklist.` +
                (res.pausedMonitors ? `\n⏸ ${res.pausedMonitors} Auto-Monitor untuk channel ini dijeda.` : "")
            : `ℹ️ <code>${escapeHtml(res.label)}</code> sudah ada di blacklist.`,
          HTML
        );
        return;
      }

      if (sub === "remove" || sub === "hapus" || sub === "del") {
        if (!value) {
          await ctx.reply("Format: <code>/blacklist remove &lt;nomor | channel&gt;</code>", HTML);
          return;
        }
        const removed = await removeBlacklistEntry(userId, value);
        await ctx.reply(
          removed
            ? `✅ <code>${escapeHtml(removed.channelName || removed.channelKey)}</code> dikeluarkan dari blacklist.\n<i>Auto-Monitor yang sempat dijeda bisa dinyalakan lagi lewat /monitoron.</i>`
            : "❌ Tidak ditemukan di blacklist-mu. Cek nomor lewat /blacklist (entri dari env hanya bisa diubah di Railway Variables).",
          HTML
        );
        return;
      }

      // default: list
      const mine = await listBlacklist(userId);
      const envList = getEnvBlacklist();
      const lines: string[] = [`⛔ <b>Blacklist Source Channel</b> (mode: <code>${ENFORCE_LABEL[getBlacklistEnforce()]}</code>)\n`];
      lines.push(
        `<b>Milikmu</b> (${mine.length}):\n` +
          (mine.length
            ? mine
                .map(
                  (r, i) =>
                    `${i + 1}. <code>${escapeHtml(r.channelName || r.channelKey)}</code> — ${r.origin === "auto" ? `🤖 auto (${r.claims}/${r.clips} klip, ${r.ratioPercent}%)` : "✍️ manual"}`
                )
                .join("\n")
            : "— kosong —")
      );
      lines.push(
        `\n<b>Global (env CLAIM_BLACKLIST_CHANNELS)</b> (${envList.length}):\n` +
          (envList.length ? envList.map((e) => `• <code>${escapeHtml(e)}</code>`).join("\n") : "— kosong —")
      );
      lines.push(
        `\n🤖 Auto-blacklist: <b>${isAutoBlacklistEnabled() ? "aktif" : "nonaktif"}</b>` +
          (isAutoBlacklistEnabled() ? `\n<i>${escapeHtml(describeBlacklistRule())}</i>` : "")
      );
      lines.push(
        `\n➕ <code>/blacklist add @channel</code>\n➖ <code>/blacklist remove 1</code>\n📊 <code>/claims channels</code> — lihat rasio klaim\n\n` +
          `Channel di blacklist tidak diproses lagi (job ditolak Source Guard & Auto-Monitor dijeda). Channel whitelist / milik sendiri tidak pernah di-auto-blacklist.`
      );
      await ctx.reply(lines.join("\n"), HTML);
    } catch (err) {
      console.error("[claim-monitor] /blacklist gagal:", err);
      await ctx.reply(`❌ Gagal: ${escapeHtml(err instanceof Error ? err.message : String(err))}`, HTML);
    }
  });

  // ─── Tombol alert klaim: claim:<d|dc|p|i|b>:<id> ───────────────────────
  bot.callbackQuery(/^claim:(d|dc|p|i|b):(\d+)$/, async (ctx) => {
    const userId = ctx.from?.id?.toString();
    const [, act, rawId] = ctx.match as unknown as [string, string, string];
    const id = parseInt(rawId, 10);
    if (!userId) return;

    try {
      // Minta konfirmasi sebelum hapus permanen
      if (act === "d" && isClaimDeleteConfirmRequired()) {
        const row = await getOwnedClaim(userId, id);
        if (!row || row.actionStatus !== "pending") {
          await ctx.answerCallbackQuery({ text: "Alert sudah diputuskan." });
          return;
        }
        const kb = new InlineKeyboard().text("🗑 Ya, hapus permanen", `claim:dc:${id}`).text("↩️ Batal", `claim:b:${id}`);
        await ctx.answerCallbackQuery();
        await ctx.editMessageText(`${buildClaimMessage(row)}\n\n${CLAIM_TEXT.confirmDelete}`, { ...HTML, reply_markup: kb });
        return;
      }

      if (act === "b") {
        const row = await getOwnedClaim(userId, id);
        await ctx.answerCallbackQuery({ text: "Dibatalkan" });
        if (row) await ctx.editMessageText(buildClaimMessage(row), { ...HTML, reply_markup: buildClaimKeyboard(id) });
        return;
      }

      const decision: ClaimDecision = act === "p" ? "private" : act === "i" ? "ignore" : "delete";
      await ctx.answerCallbackQuery({ text: "Memproses..." });
      const result = await applyClaimDecision(userId, id, decision);

      if (result.ok && result.row) {
        await ctx.editMessageText(`${buildClaimMessage(result.row)}\n\n${result.message}`, { ...HTML, reply_markup: undefined });
      } else if (result.row && result.status && result.status !== "pending") {
        // sudah diputuskan sebelumnya → hilangkan tombol
        await ctx.editMessageText(`${buildClaimMessage(result.row)}\n\nℹ️ ${escapeHtml(result.message)}`, { ...HTML, reply_markup: undefined });
      } else {
        // gagal: tombol tetap ada supaya bisa dicoba lagi
        await ctx.reply(`⚠️ ${escapeHtml(result.message)}`, HTML);
        if (result.row) await ctx.editMessageReplyMarkup({ reply_markup: buildClaimKeyboard(id) }).catch(() => {});
      }
    } catch (err) {
      console.error("[claim-monitor] tombol gagal:", err);
      await ctx.answerCallbackQuery({ text: "Terjadi kesalahan, coba lagi." }).catch(() => {});
    }
  });

  // ─── Tombol notifikasi auto-blacklist: bl:rm:<id> ──────────────────────
  bot.callbackQuery(/^bl:rm:(\d+)$/, async (ctx) => {
    const userId = ctx.from?.id?.toString();
    const [, rawId] = ctx.match as unknown as [string, string];
    if (!userId) return;
    try {
      const removed = await removeBlacklistById(userId, parseInt(rawId, 10));
      await ctx.answerCallbackQuery({ text: removed ? "Dikeluarkan dari blacklist" : "Sudah tidak ada di blacklist" });
      if (removed) {
        await ctx.editMessageText(
          `✅ <b>${escapeHtml(removed.channelName || removed.channelKey)}</b> dikeluarkan dari blacklist.\n<i>Auto-Monitor yang sempat dijeda bisa dinyalakan lagi lewat /monitoron.</i>`,
          { ...HTML, reply_markup: undefined }
        );
      } else {
        await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
      }
    } catch (err) {
      console.error("[claim-monitor] tombol blacklist gagal:", err);
      await ctx.answerCallbackQuery({ text: "Terjadi kesalahan, coba lagi." }).catch(() => {});
    }
  });
}
