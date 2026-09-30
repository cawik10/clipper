import { Bot, Context, InlineKeyboard, InputFile } from "grammy";
import { db } from "@/db";
import { clipJobs, youtubeTokens, userSettings, ClipResult } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { detectPlatform } from "@/lib/video-processor";
import { getAuthUrl } from "@/lib/youtube-oauth";
import { messages, getPlatformEmoji, formatDuration } from "@/lib/bot-messages";
import { processJob } from "@/lib/job-processor";
import { getOrCreateUserSettings, patchUserSettings } from "@/lib/user-settings";
import {
  resolveMaxClips,
  resolveAspectRatioMode,
  resolveWatermarkConfig,
  resolveZoomEffectConfig,
  resolveIntroOutroConfig,
  getModeLabel,
  getWatermarkPositionLabel,
  getZoomEffectLabel,
  getMaxClipsConfig,
  getAspectRatioMode,
  getWatermarkConfig,
  getZoomEffectConfig,
  getIntroOutroConfig,
  getThumbnailConfig,
} from "@/lib/video-config";
import fs from "fs";

const token = process.env.TELEGRAM_BOT_TOKEN || "placeholder_token_for_build";
export const bot = new Bot(token);

const URL_REGEX =
  /https?:\/\/(www\.)?(youtube\.com\/watch|youtu\.be|youtube\.com\/shorts|facebook\.com\/(watch|video)|fb\.watch|tiktok\.com\/@[^/]+\/video|instagram\.com\/(reel|p|tv))[^\s]*/i;

// ═══════════════════════════════════════════════════════════════════════════
// COMMANDS
// ═══════════════════════════════════════════════════════════════════════════

bot.command("start", async (ctx) => {
  const userId = ctx.from?.id?.toString() || "";
  await getOrCreateUserSettings(userId, {
    username: ctx.from?.username,
    firstName: ctx.from?.first_name,
  });
  await ctx.reply(
    `🤖 *AutoClip Bot* — Video Clipper Otomatis\n\nHalo ${ctx.from?.first_name || ""}\\! Saya bisa memotong video panjang menjadi klip viral untuk YouTube Shorts secara otomatis\\!\n\nKirim link video untuk mulai\\! 🎬\n\nAtau ketik /settings untuk mengatur preferensi Anda\\.`,
    {
      parse_mode: "MarkdownV2",
      reply_markup: new InlineKeyboard()
        .text("⚙️ Pengaturan", "settings")
        .text("🔗 Hubungkan YouTube", "connect")
        .row()
        .text("📚 Panduan", "help")
        .text("📋 Riwayat", "history"),
    }
  );
});

bot.command("help", async (ctx) => {
  await ctx.reply(messages.help, { parse_mode: "MarkdownV2" });
});

bot.command("connect", async (ctx) => {
  await handleConnect(ctx);
});

bot.command("disconnect", async (ctx) => {
  const userId = ctx.from?.id?.toString();
  if (!userId) return;
  await db.delete(youtubeTokens).where(eq(youtubeTokens.telegramUserId, userId));
  await patchUserSettings(userId, { youtubeConnected: false });
  await ctx.reply("✅ Akun YouTube berhasil diputus.");
});

bot.command("status", async (ctx) => {
  const userId = ctx.from?.id?.toString();
  if (!userId) return;
  const jobs = await db
    .select()
    .from(clipJobs)
    .where(eq(clipJobs.telegramUserId, userId))
    .orderBy(desc(clipJobs.createdAt))
    .limit(5);

  if (!jobs.length) {
    await ctx.reply("📭 Belum ada pekerjaan. Kirim link video untuk memulai!");
    return;
  }

  const statusEmoji: Record<string, string> = {
    queued: "⏳", downloading: "⬇️", analyzing: "🧠",
    clipping: "✂️", uploading: "📤", done: "✅", error: "❌",
  };

  let msg = `📊 *Status Terbaru:*\n\n`;
  jobs.slice(0, 3).forEach((job) => {
    msg += `${statusEmoji[job.status] || "❓"} *${job.videoTitle?.slice(0, 40) || "Video"}*\n`;
    msg += `Status: ${job.status}\n`;
    if (job.status === "error") msg += `Error: ${job.errorMessage?.slice(0, 80)}\n`;
    msg += `Waktu: ${new Date(job.createdAt).toLocaleString("id-ID")}\n\n`;
  });
  await ctx.reply(msg, { parse_mode: "Markdown" });
});

bot.command("settings", async (ctx) => {
  await handleSettings(ctx);
});

bot.command("history", async (ctx) => {
  await handleHistory(ctx);
});

bot.command("cancel", async (ctx) => {
  await ctx.reply("⛔ Proses tidak bisa dibatalkan secara manual. Tunggu hingga selesai atau error.");
});

// ═══════════════════════════════════════════════════════════════════════════
// MESSAGE HANDLER
// ═══════════════════════════════════════════════════════════════════════════

bot.on("message:text", async (ctx) => {
  const text = ctx.message.text;
  const urlMatch = text.match(URL_REGEX);
  if (!urlMatch) {
    if (text.startsWith("/")) return;
    await ctx.reply(
      "Kirim link video YouTube, Facebook, TikTok, atau Instagram untuk mulai! 🎬\n\nGunakan /help untuk panduan lengkap.",
      {
        reply_markup: new InlineKeyboard()
          .text("📚 Panduan", "help")
          .text("⚙️ Pengaturan", "settings"),
      }
    );
    return;
  }
  await handleVideoUrl(ctx, urlMatch[0]);
});

