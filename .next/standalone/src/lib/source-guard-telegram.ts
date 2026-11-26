/**
 * 🛡️ PERINTAH TELEGRAM SOURCE GUARD (FITUR BARU!)
 * =====================================================================
 * Didaftarkan ke bot lewat satu baris di src/lib/telegram-bot.ts:
 *     registerSourceGuardCommands(bot);
 *
 * Perintah:
 *   /sourceguard                → status, konfigurasi aktif, statistik 24 jam
 *   /whitelist                  → daftar channel yang diizinkan (env + milikmu)
 *   /whitelist add <channel>    → izinkan channel (ID UCxxx / @handle / nama / URL)
 *   /whitelist remove <channel|nomor> → hapus dari whitelist-mu
 *
 * Konfigurasi utama tetap lewat env var — lihat src/lib/source-guard-config.ts.
 */

import type { Bot, Context } from "grammy";
import { escapeHtml } from "@/lib/analytics-report";
import {
  addWhitelistEntry,
  getSourceGuardStats,
  getOwnChannelTokens,
  listUserWhitelist,
  removeWhitelistEntry,
} from "@/lib/source-guard";
import { getCopyrightGuardMode, getEnvWhitelist, getSourceGuardConfigSummary, isOwnChannelAllowed } from "@/lib/source-guard-config";

const HTML = { parse_mode: "HTML" as const, link_preview_options: { is_disabled: true } };

export const SOURCE_GUARD_HELP =
  `\n\n🛡️ *Source Credit & Copyright Guard:*\n` +
  `/sourceguard - Status & konfigurasi pengaman hak cipta\n` +
  `/whitelist - Lihat / tambah / hapus channel yang diizinkan`;

const MODE_LABEL: Record<string, string> = {
  warn: "⚠️ warn (hanya peringatan)",
  block: "⛔ block (blokir pelanggaran)",
  off: "⚪ off (guard mati)",
};

function onOff(v: boolean): string {
  return v ? "✅ aktif" : "❌ nonaktif";
}

