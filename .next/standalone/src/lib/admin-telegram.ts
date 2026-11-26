/**
 * 🛠️ ADMIN PANEL TELEGRAM (FITUR BARU!)
 * =====================================================================
 * Didaftarkan ke bot lewat 2 baris di src/lib/telegram-bot.ts:
 *     registerAdminGuard(bot);     // paling awal: catat user + blokir user yang diban
 *     registerAdminCommands(bot);  // /admin & /broadcast
 * Dan 1 baris di handleVideoUrl:  `if (!(await guardJobQuota(ctx, userId))) return;`
 *
 * Perintah (hanya untuk ID di ADMIN_TELEGRAM_IDS):
 *   /admin                           → panel dengan tombol (statistik, user, config)
 *   /admin stats                     → statistik global
 *   /admin users [halaman]           → daftar user
 *   /admin user <id|@username>       → detail + tombol aksi
 *   /admin ban <id|@username> [alasan]
 *   /admin unban <id|@username>
 *   /admin quota <id|@username> <angka|default|unlimited>
 *   /broadcast <pesan>               → kirim ke semua user
 *
 * Pengaturan & teks: src/lib/admin-config.ts. Data: src/lib/admin-store.ts.
 */

import { Bot, Context, GrammyError, InlineKeyboard } from "grammy";
import { randomBytes } from "crypto";
import {
  ADMIN_TEXT,
  getAdminIds,
  getAdminTimezone,
  getBroadcastConfig,
  getDefaultQuota,
  getErrorConfig,
  getQuotaPeriodLabel,
  getUsersPerPage,
  isAdmin,
  isAdminEnabled,
  isAdminExemptFromQuota,
  shouldNotifyUserOnBan,
  getQuotaPeriod,
} from "@/lib/admin-config";
import {
  AdminUserRow,
  checkUserAccess,
  createBroadcastLog,
  displayName,
  effectiveQuota,
  finishBroadcastLog,
  getBroadcastRecipients,
  getGlobalStats,
  getUserDetail,
  listUsers,
  resolveUserId,
  setBan,
  setQuota,
  trackUser,
} from "@/lib/admin-store";
import { escapeHtmlText as esc, reportError } from "@/lib/admin-notify";

type Kb = InlineKeyboard | undefined;

export const ADMIN_HELP =
  `🛠️ <b>Admin Panel</b>\n\n` +
  `/admin — panel utama (tombol)\n` +
  `/admin stats — statistik global\n` +
  `/admin users [halaman] — daftar user\n` +
  `/admin user &lt;id|@username&gt; — detail user\n` +
  `/admin ban &lt;id|@username&gt; [alasan]\n` +
  `/admin unban &lt;id|@username&gt;\n` +
  `/admin quota &lt;id|@username&gt; &lt;angka|default|unlimited&gt;\n` +
  `/broadcast &lt;pesan&gt; — kirim ke semua user`;

// ─── FORMAT HELPERS ────────────────────────────────────────────────────
function fmtDate(d: Date | null): string {
  if (!d || isNaN(d.getTime())) return "-";
  try {
    return d.toLocaleString("id-ID", { timeZone: getAdminTimezone(), hour12: false, dateStyle: "short", timeStyle: "short" });
  } catch {
    return d.toISOString();
  }
}

function fmtAgo(d: Date | null): string {
  if (!d || isNaN(d.getTime())) return "-";
  const s = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (s < 60) return "baru saja";
  if (s < 3600) return `${Math.floor(s / 60)} mnt lalu`;
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
  return `${Math.floor(s / 86400)} hari lalu`;
}