// ═══════════════════════════════════════════════════════════════════════════
// CALLBACK HANDLERS — SETTINGS MENU
// ═══════════════════════════════════════════════════════════════════════════

bot.callbackQuery("help", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(messages.help, { parse_mode: "MarkdownV2" });
});

bot.callbackQuery("connect", async (ctx) => {
  await ctx.answerCallbackQuery();
  await handleConnect(ctx);
});

bot.callbackQuery("settings", async (ctx) => {
  await ctx.answerCallbackQuery();
  await handleSettings(ctx);
});

bot.callbackQuery("history", async (ctx) => {
  await ctx.answerCallbackQuery();
  await handleHistory(ctx);
});

// ─── SETTINGS SUBMENUS ────────────────────────────────────────────────────

bot.callbackQuery("settings_clips", async (ctx) => {
  await ctx.answerCallbackQuery();
  const userId = ctx.from.id.toString();
  const s = await getOrCreateUserSettings(userId);
  const current = resolveMaxClips(s.maxClips);
  const envDefault = getMaxClipsConfig();

  await ctx.editMessageText(
    `✂️ *Jumlah Klip per Video*\n\nSetting kamu: *${current} klip*\nDefault env \\(Railway\\): *${envDefault} klip*\n\nPilih jumlah klip:`,
    {
      parse_mode: "MarkdownV2",
      reply_markup: new InlineKeyboard()
        .text(current === 1 ? "✅1" : "1", "set_clips_1")
        .text(current === 2 ? "✅2" : "2", "set_clips_2")
        .text(current === 3 ? "✅3" : "3", "set_clips_3")
        .text(current === 4 ? "✅4" : "4", "set_clips_4")
        .text(current === 5 ? "✅5⭐" : "5⭐", "set_clips_5")
        .row()
        .text(current === 6 ? "✅6" : "6", "set_clips_6")
        .text(current === 7 ? "✅7" : "7", "set_clips_7")
        .text(current === 8 ? "✅8" : "8", "set_clips_8")
        .text(current === 9 ? "✅9" : "9", "set_clips_9")
        .text(current === 10 ? "✅10" : "10", "set_clips_10")
        .row()
        .text("« Kembali", "settings"),
    }
  );
});

bot.callbackQuery("settings_privacy", async (ctx) => {
  await ctx.answerCallbackQuery();
  const userId = ctx.from.id.toString();
  const s = await getOrCreateUserSettings(userId);
  const current = s.defaultPrivacy || "private";

  await ctx.editMessageText(
    `🔒 *Privacy Default Upload YouTube*\n\nSetting kamu: *${current}*\n\nPilih privacy:`,
    {
      parse_mode: "MarkdownV2",
      reply_markup: new InlineKeyboard()
        .text(current === "private" ? "✅ 🔒 Private" : "🔒 Private", "set_privacy_private")
        .row()
        .text(current === "unlisted" ? "✅ 🔗 Unlisted" : "🔗 Unlisted", "set_privacy_unlisted")
        .row()
        .text(current === "public" ? "✅ 🌐 Public" : "🌐 Public", "set_privacy_public")
        .row()
        .text("« Kembali", "settings"),
    }
  );
});

bot.callbackQuery("settings_aspect", async (ctx) => {
  await ctx.answerCallbackQuery();
  const userId = ctx.from.id.toString();
  const s = await getOrCreateUserSettings(userId);
  const current = resolveAspectRatioMode(s.aspectRatioMode);
  const globalDefault = getAspectRatioMode();

  const modeList = [
    { key: "blur", label: "🌀 Blur Background (REKOMENDASI)" },
    { key: "crop", label: "✂️ Center Crop" },
    { key: "pad", label: "⬛ Black Bars" },
    { key: "stretch", label: "↔️ Stretch" },
    { key: "none", label: "📐 Original Ratio" },
  ];

  const kb = new InlineKeyboard();
  modeList.forEach((m) => {
    kb.text(current === m.key ? `✅ ${m.label}` : m.label, `set_aspect_${m.key}`).row();
  });
  kb.text("🔄 Reset ke Default Env", "reset_aspect").row();
  kb.text("« Kembali", "settings");

  await ctx.editMessageText(
    `📐 *Mode Aspect Ratio 9:16*\n\nSetting kamu: *${getModeLabel(current)}*\nDefault env: *${getModeLabel(globalDefault)}*\n\nPilih mode:`,
    { parse_mode: "MarkdownV2", reply_markup: kb }
  );
});