export function registerSourceGuardCommands(bot: Bot<Context>): void {
  bot.command("sourceguard", async (ctx) => {
    const cfg = getSourceGuardConfigSummary();
    let statsText = "Statistik belum tersedia.";
    try {
      const stats = await getSourceGuardStats();
      statsText =
        `24 jam terakhir → ✅ lolos: <b>${stats.last24h.allowed}</b> • ⚠️ peringatan: <b>${stats.last24h.warned}</b> • ⛔ diblokir: <b>${stats.last24h.blocked}</b>\n` +
        `Total pengecekan tercatat: <b>${stats.total}</b>`;
    } catch (err) {
      console.error("[source-guard] stats gagal:", err);
    }

    await ctx.reply(
      `🛡️ <b>Source Credit &amp; Copyright Guard</b>\n\n` +
        `Mode: <b>${escapeHtml(MODE_LABEL[cfg.mode])}</b> • Cakupan: <code>${cfg.scope}</code>\n` +
        `Kredit sumber di deskripsi: ${onOff(cfg.creditEnabled)} (${cfg.creditPosition})\n` +
        `<code>${escapeHtml(cfg.creditTemplate)}</code>\n` +
        `Whitelist channel: ${cfg.whitelist.length} dari env${cfg.whitelistRequired ? " • <b>wajib</b>" : ""} • channel milik sendiri: ${onOff(cfg.allowOwnChannel)}\n` +
        `Batas klip / video sumber / hari: <b>${cfg.maxClipsPerSourcePerDay === 0 ? "tanpa batas" : cfg.maxClipsPerSourcePerDay}</b> (zona ${escapeHtml(cfg.timezone)})\n` +
        `Skip video bertanda Content ID: ${onOff(cfg.skipContentId)}\n\n` +
        `${statsText}\n\n` +
        `<b>Cara ubah (Railway Variables):</b>\n` +
        `• <code>SOURCE_CREDIT_ENABLED</code> = true / false\n` +
        `• <code>COPYRIGHT_GUARD_MODE</code> = warn | block | off\n` +
        `• <code>COPYRIGHT_WHITELIST_CHANNELS</code> = UCxxx,@handle,nama\n` +
        `• <code>COPYRIGHT_MAX_CLIPS_PER_SOURCE_PER_DAY</code> = angka (0 = tanpa batas)\n` +
        `• <code>COPYRIGHT_SKIP_CONTENT_ID</code> = true / false\n\n` +
        `ℹ️ Mode <b>warn</b> hanya memberi peringatan; ganti ke <b>block</b> agar video bermasalah benar-benar di-skip. ` +
        `Deteksi Content ID berbasis sinyal (musik berlisensi, penanda deskripsi) — bukan jaminan 100%. Kelola whitelist: /whitelist`,
      HTML
    );
  });

  bot.command("whitelist", async (ctx) => {
    const userId = ctx.from?.id?.toString();
    if (!userId) return;

    const arg = (ctx.match || "").toString().trim();
    const [rawSub, ...rest] = arg.split(/\s+/);
    const sub = (rawSub || "").toLowerCase();
    const value = rest.join(" ").trim();

    try {
      if (sub === "add" || sub === "tambah") {
        if (!value) {
          await ctx.reply("Format: <code>/whitelist add @namachannel</code> (boleh juga ID UCxxx, nama, atau URL channel)", HTML);
          return;
        }
        const res = await addWhitelistEntry(userId, value);
        await ctx.reply(
          res.added
            ? `✅ <code>${escapeHtml(res.entry)}</code> ditambahkan ke whitelist.`
            : `ℹ️ <code>${escapeHtml(res.entry)}</code> sudah ada di whitelist.`,
          HTML
        );
        return;
      }

      if (sub === "remove" || sub === "hapus" || sub === "del") {
        if (!value) {
          await ctx.reply("Format: <code>/whitelist remove &lt;nomor | channel&gt;</code>", HTML);
          return;
        }
        const removed = await removeWhitelistEntry(userId, value);
        await ctx.reply(
          removed
            ? `🗑 <code>${escapeHtml(removed)}</code> dihapus dari whitelist-mu.`
            : "❌ Tidak ditemukan di whitelist-mu. Cek nomor lewat /whitelist (entri dari env hanya bisa diubah di Railway Variables).",
          HTML
        );
        return;
      }

      // default: list
      const mine = await listUserWhitelist(userId);
      const envList = getEnvWhitelist();
      const own = isOwnChannelAllowed() ? await getOwnChannelTokens(userId) : [];
      const lines: string[] = [`🛡️ <b>Whitelist Channel</b> (mode guard: <code>${getCopyrightGuardMode()}</code>)\n`];
      lines.push(
        `<b>Milikmu</b> (${mine.length}):\n` +
          (mine.length ? mine.map((r, i) => `${i + 1}. <code>${escapeHtml(r.label || r.entry)}</code>`).join("\n") : "— kosong —")
      );
      lines.push(
        `\n<b>Global (env COPYRIGHT_WHITELIST_CHANNELS)</b> (${envList.length}):\n` +
          (envList.length ? envList.map((e) => `• <code>${escapeHtml(e)}</code>`).join("\n") : "— kosong —")
      );
      lines.push(
        `\n<b>Channel YouTube milikmu (otomatis)</b>: ` +
          (own.length ? `<code>${escapeHtml(own.slice(0, 3).join(", "))}</code>` : "tidak terdeteksi (kirim /connect ulang bila perlu izin baca)")
      );
      lines.push(
        `\n➕ <code>/whitelist add @channel</code>\n➖ <code>/whitelist remove 1</code>\n\n` +
          `Whitelist aktif bila ada isinya atau <code>COPYRIGHT_WHITELIST_REQUIRED=true</code>. Video dari channel di luar daftar ` +
          `diberi peringatan (mode warn) atau di-skip (mode block).`
      );
      await ctx.reply(lines.join("\n"), HTML);
    } catch (err) {
      console.error("[source-guard] /whitelist gagal:", err);
      await ctx.reply(`❌ Gagal: ${escapeHtml(err instanceof Error ? err.message : String(err))}`, HTML);
    }
  });
}