function fmtUptime(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${d ? `${d}h ` : ""}${h}j ${m}m`;
}

function quotaLabel(u: AdminUserRow): string {
  const limit = effectiveQuota(u.quotaOverride);
  const custom = u.quotaOverride !== null ? " (custom)" : "";
  return `${u.usedInPeriod}/${limit > 0 ? limit : "∞"}${custom}`;
}

const STATUS_ICON: Record<string, string> = {
  done: "✅",
  error: "❌",
  queued: "⏳",
  clips_ready: "🎞",
  skipped: "⏭",
};

// ─── VIEWS ─────────────────────────────────────────────────────────────
async function viewMain(): Promise<{ text: string; kb: Kb }> {
  const s = await getGlobalStats();
  const text =
    `🛠️ <b>Admin Panel</b>\n\n` +
    `👥 User: <b>${s.totalUsers}</b> (aktif 24 jam: ${s.active24h})\n` +
    `🎬 Job ${getQuotaPeriodLabel()} ini: <b>${s.jobsPeriod}</b> • 24 jam: ${s.jobs24h}\n` +
    `❌ Error 24 jam: <b>${s.errors24h}</b>\n` +
    `🚫 User diban: <b>${s.bannedUsers}</b>\n\n` +
    `Pilih menu di bawah, atau ketik /admin help untuk daftar perintah.`;
  const kb = new InlineKeyboard()
    .text("📊 Statistik", "adm:stats")
    .text("👥 Daftar User", "adm:users:0")
    .row()
    .text("📢 Broadcast", "adm:bc")
    .text("⚙️ Konfigurasi", "adm:cfg")
    .row()
    .text("🔄 Refresh", "adm:main");
  return { text, kb };
}

async function viewStats(): Promise<{ text: string; kb: Kb }> {
  const s = await getGlobalStats();
  const status = s.jobsByStatus.length
    ? s.jobsByStatus.map((x) => `${STATUS_ICON[x.status] ?? "⚙️"} ${esc(x.status)} ${x.count}`).join(" • ")
    : "-";
  const top = s.topUsers.length
    ? s.topUsers.map((u, i) => `${i + 1}. ${esc(u.label)} — ${u.jobs} job`).join("\n")
    : "-";
  const errs = s.errorSamples.length
    ? s.errorSamples
        .map((e) => `• <code>${esc(e.jobId.slice(0, 8))}</code> ${esc(fmtAgo(e.at))}: ${esc(e.message.slice(0, 80))}`)
        .join("\n")
    : "-";
  const mem = process.memoryUsage();

  const text =
    `📊 <b>Statistik Global</b>\n\n` +
    `<b>👥 User</b>\n` +
    `Total: <b>${s.totalUsers}</b> • Aktif 24 jam: <b>${s.active24h}</b>\n` +
    `Baru: ${s.newUsers24h} (24 jam) • ${s.newUsers7d} (7 hari)\n` +
    `Diban: ${s.bannedUsers} • YouTube terhubung: ${s.youtubeConnected}\n\n` +
    `<b>🎬 Job</b>\n` +
    `Total: <b>${s.jobsTotal}</b> • 24 jam: ${s.jobs24h} • ${getQuotaPeriodLabel()} ini: ${s.jobsPeriod}\n` +
    `Status: ${status}\n` +
    `Error 24 jam: <b>${s.errors24h}</b>\n\n` +
    `<b>✂️ Hasil</b>\n` +
    `Klip dibuat: <b>${s.totalClips}</b> • Upload YouTube sukses: <b>${s.uploadsDone}</b>\n\n` +
    `<b>🏆 Top user ${getQuotaPeriodLabel()} ini</b>\n${top}\n\n` +
    `<b>🧾 Error job terbaru</b>\n${errs}\n\n` +
    `<b>🖥 Server</b>\n` +
    `Uptime: ${fmtUptime(process.uptime())} • RAM: ${Math.round(mem.rss / 1048576)} MB`;
  const kb = new InlineKeyboard().text("🔄 Refresh", "adm:stats").text("⬅️ Menu", "adm:main");
  return { text, kb };
}

async function viewUsers(page: number): Promise<{ text: string; kb: Kb }> {
  const perPage = getUsersPerPage();
  const pages = (total: number) => Math.max(1, Math.ceil(total / perPage));
  let { users, total } = await listUsers(page, perPage);
  if (page > 0 && !users.length) {
    page = pages(total) - 1;
    ({ users, total } = await listUsers(page, perPage));
  }

  const lines = users.map((u, i) => {
    const flags = `${u.banned ? " 🚫" : ""}${u.youtubeConnected ? " ▶️" : ""}`;
    return (
      `${page * perPage + i + 1}. <b>${esc(displayName(u))}</b> <code>${u.id}</code>${flags}\n` +
      `    📦 ${u.totalJobs} job • kuota ${esc(quotaLabel(u))} • ${esc(fmtAgo(u.lastSeen))}`
    );
  });

  const text =
    `👥 <b>Daftar User</b> (hal. ${page + 1}/${pages(total)} • total ${total})\n` +
    `🚫 diban • ▶️ YouTube terhubung\n\n` +
    (lines.join("\n") || "Belum ada user.");

  const kb = new InlineKeyboard();
  users.forEach((u, i) => {
    const name = displayName(u).slice(0, 18);
    kb.text(`${u.banned ? "🚫" : "👤"} ${name}`, `adm:u:${u.id}:${page}`);
    if (i % 2 === 1) kb.row();
  });
  if (users.length % 2 === 1) kb.row();
  if (page > 0) kb.text("◀️", `adm:users:${page - 1}`);
  kb.text("⬅️ Menu", "adm:main");
  if ((page + 1) * perPage < total) kb.text("▶️", `adm:users:${page + 1}`);
  return { text, kb };
}

async function viewUser(userId: string, page: number): Promise<{ text: string; kb: Kb }> {
  const u = await getUserDetail(userId);
  if (!u) {
    return { text: `❌ User <code>${esc(userId)}</code> tidak ditemukan.`, kb: new InlineKeyboard().text("⬅️ Daftar", `adm:users:${page}`) };
  }
  const limit = effectiveQuota(u.quotaOverride);
  const text =
    `👤 <b>${esc(displayName(u))}</b>\n` +
    `ID: <code>${u.id}</code>${isAdmin(u.id) ? " (admin)" : ""}\n` +
    `Status: ${u.banned ? `🚫 <b>DIBAN</b>${u.banReason ? ` — ${esc(u.banReason)}` : ""}` : "✅ aktif"}\n` +
    `YouTube: ${u.youtubeConnected ? "✅ terhubung" : "❌ belum"}\n\n` +
    `📦 Total job: <b>${u.totalJobs}</b>\n` +
    `🎟 Kuota per ${getQuotaPeriodLabel()}: <b>${u.usedInPeriod}/${limit > 0 ? limit : "∞"}</b>` +
    `${u.quotaOverride !== null ? " (custom)" : ` (default${getDefaultQuota() > 0 ? "" : ": tanpa batas"})`}\n` +
    `🕒 Pertama terlihat: ${esc(fmtDate(u.firstSeen))}\n` +
    `🕒 Terakhir aktif: ${esc(fmtDate(u.lastSeen))} (${esc(fmtAgo(u.lastSeen))})`;

  const kb = new InlineKeyboard();
  if (u.banned) kb.text("✅ Unban", `adm:unban:${u.id}:${page}`);
  else if (!isAdmin(u.id)) kb.text("🚫 Ban", `adm:ban:${u.id}:${page}`);
  kb.row()
    .text("🎟 3", `adm:q:${u.id}:3:${page}`)
    .text("5", `adm:q:${u.id}:5:${page}`)
    .text("10", `adm:q:${u.id}:10:${page}`)
    .text("25", `adm:q:${u.id}:25:${page}`)
    .text("50", `adm:q:${u.id}:50:${page}`)
    .row()
    .text("♾ Unlimited", `adm:q:${u.id}:u:${page}`)
    .text("↩️ Default", `adm:q:${u.id}:d:${page}`)
    .row()
    .text("🔄 Refresh", `adm:u:${u.id}:${page}`)
    .text("⬅️ Daftar", `adm:users:${page}`);
  return { text, kb };
}

function viewConfig(): { text: string; kb: Kb } {
  const err = getErrorConfig();
  const bc = getBroadcastConfig();
  const defQuota = getDefaultQuota();
  const text =
    `⚙️ <b>Konfigurasi Admin</b>\n` +
    `<i>Ubah lewat Railway Variables</i>\n\n` +
    `👮 Admin: <code>${esc(getAdminIds().join(", "))}</code> (<code>ADMIN_TELEGRAM_IDS</code>)\n\n` +
    `<b>🎟 Kuota</b>\n` +
    `Default: <b>${defQuota > 0 ? defQuota : "tanpa batas"}</b> (<code>ADMIN_DEFAULT_QUOTA</code>)\n` +
    `Periode: <b>${getQuotaPeriod()}</b> • zona waktu ${esc(getAdminTimezone())}\n` +
    `Admin bebas kuota: ${isAdminExemptFromQuota() ? "✅" : "❌"}\n\n` +
    `<b>🚨 Notifikasi error</b>\n` +
    `Status: ${err.enabled ? "✅ aktif" : "❌ nonaktif"} (<code>ADMIN_ERROR_NOTIFY</code>)\n` +
    `Dedupe: ${err.dedupeSeconds} dtk • maks ${err.maxPerMinute}/menit\n\n` +
    `<b>📢 Broadcast</b>\n` +
    `Konfirmasi: ${bc.confirm ? "✅" : "❌"} • jeda ${bc.delayMs} ms • sertakan user diban: ${bc.includeBanned ? "✅" : "❌"}`;
  return { text, kb: new InlineKeyboard().text("⬅️ Menu", "adm:main") };
}

function viewBroadcastHelp(): { text: string; kb: Kb } {
  const bc = getBroadcastConfig();
  return {
    text:
      `📢 <b>Broadcast</b>\n\n` +
      `Kirim pesan ke semua user:\n<code>/broadcast Halo semua! Ada fitur baru 🎉</code>\n\n` +
      `${bc.confirm ? "Kamu akan diminta konfirmasi sebelum pesan dikirim." : "Pesan langsung dikirim tanpa konfirmasi."}\n` +
      `User yang diban ${bc.includeBanned ? "ikut" : "tidak"} menerima broadcast.`,
    kb: new InlineKeyboard().text("⬅️ Menu", "adm:main"),
  };
}

// ─── UI HELPERS ────────────────────────────────────────────────────────
function isNotModified(e: unknown): boolean {
  return e instanceof GrammyError && /not modified/i.test(e.description);
}

async function show(ctx: Context, view: { text: string; kb: Kb }): Promise<void> {
  const opts = {
    parse_mode: "HTML" as const,
    reply_markup: view.kb,
    link_preview_options: { is_disabled: true },
  };
  if (ctx.callbackQuery) {
    try {
      await ctx.editMessageText(view.text, opts);
      return;
    } catch (e) {
      if (isNotModified(e)) return;
    }
  }
  await ctx.reply(view.text, opts);
}

async function replyHtml(ctx: Context, text: string): Promise<void> {
  await ctx.reply(text, { parse_mode: "HTML", link_preview_options: { is_disabled: true } });
}

async function requireAdmin(ctx: Context): Promise<boolean> {
  if (isAdminEnabled() && isAdmin(ctx.from?.id)) return true;
  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery({ text: ADMIN_TEXT.notAdmin, show_alert: true }).catch(() => {});
  } else {
    await ctx.reply(ADMIN_TEXT.notAdmin).catch(() => {});
  }
  return false;
}

// ─── ACTIONS ───────────────────────────────────────────────────────────
async function doBan(ctx: Context, userId: string, ban: boolean, reason?: string): Promise<string> {
  if (ban && isAdmin(userId)) return "❌ Tidak bisa memblokir sesama admin.";
  await setBan(userId, ban, String(ctx.from?.id), reason);
  if (shouldNotifyUserOnBan()) {
    const msg = ban ? (reason ? ADMIN_TEXT.bannedWithReason(reason) : ADMIN_TEXT.banned) : ADMIN_TEXT.unbanned;
    await ctx.api.sendMessage(userId, msg).catch(() => {});
  }
  return ban ? `🚫 User <code>${userId}</code> diblokir.` : `✅ User <code>${userId}</code> dibuka blokirnya.`;
}

/** "5" | "default" | "unlimited" → number | null (default) | undefined (tidak valid). */
function parseQuota(v: string): number | null | undefined {
  const x = v.trim().toLowerCase();
  if (["default", "reset", "d"].includes(x)) return null;
  if (["unlimited", "inf", "∞", "u", "0"].includes(x)) return 0;
  if (/^\d+$/.test(x)) {
    const n = parseInt(x, 10);
    return n > 0 && n <= 1_000_000 ? n : undefined;
  }
  return undefined;
}

function quotaText(userId: string, v: number | null): string {
  const label = v === null ? `default (${getDefaultQuota() > 0 ? getDefaultQuota() : "tanpa batas"})` : v === 0 ? "tanpa batas" : `${v} per ${getQuotaPeriodLabel()}`;
  return `🎟 Kuota user <code>${userId}</code> diatur ke <b>${label}</b>.`;
}

// ─── BROADCAST ─────────────────────────────────────────────────────────
interface PendingBroadcast {
  adminId: string;
  text: string;
  at: number;
}
const pending = new Map<string, PendingBroadcast>();
let broadcastRunning = false;
const PENDING_TTL_MS = 10 * 60 * 1000;

function buildBroadcastText(text: string): string {
  const header = getBroadcastConfig().header;
  return header ? `${header}\n\n${text}` : text;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sendOne(api: Context["api"], chatId: string, text: string): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await api.sendMessage(chatId, text, { link_preview_options: { is_disabled: true } });
      return true;
    } catch (e) {
      if (e instanceof GrammyError && e.error_code === 429 && attempt === 0) {
        const wait = Number(e.parameters?.retry_after ?? 3);
        await sleep((wait + 1) * 1000);
        continue;
      }
      return false;
    }
  }
  return false;
}

async function runBroadcast(api: Context["api"], adminChatId: number, adminId: string, text: string): Promise<void> {
  broadcastRunning = true;
  try {
    const cfg = getBroadcastConfig();
    const recipients = await getBroadcastRecipients();
    const logId = await createBroadcastLog(adminId, text, recipients.length);
    const payload = buildBroadcastText(text);

    let sent = 0;
    let failed = 0;
    for (const r of recipients) {
      if (await sendOne(api, r.chatId, payload)) sent++;
      else failed++;
      if (cfg.delayMs) await sleep(cfg.delayMs);
    }
    await finishBroadcastLog(logId, sent, failed).catch(() => {});
    await api
      .sendMessage(
        adminChatId,
        `📢 <b>Broadcast selesai</b>\n\n✅ Terkirim: <b>${sent}</b>\n❌ Gagal: <b>${failed}</b> (biasanya user yang memblokir bot)\n👥 Total penerima: ${recipients.length}`,
        { parse_mode: "HTML" }
      )
      .catch(() => {});
  } catch (err) {
    console.error("[admin] broadcast gagal:", err);
    await reportError("Broadcast", err, { userId: adminId });
    await api.sendMessage(adminChatId, "❌ Broadcast gagal, cek log server.").catch(() => {});
  } finally {
    broadcastRunning = false;
  }
}

async function startBroadcast(ctx: Context, text: string): Promise<void> {
  if (broadcastRunning) {
    await ctx.reply("⏳ Masih ada broadcast yang berjalan. Tunggu sampai selesai.");
    return;
  }
  const recipients = await getBroadcastRecipients();
  await ctx.reply(`🚀 Broadcast dimulai ke ${recipients.length} user... Laporan akan dikirim setelah selesai.`);
  // Jalan di background — jangan await supaya webhook tidak timeout.
  void runBroadcast(ctx.api, ctx.chat!.id, String(ctx.from!.id), text);
}

// ─── REGISTRATION ──────────────────────────────────────────────────────
/** Middleware paling awal: catat user + blokir user yang diban. Fail-open. */
export function registerAdminGuard(bot: Bot<Context>): void {
  bot.use(async (ctx, next) => {
    const from = ctx.from;
    if (!from || from.is_bot) return next();

    try {
      await trackUser(from, ctx.chat?.type === "private" ? ctx.chat.id : undefined);
    } catch (err) {
      console.error("[admin] trackUser gagal:", err);
    }

    if (!isAdmin(from.id)) {
      const gate = await checkUserAccess(String(from.id), { checkQuota: false });
      if (!gate.allowed && gate.reason === "banned") {
        try {
          if (ctx.callbackQuery) {
            await ctx.answerCallbackQuery({ text: ADMIN_TEXT.banned, show_alert: true });
          } else if (ctx.chat?.type === "private") {
            await ctx.reply(gate.banReason ? ADMIN_TEXT.bannedWithReason(gate.banReason) : ADMIN_TEXT.banned);
          }
        } catch {
          /* abaikan */
        }
        return; // jangan lanjut ke handler lain
      }
    }
    return next();
  });
}

/** Panggil sebelum membuat job baru. false = ditolak (pesan sudah dikirim ke user). */
export async function guardJobQuota(ctx: Context, userId: string): Promise<boolean> {
  const gate = await checkUserAccess(userId);
  if (gate.allowed) return true;
  if (gate.reason === "banned") {
    await ctx.reply(gate.banReason ? ADMIN_TEXT.bannedWithReason(gate.banReason) : ADMIN_TEXT.banned).catch(() => {});
  } else {
    await ctx.reply(ADMIN_TEXT.quotaExceeded(gate.used, gate.limit, getQuotaPeriodLabel())).catch(() => {});
  }
  return false;
}

export function registerAdminCommands(bot: Bot<Context>): void {
  bot.command("admin", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const args = String(ctx.match || "").trim();
    const [sub = "", ...rest] = args.split(/\s+/).filter(Boolean);

    try {
      switch (sub.toLowerCase()) {
        case "":
        case "panel":
          return show(ctx, await viewMain());
        case "help":
          return void (await replyHtml(ctx, ADMIN_HELP));
        case "stats":
          return show(ctx, await viewStats());
        case "users": {
          const page = Math.max(0, (parseInt(rest[0] ?? "1", 10) || 1) - 1);
          return show(ctx, await viewUsers(page));
        }
        case "user":
        case "ban":
        case "unban":
        case "quota": {
          if (!rest[0]) return void (await replyHtml(ctx, `Format salah.\n\n${ADMIN_HELP}`));
          const userId = await resolveUserId(rest[0]);
          if (!userId) return void (await replyHtml(ctx, `❌ User <code>${esc(rest[0])}</code> tidak ditemukan. Pakai ID angka atau @username yang pernah chat dengan bot.`));

          if (sub === "user") return show(ctx, await viewUser(userId, 0));
          if (sub === "ban") return void (await replyHtml(ctx, await doBan(ctx, userId, true, rest.slice(1).join(" ") || undefined)));
          if (sub === "unban") return void (await replyHtml(ctx, await doBan(ctx, userId, false)));

          const q = parseQuota(rest[1] ?? "");
          if (q === undefined) return void (await replyHtml(ctx, "Format: <code>/admin quota &lt;id|@username&gt; &lt;angka|default|unlimited&gt;</code>"));
          await setQuota(userId, q);
          return void (await replyHtml(ctx, quotaText(userId, q)));
        }
        default:
          return void (await replyHtml(ctx, ADMIN_HELP));
      }
    } catch (err) {
      console.error("[admin] /admin gagal:", err);
      await reportError("/admin", err, { userId: ctx.from?.id });
      await ctx.reply("❌ Terjadi kesalahan saat memproses perintah admin.").catch(() => {});
    }
  });

  bot.command("broadcast", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const text = String(ctx.match || "").trim();
    const cfg = getBroadcastConfig();

    if (!text) return show(ctx, viewBroadcastHelp());
    if (text.length > cfg.maxChars) {
      await ctx.reply(`❌ Pesan terlalu panjang (${text.length}/${cfg.maxChars} karakter).`);
      return;
    }

    try {
      if (!cfg.confirm) return await startBroadcast(ctx, text);

      for (const [k, v] of pending) if (Date.now() - v.at > PENDING_TTL_MS) pending.delete(k);
      const token = randomBytes(4).toString("hex");
      pending.set(token, { adminId: String(ctx.from!.id), text, at: Date.now() });

      const recipients = await getBroadcastRecipients();
      await replyHtmlWithKb(
        ctx,
        `📢 <b>Konfirmasi Broadcast</b>\n\nPenerima: <b>${recipients.length}</b> user\n\n<b>Pratinjau:</b>\n──────────\n${esc(buildBroadcastText(text))}\n──────────\n\nKirim sekarang?`,
        new InlineKeyboard().text("✅ Kirim", `adm:bcs:${token}`).text("❌ Batal", `adm:bcc:${token}`)
      );
    } catch (err) {
      console.error("[admin] /broadcast gagal:", err);
      await reportError("/broadcast", err, { userId: ctx.from?.id });
      await ctx.reply("❌ Gagal menyiapkan broadcast.").catch(() => {});
    }
  });

  bot.callbackQuery(/^adm:/, async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const parts = ctx.callbackQuery.data.split(":"); // adm:<action>:...
    const action = parts[1];

    try {
      switch (action) {
        case "main":
          await ctx.answerCallbackQuery();
          return show(ctx, await viewMain());
        case "stats":
          await ctx.answerCallbackQuery();
          return show(ctx, await viewStats());
        case "cfg":
          await ctx.answerCallbackQuery();
          return show(ctx, viewConfig());
        case "bc":
          await ctx.answerCallbackQuery();
          return show(ctx, viewBroadcastHelp());
        case "users":
          await ctx.answerCallbackQuery();
          return show(ctx, await viewUsers(parseInt(parts[2] ?? "0", 10) || 0));
        case "u":
          await ctx.answerCallbackQuery();
          return show(ctx, await viewUser(parts[2], parseInt(parts[3] ?? "0", 10) || 0));
        case "ban":
        case "unban": {
          const msg = await doBan(ctx, parts[2], action === "ban");
          await ctx.answerCallbackQuery({ text: msg.replace(/<[^>]+>/g, ""), show_alert: false });
          return show(ctx, await viewUser(parts[2], parseInt(parts[3] ?? "0", 10) || 0));
        }
        case "q": {
          const q = parseQuota(parts[3] ?? "");
          if (q === undefined) {
            await ctx.answerCallbackQuery({ text: "Nilai kuota tidak valid", show_alert: true });
            return;
          }
          await setQuota(parts[2], q);
          await ctx.answerCallbackQuery({ text: quotaText(parts[2], q).replace(/<[^>]+>/g, "") });
          return show(ctx, await viewUser(parts[2], parseInt(parts[4] ?? "0", 10) || 0));
        }
        case "bcs": {
          const p = pending.get(parts[2]);
          if (!p || p.adminId !== String(ctx.from.id) || Date.now() - p.at > PENDING_TTL_MS) {
            await ctx.answerCallbackQuery({ text: "Broadcast kedaluwarsa. Kirim ulang /broadcast.", show_alert: true });
            return;
          }
          pending.delete(parts[2]);
          await ctx.answerCallbackQuery({ text: "Memulai broadcast..." });
          await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() }).catch(() => {});
          return await startBroadcast(ctx, p.text);
        }
        case "bcc":
          pending.delete(parts[2]);
          await ctx.answerCallbackQuery({ text: "Dibatalkan" });
          await ctx.editMessageText("❌ Broadcast dibatalkan.").catch(() => {});
          return;
        default:
          await ctx.answerCallbackQuery();
      }
    } catch (err) {
      console.error("[admin] callback gagal:", err);
      await reportError("Admin callback", err, { userId: ctx.from?.id });
      await ctx.answerCallbackQuery({ text: "Terjadi kesalahan", show_alert: true }).catch(() => {});
    }
  });
}

async function replyHtmlWithKb(ctx: Context, text: string, kb: InlineKeyboard): Promise<void> {
  await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb, link_preview_options: { is_disabled: true } });
}