bot.callbackQuery("settings_watermark", async (ctx) => {
  await ctx.answerCallbackQuery();
  const userId = ctx.from.id.toString();
  const s = await getOrCreateUserSettings(userId);
  const wmCfg = resolveWatermarkConfig({
    watermarkEnabled: s.watermarkEnabled,
    watermarkText: s.watermarkText,
    watermarkPosition: s.watermarkPosition,
    watermarkFontSize: s.watermarkFontSize,
    watermarkColor: s.watermarkColor,
    watermarkOpacity: s.watermarkOpacity,
    watermarkBox: s.watermarkBox,
  });
  const globalWm = getWatermarkConfig();

  await ctx.editMessageText(
    `💧 *Pengaturan Watermark*\n\nStatus: ${wmCfg.enabled ? "✅ Aktif" : "❌ Nonaktif"}\n` +
    `Teks: \`${wmCfg.text}\`\n` +
    `Posisi: ${getWatermarkPositionLabel(wmCfg.position)}\n\n` +
    `*Default env:* "${globalWm.text}" @ ${globalWm.position}\n\n` +
    `Gunakan tombol di bawah untuk mengubah:\\n\n` +
    `_Untuk mengubah teks watermark, kirim:_\n\`/setwm TeksBaru\``,
    {
      parse_mode: "MarkdownV2",
      reply_markup: new InlineKeyboard()
        .text(wmCfg.enabled ? "✅ Nonaktifkan" : "❌ Aktifkan", "toggle_watermark")
        .row()
        .text("Posisi: Kiri Atas", "set_wm_pos_topleft")
        .text("Posisi: Kanan Atas", "set_wm_pos_topright")
        .row()
        .text("Posisi: Kiri Bawah", "set_wm_pos_bottomleft")
        .text("Posisi: Kanan Bawah ⭐", "set_wm_pos_bottomright")
        .row()
        .text("🔄 Reset ke Default Env", "reset_watermark")
        .row()
        .text("« Kembali", "settings"),
    }
  );
});

bot.callbackQuery("settings_zoom", async (ctx) => {
  await ctx.answerCallbackQuery();
  const userId = ctx.from.id.toString();
  const s = await getOrCreateUserSettings(userId);
  const zoomCfg = resolveZoomEffectConfig({
    zoomEnabled: s.zoomEnabled,
    zoomMode: s.zoomMode,
    zoomType: s.zoomType,
    zoomIntensity: s.zoomIntensity,
    zoomMinScore: s.zoomMinScore,
  });

  const types = [
    { key: "in", label: "🔍 Zoom In" },
    { key: "out", label: "🔎 Zoom Out" },
    { key: "in-out", label: "↕️ In\\-Out" },
    { key: "pulse", label: "💫 Pulse" },
  ];

  const kb = new InlineKeyboard();
  kb.text(zoomCfg.enabled ? "✅ Nonaktifkan Zoom" : "❌ Aktifkan Zoom", "toggle_zoom").row();
  types.forEach((t) => {
    kb.text(zoomCfg.type === t.key ? `✅ ${t.label}` : t.label, `set_zoom_type_${t.key}`);
  });
  kb.row();
  kb.text("Mode: Auto", "set_zoom_mode_auto")
    .text("Mode: Always", "set_zoom_mode_always")
    .text("Mode: Never", "set_zoom_mode_never")
    .row();
  kb.text("🔄 Reset ke Default Env", "reset_zoom").row();
  kb.text("« Kembali", "settings");

  await ctx.editMessageText(
    `🔍 *Pengaturan Zoom Effect*\n\nStatus: ${zoomCfg.enabled ? "✅ Aktif" : "❌ Nonaktif"}\n` +
    `Tipe: *${getZoomEffectLabel(zoomCfg.type)}*\nMode: ${zoomCfg.mode}\nIntensitas: ${zoomCfg.intensity}×\nMin Score: ${zoomCfg.minScore}/10`,
    { parse_mode: "MarkdownV2", reply_markup: kb }
  );
});

bot.callbackQuery("settings_introoutro", async (ctx) => {
  await ctx.answerCallbackQuery();
  const userId = ctx.from.id.toString();
  const s = await getOrCreateUserSettings(userId);
  const ioCfg = resolveIntroOutroConfig({
    introEnabled: s.introEnabled,
    introText: s.introText,
    introDuration: s.introDuration,
    outroEnabled: s.outroEnabled,
    outroText: s.outroText,
    outroDuration: s.outroDuration,
  });

  await ctx.editMessageText(
    `🎬 *Pengaturan Intro / Outro*\n\n` +
    `*Intro:* ${ioCfg.introEnabled ? "✅ Aktif" : "❌ Nonaktif"}\n` +
    `Teks: "${ioCfg.introText}" \\(${ioCfg.introDuration}s\\)\n\n` +
    `*Outro:* ${ioCfg.outroEnabled ? "✅ Aktif" : "❌ Nonaktif"}\n` +
    `Teks: "${ioCfg.outroText}" \\(${ioCfg.outroDuration}s\\)\n\n` +
    `_Untuk mengubah teks, kirim:_\n\`/setintro TeksIntro\`\n\`/setoutro TeksOutro\``,
    {
      parse_mode: "MarkdownV2",
      reply_markup: new InlineKeyboard()
        .text(ioCfg.introEnabled ? "✅ Nonaktifkan Intro" : "❌ Aktifkan Intro", "toggle_intro")
        .row()
        .text(ioCfg.outroEnabled ? "✅ Nonaktifkan Outro" : "❌ Aktifkan Outro", "toggle_outro")
        .row()
        .text("🔄 Reset ke Default Env", "reset_introoutro")
        .row()
        .text("« Kembali", "settings"),
    }
  );
});

// ─── SET CLIPS ─────────────────────────────────────────────────────────────

