/**
 * 💰 PERINTAH TELEGRAM — COST TRACKER (FITUR BARU!)
 * =====================================================================
 * Didaftarkan ke bot lewat satu baris di src/lib/telegram-bot.ts:
 *     registerCostCommands(bot);
 * dan satu baris di handleVideoUrl (setelah guardJobQuota):
 *     if (!(await guardAiBudget(ctx, userId))) return;
 *
 * Perintah:
 *   /cost                → ringkasan biaya (admin: SEMUA user · user biasa: akunnya sendiri)
 *   /cost 30             → periode 30 hari (1–90)
 *   /cost me             → biaya akunmu sendiri (untuk admin)
 *   /cost models [hari]  → bandingkan biaya per model (menentukan model mana yang layak)
 *   /cost jobs [n]       → biaya per job terbaru
 *   /cost users [hari]   → biaya per user (khusus admin)
 *   /cost price          → harga model yang sedang dipakai (khusus admin)
 *
 * Admin = ID di ADMIN_TELEGRAM_IDS. Biaya global tidak ditampilkan ke user biasa.
 */

import type { Bot, Context } from "grammy";
import { isAdmin } from "@/lib/admin-config";
import { getGeminiModel, getGroqModel, getGroqWhisperModel } from "@/lib/ai-provider";
import { COST_TEXT, getCostReportDays, isCostTrackerEnabled } from "@/lib/cost-config";
import { buildCostReport, buildJobsReport, buildModelReport, buildPriceReport, buildUsersReport } from "@/lib/cost-report";
import { checkAiBudget } from "@/lib/cost-tracker";

const HTML = { parse_mode: "HTML" as const, link_preview_options: { is_disabled: true } };

/** Dipakai di /help (format Markdown, sama seperti CLAIM_MONITOR_HELP). */
export const COST_HELP =
  `\n\n💰 *Cost Tracker:*\n` +
  `/cost - Biaya AI (OpenAI/Gemini/Whisper) per job & per user\n` +
  `/cost models - Bandingkan biaya per model\n` +
  `/cost jobs - Biaya per job terbaru`;

async function reply(ctx: Context, text: string): Promise<void> {
  // Batas pesan Telegram 4096 karakter
  await ctx.reply(text.slice(0, 4000), HTML);
}

/**
 * Tolak job baru kalau batas biaya AI harian tercapai (COST_BUDGET_MODE=pause).
 * Return true = boleh lanjut. Pola sama dengan guardJobQuota (admin-telegram.ts).
 */
export async function guardAiBudget(ctx: Context, userId: string): Promise<boolean> {
  const status = await checkAiBudget({ userId });
  if (status.allowed) return true;
  await ctx.reply(status.scope === "user" ? COST_TEXT.userPaused : COST_TEXT.globalPaused, HTML).catch(() => {});
  return false;
}

function parseDays(arg: string | undefined, def: number): number {
  const n = parseInt(arg ?? "", 10);
  return Number.isFinite(n) ? Math.min(90, Math.max(1, n)) : def;
}

export function registerCostCommands(bot: Bot<Context>): void {
  bot.command("cost", async (ctx) => {
    const userId = ctx.from?.id?.toString();
    if (!userId) return;
    if (!isCostTrackerEnabled()) {
      await reply(ctx, "💰 <b>Cost Tracker</b> sedang nonaktif.\nAdmin bisa menyalakannya dengan <code>COST_TRACKER_ENABLED=true</code> di Railway Variables.");
      return;
    }

    const admin = isAdmin(userId);
    const args = (ctx.match || "").toString().trim().toLowerCase().split(/\s+/).filter(Boolean);
    const sub = args[0] || "";
    const defaultDays = getCostReportDays();

    try {
      // /cost 30 (angka saja = periode)
      if (!sub || /^\d+$/.test(sub)) {
        const days = parseDays(sub, defaultDays);
        await reply(ctx, await buildCostReport({ userId: admin ? null : userId, days }));
        return;
      }

      if (sub === "me") {
        await reply(ctx, await buildCostReport({ userId, days: parseDays(args[1], defaultDays) }));
        return;
      }

      if (sub === "models" || sub === "model") {
        await reply(ctx, await buildModelReport({ userId: admin ? null : userId, days: parseDays(args[1], 30) }));
        return;
      }

      if (sub === "jobs" || sub === "job") {
        const limit = Math.min(20, Math.max(1, parseInt(args[1] ?? "", 10) || 8));
        await reply(ctx, await buildJobsReport({ userId: admin ? null : userId, limit }));
        return;
      }

      if (sub === "users" || sub === "user" || sub === "price" || sub === "harga") {
        if (!admin) {
          await reply(ctx, "🔒 Perintah ini khusus admin.");
          return;
        }
        if (sub === "users" || sub === "user") {
          await reply(ctx, await buildUsersReport(parseDays(args[1], defaultDays)));
          return;
        }
        await reply(
          ctx,
          await buildPriceReport([
            { label: "Gemini (teks)", model: getGeminiModel(), kind: "text" },
            { label: "Groq (teks)", model: getGroqModel(), kind: "text" },
            { label: "Groq Whisper", model: getGroqWhisperModel(), kind: "audio" },
            { label: "OpenAI (analisis)", model: "gpt-4o-mini", kind: "text" },
            { label: "OpenAI Whisper", model: "whisper-1", kind: "audio" },
          ])
        );
        return;
      }

      await reply(
        ctx,
        "💰 <b>Cost Tracker</b>\n\n" +
          "<code>/cost</code> — ringkasan biaya AI\n" +
          "<code>/cost 30</code> — periode 30 hari\n" +
          "<code>/cost models</code> — bandingkan biaya per model\n" +
          "<code>/cost jobs</code> — biaya per job terbaru\n" +
          (admin ? "<code>/cost me</code> — biaya akunmu saja\n<code>/cost users</code> — biaya per user\n<code>/cost price</code> — harga model yang dipakai\n" : "")
      );
    } catch (err) {
      console.error("[cost] /cost gagal:", err);
      await ctx.reply("⚠️ Terjadi kesalahan saat memproses /cost. Coba lagi sebentar lagi.");
    }
  });
}
