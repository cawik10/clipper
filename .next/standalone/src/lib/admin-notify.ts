/**
 * 🚨 NOTIFIKASI ERROR OTOMATIS KE ADMIN (FITUR BARU!)
 * =====================================================================
 * `reportError(source, err, ctx)` dipanggil dari titik-titik penting:
 *   - bot.catch (error handler Telegram)         → src/lib/telegram-bot.ts
 *   - kegagalan job (clip / publish stage)       → src/lib/job-processor.ts
 *   - webhook Telegram                           → src/app/api/telegram/webhook/route.ts
 *   - unhandledRejection / uncaughtException     → src/instrumentation.ts
 *
 * Aman dipanggil di mana saja: TIDAK PERNAH melempar error, tidak memblokir,
 * ada dedupe (error sama tidak dikirim berulang) + batas pesan per menit.
 * Memakai fetch langsung ke Telegram API (tanpa import bot → tidak circular).
 * Pengaturan: lihat src/lib/admin-config.ts.
 */

import { getAdminIds, getAdminTimezone, getErrorConfig } from "@/lib/admin-config";

export function escapeHtmlText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Kirim pesan HTML ke satu chat lewat Telegram Bot API (tanpa grammy). */
export async function sendTelegramHtml(chatId: string | number, text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text.slice(0, 4000),
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Kirim pesan HTML ke SEMUA admin. */
export async function notifyAdmins(text: string): Promise<void> {
  await Promise.all(getAdminIds().map((id) => sendTelegramHtml(id, text)));
}

// ─── Dedupe & rate limit (in-memory, cukup untuk 1 instance Railway) ─────
const recent = new Map<string, number>();
let windowStart = 0;
let windowCount = 0;

function shouldSend(key: string, dedupeSeconds: number, maxPerMinute: number): boolean {
  const now = Date.now();

  if (now - windowStart > 60_000) {
    windowStart = now;
    windowCount = 0;
  }
  if (windowCount >= maxPerMinute) return false;

  const last = recent.get(key);
  if (last && now - last < dedupeSeconds * 1000) return false;

  recent.set(key, now);
  windowCount++;

  if (recent.size > 200) {
    for (const [k, t] of recent) {
      if (now - t > dedupeSeconds * 1000) recent.delete(k);
    }
  }
  return true;
}

export interface ErrorContext {
  userId?: string | number;
  jobId?: string;
  extra?: string;
}

function formatTime(): string {
  try {
    return new Date().toLocaleString("id-ID", { timeZone: getAdminTimezone(), hour12: false });
  } catch {
    return new Date().toISOString();
  }
}

/** Laporkan error ke semua admin. Tidak pernah throw. */
export async function reportError(source: string, err: unknown, ctx: ErrorContext = {}): Promise<void> {
  try {
    const cfg = getErrorConfig();
    if (!cfg.enabled || !getAdminIds().length) return;

    const message = err instanceof Error ? err.message : typeof err === "string" ? err : safeStringify(err);
    const stack = err instanceof Error ? err.stack || "" : "";

    const lower = `${message}\n${stack}`.toLowerCase();
    if (cfg.ignore.some((k) => lower.includes(k))) return;

    const key = `${source}|${message.slice(0, 200)}`;
    if (!shouldSend(key, cfg.dedupeSeconds, cfg.maxPerMinute)) return;

    const lines: string[] = [`🚨 <b>Error: ${escapeHtmlText(source)}</b>`, `🕒 ${escapeHtmlText(formatTime())}`];
    if (ctx.userId !== undefined) lines.push(`👤 User: <code>${escapeHtmlText(String(ctx.userId))}</code>`);
    if (ctx.jobId) lines.push(`🧾 Job: <code>${escapeHtmlText(ctx.jobId)}</code>`);
    if (ctx.extra) lines.push(`ℹ️ ${escapeHtmlText(ctx.extra.slice(0, 300))}`);

    lines.push("", `<pre>${escapeHtmlText(message.slice(0, cfg.maxChars))}</pre>`);

    const stackLines = stack
      .split("\n")
      .slice(1, 5)
      .map((l) => l.trim())
      .filter(Boolean)
      .join("\n");
    if (stackLines) lines.push(`<pre>${escapeHtmlText(stackLines.slice(0, 500))}</pre>`);

    await notifyAdmins(lines.join("\n"));
  } catch (e) {
    console.error("[admin-notify] gagal mengirim notifikasi error:", e);
  }
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
}