bot.callbackQuery(/^set_clips_(\d+)$/, async (ctx) => {
  const userId = ctx.from.id.toString();
  const maxClips = parseInt(ctx.match[1]);
  if (maxClips < 1 || maxClips > 10) {
    await ctx.answerCallbackQuery("❌ Nilai tidak valid (1-10)");
    return;
  }
  await patchUserSettings(userId, { maxClips });
  await ctx.answerCallbackQuery(`✅ Maksimal klip diset ke ${maxClips}`);
  await ctx.editMessageText(
    `✅ *Setting disimpan\\!*\n\nMaksimal *${maxClips} klip* per video untuk akun kamu\\.`,
    {
      parse_mode: "MarkdownV2",
      reply_markup: new InlineKeyboard().text("« Kembali ke Pengaturan", "settings"),
    }
  );
});

// ─── SET PRIVACY ────────────────────────────────────────────────────────────

bot.callbackQuery(/^set_privacy_(private|unlisted|public)$/, async (ctx) => {
  const userId = ctx.from.id.toString();
  const privacy = ctx.match[1];
  await patchUserSettings(userId, { defaultPrivacy: privacy });
  await ctx.answerCallbackQuery(`✅ Privacy diset ke ${privacy}`);
  await ctx.editMessageText(
    `✅ *Setting disimpan\\!*\n\nPrivacy default: *${privacy}*`,
    {
      parse_mode: "MarkdownV2",
      reply_markup: new InlineKeyboard().text("« Kembali ke Pengaturan", "settings"),
    }
  );
});

// ─── SET ASPECT RATIO ────────────────────────────────────────────────────────

bot.callbackQuery(/^set_aspect_(blur|crop|pad|stretch|none)$/, async (ctx) => {
  const userId = ctx.from.id.toString();
  const mode = ctx.match[1];
  await patchUserSettings(userId, { aspectRatioMode: mode });
  await ctx.answerCallbackQuery(`✅ Aspect ratio diset ke ${mode}`);
  await ctx.editMessageText(
    `✅ *Setting disimpan\\!*\n\nAspect ratio: *${getModeLabel(mode as "blur")}*`,
    {
      parse_mode: "MarkdownV2",
      reply_markup: new InlineKeyboard().text("« Kembali ke Pengaturan", "settings"),
    }
  );
});

bot.callbackQuery("reset_aspect", async (ctx) => {
  const userId = ctx.from.id.toString();
  await patchUserSettings(userId, { aspectRatioMode: null });
  await ctx.answerCallbackQuery("✅ Reset ke default env");
  await ctx.editMessageText(
    `✅ Aspect ratio direset ke default env: *${getModeLabel(getAspectRatioMode())}*`,
    {
      parse_mode: "MarkdownV2",
      reply_markup: new InlineKeyboard().text("« Kembali", "settings"),
    }
  );
});

// ─── TOGGLE WATERMARK ────────────────────────────────────────────────────────

bot.callbackQuery("toggle_watermark", async (ctx) => {
  const userId = ctx.from.id.toString();
  const s = await getOrCreateUserSettings(userId);
  const current = s.watermarkEnabled ?? getWatermarkConfig().enabled;
  await patchUserSettings(userId, { watermarkEnabled: !current });
  await ctx.answerCallbackQuery(`✅ Watermark ${!current ? "diaktifkan" : "dinonaktifkan"}`);
  await ctx.editMessageText(
    `✅ Watermark: *${!current ? "✅ Aktif" : "❌ Nonaktif"}*`,
    {
      parse_mode: "MarkdownV2",
      reply_markup: new InlineKeyboard().text("« Kembali ke Pengaturan", "settings"),
    }
  );
});

bot.callbackQuery(/^set_wm_pos_(topleft|topright|bottomleft|bottomright|center)$/, async (ctx) => {
  const userId = ctx.from.id.toString();
  const pos = ctx.match[1];
  await patchUserSettings(userId, { watermarkPosition: pos });
  await ctx.answerCallbackQuery(`✅ Posisi watermark: ${getWatermarkPositionLabel(pos as "topleft")}`);
  await ctx.editMessageText(
    `✅ *Setting disimpan\\!*\n\nPosisi watermark: *${getWatermarkPositionLabel(pos as "topleft")}*`,
    {
      parse_mode: "MarkdownV2",
      reply_markup: new InlineKeyboard().text("« Kembali ke Pengaturan", "settings"),
    }
  );
});

bot.callbackQuery("reset_watermark", async (ctx) => {
  const userId = ctx.from.id.toString();
  await patchUserSettings(userId, {
    watermarkEnabled: null, watermarkText: null, watermarkPosition: null,
    watermarkFontSize: null, watermarkColor: null, watermarkOpacity: null, watermarkBox: null,
  });
  await ctx.answerCallbackQuery("✅ Watermark direset ke default env");
  await ctx.editMessageText(
    `✅ Watermark direset ke default env`,
    {
      parse_mode: "MarkdownV2",
      reply_markup: new InlineKeyboard().text("« Kembali", "settings"),
    }
  );
});

// ─── TOGGLE ZOOM ────────────────────────────────────────────────────────────

bot.callbackQuery("toggle_zoom", async (ctx) => {
  const userId = ctx.from.id.toString();
  const s = await getOrCreateUserSettings(userId);
  const current = s.zoomEnabled ?? getZoomEffectConfig().enabled;
  await patchUserSettings(userId, { zoomEnabled: !current });
  await ctx.answerCallbackQuery(`✅ Zoom ${!current ? "diaktifkan" : "dinonaktifkan"}`);
  await ctx.editMessageText(
    `✅ Zoom Effect: *${!current ? "✅ Aktif" : "❌ Nonaktif"}*`,
    {
      parse_mode: "MarkdownV2",
      reply_markup: new InlineKeyboard().text("« Kembali ke Pengaturan", "settings"),
    }
  );
});

bot.callbackQuery(/^set_zoom_type_(in|out|in-out|pulse)$/, async (ctx) => {
  const userId = ctx.from.id.toString();
  const type = ctx.match[1];
  await patchUserSettings(userId, { zoomType: type });
  await ctx.answerCallbackQuery(`✅ Zoom type: ${getZoomEffectLabel(type as "in")}`);
  await ctx.editMessageText(
    `✅ *Setting disimpan\\!*\n\nZoom type: *${getZoomEffectLabel(type as "in")}*`,
    {
      parse_mode: "MarkdownV2",
      reply_markup: new InlineKeyboard().text("« Kembali ke Pengaturan", "settings"),
    }
  );
});

bot.callbackQuery(/^set_zoom_mode_(auto|always|never)$/, async (ctx) => {
  const userId = ctx.from.id.toString();
  const mode = ctx.match[1];
  await patchUserSettings(userId, { zoomMode: mode });
  await ctx.answerCallbackQuery(`✅ Zoom mode: ${mode}`);
  await ctx.editMessageText(
    `✅ *Setting disimpan\\!*\n\nZoom mode: *${mode}*`,
    {
      parse_mode: "MarkdownV2",
      reply_markup: new InlineKeyboard().text("« Kembali ke Pengaturan", "settings"),
    }
  );
});

bot.callbackQuery("reset_zoom", async (ctx) => {
  const userId = ctx.from.id.toString();
  await patchUserSettings(userId, {
    zoomEnabled: null, zoomMode: null, zoomType: null, zoomIntensity: null, zoomMinScore: null,
  });
  await ctx.answerCallbackQuery("✅ Zoom direset ke default env");
  await ctx.editMessageText(
    `✅ Zoom Effect direset ke default env`,
    {
      parse_mode: "MarkdownV2",
      reply_markup: new InlineKeyboard().text("« Kembali", "settings"),
    }
  );
});

// ─── TOGGLE INTRO/OUTRO ───────────────────────────────────────────────────

bot.callbackQuery("toggle_intro", async (ctx) => {
  const userId = ctx.from.id.toString();
  const s = await getOrCreateUserSettings(userId);
  const current = s.introEnabled ?? getIntroOutroConfig().introEnabled;
  await patchUserSettings(userId, { introEnabled: !current });
  await ctx.answerCallbackQuery(`✅ Intro ${!current ? "diaktifkan" : "dinonaktifkan"}`);
  await ctx.editMessageText(
    `✅ Intro: *${!current ? "✅ Aktif" : "❌ Nonaktif"}*`,
    {
      parse_mode: "MarkdownV2",
      reply_markup: new InlineKeyboard().text("« Kembali ke Pengaturan", "settings"),
    }
  );
});

bot.callbackQuery("toggle_outro", async (ctx) => {
  const userId = ctx.from.id.toString();
  const s = await getOrCreateUserSettings(userId);
  const current = s.outroEnabled ?? getIntroOutroConfig().outroEnabled;
  await patchUserSettings(userId, { outroEnabled: !current });
  await ctx.answerCallbackQuery(`✅ Outro ${!current ? "diaktifkan" : "dinonaktifkan"}`);
  await ctx.editMessageText(
    `✅ Outro: *${!current ? "✅ Aktif" : "❌ Nonaktif"}*`,
    {
      parse_mode: "MarkdownV2",
      reply_markup: new InlineKeyboard().text("« Kembali ke Pengaturan", "settings"),
    }
  );
});

bot.callbackQuery("reset_introoutro", async (ctx) => {
  const userId = ctx.from.id.toString();
  await patchUserSettings(userId, {
    introEnabled: null, introText: null, introDuration: null,
    outroEnabled: null, outroText: null, outroDuration: null,
  });
  await ctx.answerCallbackQuery("✅ Intro/Outro direset ke default env");
  await ctx.editMessageText(
    `✅ Intro/Outro direset ke default env`,
    {
      parse_mode: "MarkdownV2",
      reply_markup: new InlineKeyboard().text("« Kembali", "settings"),
    }
  );
});

// ─── TEXT COMMANDS FOR SETTING VALUES ────────────────────────────────────────

// /setwm TeksBaru — set watermark text
bot.command("setwm", async (ctx) => {
  const userId = ctx.from?.id?.toString();
  if (!userId) return;
  const text = ctx.message?.text?.replace("/setwm", "").trim();
  if (!text) {
    await ctx.reply("Gunakan: /setwm TeksWatermarkBaru\nContoh: /setwm @NamaChannel");
    return;
  }
  await patchUserSettings(userId, { watermarkText: text });
  await ctx.reply(`✅ Teks watermark diset ke: "${text}"\n\nAktif untuk akun kamu saja.`);
});

// /setintro TeksIntro
bot.command("setintro", async (ctx) => {
  const userId = ctx.from?.id?.toString();
  if (!userId) return;
  const text = ctx.message?.text?.replace("/setintro", "").trim();
  if (!text) {
    await ctx.reply("Gunakan: /setintro TeksIntromu\nContoh: /setintro AutoClip Bot");
    return;
  }
  await patchUserSettings(userId, { introText: text, introEnabled: true });
  await ctx.reply(`✅ Teks intro diset ke: "${text}" (dan intro diaktifkan)`);
});

// /setoutro TeksOutro
bot.command("setoutro", async (ctx) => {
  const userId = ctx.from?.id?.toString();
  if (!userId) return;
  const text = ctx.message?.text?.replace("/setoutro", "").trim();
  if (!text) {
    await ctx.reply("Gunakan: /setoutro TeksOutromu\nContoh: /setoutro Subscribe! 🔔");
    return;
  }
  await patchUserSettings(userId, { outroText: text, outroEnabled: true });
  await ctx.reply(`✅ Teks outro diset ke: "${text}" (dan outro diaktifkan)`);
});

// ─── PROCESS CALLBACKS ────────────────────────────────────────────────────

bot.callbackQuery(/^process_v_(.+)$/, async (ctx) => {
  const jobId = ctx.match[1];
  await ctx.answerCallbackQuery("🚀 Memproses video...");
  await ctx.editMessageText("🚀 Memulai proses... Mohon tunggu!", { parse_mode: "Markdown" });
  await processJobWithUpdates(ctx, jobId, true);
});

bot.callbackQuery(/^process_o_(.+)$/, async (ctx) => {
  const jobId = ctx.match[1];
  await ctx.answerCallbackQuery("🚀 Memproses video...");
  await ctx.editMessageText("🚀 Memulai proses... Mohon tunggu!", { parse_mode: "Markdown" });
  await processJobWithUpdates(ctx, jobId, false);
});

bot.callbackQuery(/^process_(.+)$/, async (ctx) => {
  const rawMatch = ctx.match[1];
  if (rawMatch.startsWith("v_") || rawMatch.startsWith("o_")) return;
  const jobId = rawMatch;
  await ctx.answerCallbackQuery("🚀 Memproses video...");
  await ctx.editMessageText("🚀 Memulai proses... Mohon tunggu!", { parse_mode: "Markdown" });
  await processJobWithUpdates(ctx, jobId, true);
});

bot.callbackQuery(/^retry_job_(.+)$/, async (ctx) => {
  const jobId = ctx.match[1];
  await ctx.answerCallbackQuery("🔄 Mencoba ulang...");
  const jobs = await db.select().from(clipJobs).where(eq(clipJobs.jobId, jobId));
  if (!jobs.length) { await ctx.reply("❌ Job tidak ditemukan."); return; }
  await db.update(clipJobs).set({ status: "queued", errorMessage: null, updatedAt: new Date() }).where(eq(clipJobs.jobId, jobId));
  await processJobWithUpdates(ctx, jobId);
});

// ═══════════════════════════════════════════════════════════════════════════
// HANDLER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

async function handleVideoUrl(ctx: Context, url: string) {
  const userId = ctx.from?.id?.toString();
  const chatId = ctx.chat?.id?.toString();
  const messageId = ctx.message?.message_id;
  if (!userId || !chatId) return;

  const userSetting = await getOrCreateUserSettings(userId, {
    username: ctx.from?.username,
    firstName: ctx.from?.first_name,
  });

  const platform = detectPlatform(url);
  if (platform === "unknown") {
    await ctx.reply(
      "❌ URL tidak dikenali. Kirim link dari YouTube, Facebook, TikTok, atau Instagram.",
      { reply_markup: new InlineKeyboard().text("📚 Panduan", "help") }
    );
    return;
  }

  const jobId = uuidv4();
  await db.insert(clipJobs).values({
    jobId,
    telegramUserId: userId,
    telegramChatId: chatId,
    telegramMessageId: messageId,
    sourceUrl: url,
    platform,
    status: "queued",
  });

  const tokens = await db.select().from(youtubeTokens).where(eq(youtubeTokens.telegramUserId, userId));
  const isConnected = tokens.length > 0;

  // Build feature summary from resolved per-user settings
  const effectiveMaxClips = resolveMaxClips(userSetting.maxClips);
  const effectiveMode = resolveAspectRatioMode(userSetting.aspectRatioMode);
  const effectiveWm = resolveWatermarkConfig({
    watermarkEnabled: userSetting.watermarkEnabled,
    watermarkText: userSetting.watermarkText,
    watermarkPosition: userSetting.watermarkPosition,
    watermarkFontSize: userSetting.watermarkFontSize,
    watermarkColor: userSetting.watermarkColor,
    watermarkOpacity: userSetting.watermarkOpacity,
    watermarkBox: userSetting.watermarkBox,
  });
  const effectiveZoom = resolveZoomEffectConfig({
    zoomEnabled: userSetting.zoomEnabled,
    zoomMode: userSetting.zoomMode,
    zoomType: userSetting.zoomType,
    zoomIntensity: userSetting.zoomIntensity,
    zoomMinScore: userSetting.zoomMinScore,
  });
  const effectiveIo = resolveIntroOutroConfig({
    introEnabled: userSetting.introEnabled,
    introText: userSetting.introText,
    introDuration: userSetting.introDuration,
    outroEnabled: userSetting.outroEnabled,
    outroText: userSetting.outroText,
    outroDuration: userSetting.outroDuration,
  });

  const featureInfo =
    `📐 Mode 9:16: *${getModeLabel(effectiveMode)}*\n` +
    `✂️ AutoClip: *${effectiveMaxClips} klip*\n` +
    `💧 Watermark: *${effectiveWm.enabled ? `✅ "${effectiveWm.text}"` : "❌ Nonaktif"}*\n` +
    `🔍 Zoom: *${effectiveZoom.enabled ? `✅ ${effectiveZoom.type}` : "❌ Nonaktif"}*\n` +
    `🎬 Intro/Outro: *${effectiveIo.introEnabled || effectiveIo.outroEnabled ? "✅" : "❌"}*\n` +
    `_(Ubah via /settings)_`;

  if (!isConnected) {
    await ctx.reply(
      `${getPlatformEmoji(platform)} *Video terdeteksi!*\n\n` +
        `⚠️ YouTube belum terhubung. Klip akan dikirim ke Telegram saja.\n\n` +
        featureInfo +
        `\n\nHubungkan YouTube untuk auto-upload!`,
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard()
          .url("🔗 Hubungkan YouTube", await getConnectUrl(userId))
          .row()
          .text("▶️ Proses Tanpa YouTube", `process_${jobId}`),
      }
    );
  } else {
    await ctx.reply(
      `${getPlatformEmoji(platform)} *Video terdeteksi!*\n\n` +
        `Platform: ${platform.toUpperCase()}\n` +
        `URL: \`${url.slice(0, 50)}${url.length > 50 ? "..." : ""}\`\n\n` +
        featureInfo +
        `\n\nPilih format output:`,
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard()
          .text(`📱 Vertikal 9:16 (${getModeLabel(effectiveMode)})`, `process_v_${jobId}`)
          .row()
          .text("🎬 Original (Keep Ratio)", `process_o_${jobId}`),
      }
    );
  }
}

async function processJobWithUpdates(
  ctx: Context,
  jobId: string,
  makeVertical = true
) {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const statusMsg = await ctx.api.sendMessage(chatId, "⏳ *Memproses...*", {
    parse_mode: "Markdown",
  });
  const statusMessageId = statusMsg.message_id;

  const onStatusUpdate = async (_status: string, message: string) => {
    try {
      await ctx.api.editMessageText(chatId, statusMessageId, `*${message}*`, {
        parse_mode: "Markdown",
      });
    } catch { /* ignore */ }
  };

  try {
    await processJob(jobId, onStatusUpdate);

    const jobs = await db.select().from(clipJobs).where(eq(clipJobs.jobId, jobId));
    const job = jobs[0];

    if (job.status === "done" && job.clips) {
      const clips = job.clips as ClipResult[];
      const successClips = clips.filter((c) => c.filePath);

      await ctx.api.editMessageText(
        chatId,
        statusMessageId,
        `✅ *Selesai\\! ${successClips.length} klip berhasil dibuat\\!*`,
        { parse_mode: "MarkdownV2" }
      );

      for (let i = 0; i < successClips.length; i++) {
        const clip = successClips[i];
        try {
          if (clip.thumbnailPath && fs.existsSync(clip.thumbnailPath)) {
            await ctx.api.sendPhoto(chatId, new InputFile(clip.thumbnailPath), {
              caption:
                `🎬 *Klip ${i + 1}/${successClips.length}*\n\n` +
                `📌 ${clip.title.slice(0, 80)}\n` +
                `⏱ ${clip.duration}s | 🔥 Score: ${clip.viralScore}/10\n` +
                (clip.youtubeUrl ? `🔗 ${clip.youtubeUrl}` : "📤 Dikirim ke Telegram"),
              parse_mode: "Markdown",
            });
          }

          if (clip.filePath && fs.existsSync(clip.filePath)) {
            await ctx.api.sendVideo(chatId, new InputFile(clip.filePath), {
              caption:
                `*${clip.title.slice(0, 80)}*\n` +
                (clip.youtubeUrl ? `🔗 ${clip.youtubeUrl}` : ""),
              parse_mode: "Markdown",
              width: 1080,
              height: 1920,
            });
          }
        } catch (e) {
          console.error(`Failed to send clip ${i}:`, e);
        }
      }

      const hasYoutube = successClips.some((c) => c.youtubeUrl);
      const summaryKeyboard = new InlineKeyboard();
      if (hasYoutube) {
        summaryKeyboard.url("📺 Buka YouTube Studio", "https://studio.youtube.com/channel/videos/upload").row();
      }
      summaryKeyboard.text("⚙️ Pengaturan", "settings").text("📚 Panduan", "help");

      await ctx.api.sendMessage(
        chatId,
        messages.resultSummary(
          successClips.map((c) => ({
            title: c.title,
            duration: c.duration,
            youtubeUrl: c.youtubeUrl,
            viralScore: c.viralScore,
            hasThumbnail: !!(c.thumbnailPath && fs.existsSync(c.thumbnailPath)),
          }))
        ),
        { parse_mode: "MarkdownV2", reply_markup: summaryKeyboard }
      );

      setTimeout(() => {
        successClips.forEach((c) => {
          if (c.filePath && fs.existsSync(c.filePath)) {
            try { fs.unlinkSync(c.filePath); } catch { /* ignore */ }
          }
          if (c.thumbnailPath && fs.existsSync(c.thumbnailPath)) {
            try { fs.unlinkSync(c.thumbnailPath); } catch { /* ignore */ }
          }
        });
      }, 30000);
    } else if (job.status === "error") {
      await ctx.api.editMessageText(
        chatId,
        statusMessageId,
        messages.error(job.errorMessage || "Terjadi kesalahan tidak diketahui"),
        {
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard().text("🔄 Coba Lagi", `retry_job_${jobId}`),
        }
      );
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await ctx.api.editMessageText(
      chatId,
      statusMessageId,
      messages.error(errorMsg),
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard().text("🔄 Coba Lagi", `retry_job_${jobId}`),
      }
    ).catch(() => {});
  }
}

async function handleConnect(ctx: Context) {
  const userId = ctx.from?.id?.toString();
  if (!userId) return;
  const connectUrl = await getConnectUrl(userId);
  await ctx.reply(messages.connecting, {
    parse_mode: "MarkdownV2",
    reply_markup: new InlineKeyboard()
      .url("🔗 Login ke YouTube Studio", connectUrl)
      .row()
      .text("ℹ️ Bantuan", "help"),
  });
}

async function getConnectUrl(userId: string): Promise<string> {
  try { return getAuthUrl(userId); } catch { return "https://accounts.google.com"; }
}

async function handleSettings(ctx: Context) {
  const userId = ctx.from?.id?.toString();
  if (!userId) return;

  const s = await getOrCreateUserSettings(userId, {
    username: ctx.from?.username,
    firstName: ctx.from?.first_name,
  });

  const tokens = await db.select().from(youtubeTokens).where(eq(youtubeTokens.telegramUserId, userId));

  const effectiveMaxClips = resolveMaxClips(s.maxClips);
  const effectiveMode = resolveAspectRatioMode(s.aspectRatioMode);
  const effectiveWm = resolveWatermarkConfig({
    watermarkEnabled: s.watermarkEnabled, watermarkText: s.watermarkText,
    watermarkPosition: s.watermarkPosition, watermarkFontSize: s.watermarkFontSize,
    watermarkColor: s.watermarkColor, watermarkOpacity: s.watermarkOpacity, watermarkBox: s.watermarkBox,
  });
  const effectiveZoom = resolveZoomEffectConfig({
    zoomEnabled: s.zoomEnabled, zoomMode: s.zoomMode, zoomType: s.zoomType,
    zoomIntensity: s.zoomIntensity, zoomMinScore: s.zoomMinScore,
  });
  const effectiveIo = resolveIntroOutroConfig({
    introEnabled: s.introEnabled, introText: s.introText, introDuration: s.introDuration,
    outroEnabled: s.outroEnabled, outroText: s.outroText, outroDuration: s.outroDuration,
  });

  const text = messages.settings({
    maxClips: effectiveMaxClips,
    minDuration: s.minDuration ?? 20,
    maxDuration: s.maxDuration ?? 40,
    defaultPrivacy: s.defaultPrivacy ?? "private",
    youtubeConnected: tokens.length > 0,
    watermarkText: effectiveWm.text,
    watermarkEnabled: effectiveWm.enabled,
    aspectRatioMode: getModeLabel(effectiveMode),
    zoomEnabled: effectiveZoom.enabled,
    introEnabled: effectiveIo.introEnabled,
    outroEnabled: effectiveIo.outroEnabled,
  });

  const kb = new InlineKeyboard()
    .text("✂️ Jumlah Klip", "settings_clips")
    .text("🔒 Privacy", "settings_privacy")
    .row()
    .text("📐 Aspect Ratio", "settings_aspect")
    .text("💧 Watermark", "settings_watermark")
    .row()
    .text("🔍 Zoom Effect", "settings_zoom")
    .text("🎬 Intro/Outro", "settings_introoutro")
    .row()
    .text("🔗 Hubungkan YouTube", "connect");

  try {
    await ctx.editMessageText(text, { parse_mode: "MarkdownV2", reply_markup: kb });
  } catch {
    await ctx.reply(text, { parse_mode: "MarkdownV2", reply_markup: kb });
  }
}

async function handleHistory(ctx: Context) {
  const userId = ctx.from?.id?.toString();
  if (!userId) return;

  const jobs = await db
    .select()
    .from(clipJobs)
    .where(eq(clipJobs.telegramUserId, userId))
    .orderBy(desc(clipJobs.createdAt))
    .limit(10);

  if (!jobs.length) {
    await ctx.reply("📭 Belum ada riwayat. Kirim link video untuk memulai!", {
      reply_markup: new InlineKeyboard().text("📚 Panduan", "help"),
    });
    return;
  }

  const statusEmoji: Record<string, string> = {
    queued: "⏳", downloading: "⬇️", analyzing: "🧠",
    clipping: "✂️", uploading: "📤", done: "✅", error: "❌",
  };

  let msg = `📋 *Riwayat (${jobs.length} job terbaru):*\n\n`;
  jobs.forEach((job, i) => {
    const clips = (job.clips as ClipResult[] | null) || [];
    const doneClips = clips.filter((c) => c.youtubeUrl).length;
    msg += `${i + 1}. ${statusEmoji[job.status] || "❓"} *${(job.videoTitle || "Video").slice(0, 35)}*\n`;
    msg += ` ${getPlatformEmoji(job.platform)} ${job.platform} | ${job.status}`;
    if (job.status === "done" && clips.length) {
      msg += ` | ${clips.length} klip`;
      if (doneClips) msg += ` (${doneClips} di YT)`;
    }
    msg += `\n`;
  });
  await ctx.reply(msg, { parse_mode: "Markdown" });
}

bot.catch((err) => {
  console.error("Bot error:", err);
});

export default bot;
export { formatDuration };
