/* eslint-disable @typescript-eslint/no-explicit-any */
import { Bot, InlineKeyboard, InputFile, type Context } from "grammy";
import { db } from "@/db";
import {
  clipJobs,
  youtubeTokens,
  tiktokTokens,
  userSettings,
  ClipResult,
} from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { detectPlatform } from "@/lib/video-processor";
import { getAuthUrl } from "@/lib/youtube-oauth";
import { getTikTokAuthUrl } from "@/lib/tiktok-oauth";
import { messages, getPlatformEmoji } from "@/lib/bot-messages";
import { processJob } from "@/lib/job-processor";
import fs from "fs";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");

export const bot = new Bot(token);

// URL detection regex
const URL_REGEX =
  /https?:\/\/(www\.)?(youtube\.com\/watch|youtu\.be|youtube\.com\/shorts|facebook\.com\/(watch|video)|fb\.watch|tiktok\.com\/@[^/]+\/video|instagram\.com\/(reel|p|tv))[^\s]*/i;

// ── COMMANDS ──────────────────────────────────────────────────────────────────

bot.command("start", async (ctx) => {
  await ensureUserSettings(ctx.from?.id?.toString() || "");
  await ctx.reply(messages.welcome, {
    parse_mode: "MarkdownV2",
    reply_markup: new InlineKeyboard()
      .text("🎬 Cara Pakai", "help")
      .text("📺 Hubungkan YouTube", "connect_youtube")
      .row()
      .text("🎵 Hubungkan TikTok", "connect_tiktok")
      .text("⚙️ Pengaturan", "settings")
      .row()
      .text("📋 Riwayat", "history"),
  });
});

bot.command("help", async (ctx) => {
  await ctx.reply(messages.help, { parse_mode: "MarkdownV2" });
});

bot.command("connect", async (ctx) => {
  await handleConnectYouTube(ctx);
});

bot.command("connect_tiktok", async (ctx) => {
  await handleConnectTikTok(ctx);
});

bot.command("disconnect", async (ctx) => {
  const userId = ctx.from?.id?.toString();
  if (!userId) return;
  await db.delete(youtubeTokens).where(eq(youtubeTokens.telegramUserId, userId));
  await db
    .update(userSettings)
    .set({ youtubeConnected: false, updatedAt: new Date() })
    .where(eq(userSettings.telegramUserId, userId));
  await ctx.reply("✅ Akun YouTube berhasil diputus.");
});

bot.command("disconnect_tiktok", async (ctx) => {
  const userId = ctx.from?.id?.toString();
  if (!userId) return;
  await db.delete(tiktokTokens).where(eq(tiktokTokens.telegramUserId, userId));
  await db
    .update(userSettings)
    .set({ tiktokConnected: false, updatedAt: new Date() })
    .where(eq(userSettings.telegramUserId, userId));
  await ctx.reply("✅ Akun TikTok berhasil diputus.");
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
    queued: "⏳",
    downloading: "⬇️",
    analyzing: "🧠",
    clipping: "✂️",
    uploading: "📤",
    done: "✅",
    error: "❌",
  };

  let msg = `📊 *Status Terbaru:*\n\n`;
  jobs.slice(0, 3).forEach((job) => {
    msg += `${statusEmoji[job.status] || "❓"} *${(job.videoTitle || "Video").slice(0, 40)}*\n`;
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
  await ctx.reply(
    "⛔ Untuk membatalkan proses yang sedang berjalan, silakan tunggu sebentar. Proses akan otomatis berhenti jika ada error."
  );
});

// ── MESSAGE HANDLER (URL detection) ──────────────────────────────────────────

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
          .text("📺 Hubungkan YouTube", "connect_youtube")
          .row()
          .text("🎵 Hubungkan TikTok", "connect_tiktok"),
      }
    );
    return;
  }

  const url = urlMatch[0];
  await handleVideoUrl(ctx, url);
});

// ── CALLBACK QUERY HANDLERS ───────────────────────────────────────────────────

bot.callbackQuery("help", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(messages.help, { parse_mode: "MarkdownV2" });
});

bot.callbackQuery("connect_youtube", async (ctx) => {
  await ctx.answerCallbackQuery();
  await handleConnectYouTube(ctx);
});

bot.callbackQuery("connect_tiktok", async (ctx) => {
  await ctx.answerCallbackQuery();
  await handleConnectTikTok(ctx);
});

// Legacy "connect" callback
bot.callbackQuery("connect", async (ctx) => {
  await ctx.answerCallbackQuery();
  await handleConnectYouTube(ctx);
});

bot.callbackQuery("settings", async (ctx) => {
  await ctx.answerCallbackQuery();
  await handleSettings(ctx);
});

bot.callbackQuery("history", async (ctx) => {
  await ctx.answerCallbackQuery();
  await handleHistory(ctx);
});

// ── Settings: max clips ───────────────────────────────────────────────────────
bot.callbackQuery(/^set_clips_(\d+)$/, async (ctx) => {
  const userId = ctx.from.id.toString();
  const maxClips = parseInt(ctx.match[1]);
  await ctx.answerCallbackQuery(`✅ Maksimal klip diset ke ${maxClips}`);
  await db
    .update(userSettings)
    .set({ maxClips, updatedAt: new Date() })
    .where(eq(userSettings.telegramUserId, userId));
  await ctx.editMessageText(`✅ Pengaturan disimpan: Maksimal ${maxClips} klip per video.`);
});

// ── Settings: YouTube privacy ─────────────────────────────────────────────────
bot.callbackQuery(/^set_privacy_(private|unlisted|public)$/, async (ctx) => {
  const userId = ctx.from.id.toString();
  const privacy = ctx.match[1];
  await ctx.answerCallbackQuery(`✅ YouTube privacy: ${privacy}`);
  await db
    .update(userSettings)
    .set({ defaultPrivacy: privacy, updatedAt: new Date() })
    .where(eq(userSettings.telegramUserId, userId));
  await ctx.editMessageText(`✅ YouTube privacy diset ke: *${privacy}*`, {
    parse_mode: "Markdown",
  });
});

// ── Settings: TikTok privacy ──────────────────────────────────────────────────
bot.callbackQuery(
  /^set_tiktok_privacy_(PUBLIC_TO_EVERYONE|MUTUAL_FOLLOW_FRIENDS|SELF_ONLY)$/,
  async (ctx) => {
    const userId = ctx.from.id.toString();
    const privacy = ctx.match[1];
    await ctx.answerCallbackQuery(`✅ TikTok privacy: ${privacy}`);
    await db
      .update(userSettings)
      .set({ tiktokPrivacy: privacy, updatedAt: new Date() })
      .where(eq(userSettings.telegramUserId, userId));
    await ctx.editMessageText(`✅ TikTok privacy diset ke: *${privacy}*`, {
      parse_mode: "Markdown",
    });
  }
);

// ── Settings: TikTok auto upload toggle ───────────────────────────────────────
bot.callbackQuery("toggle_tiktok_auto", async (ctx) => {
  const userId = ctx.from.id.toString();
  const settingRows = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.telegramUserId, userId));
  const current = settingRows[0]?.tiktokAutoUpload ?? true;
  const newVal = !current;
  await ctx.answerCallbackQuery(
    `TikTok auto upload: ${newVal ? "✅ Aktif" : "❌ Nonaktif"}`
  );
  await db
    .update(userSettings)
    .set({ tiktokAutoUpload: newVal, updatedAt: new Date() })
    .where(eq(userSettings.telegramUserId, userId));
  await ctx.editMessageText(
    `✅ TikTok auto upload: *${newVal ? "Aktif" : "Nonaktif"}*`,
    { parse_mode: "Markdown" }
  );
});

// ── Retry job ─────────────────────────────────────────────────────────────────
bot.callbackQuery(/^retry_job_(.+)$/, async (ctx) => {
  const jobId = ctx.match[1];
  await ctx.answerCallbackQuery("🔄 Mencoba ulang...");

  const jobs = await db
    .select()
    .from(clipJobs)
    .where(eq(clipJobs.jobId, jobId));
  if (!jobs.length) {
    await ctx.reply("❌ Job tidak ditemukan.");
    return;
  }

  await db
    .update(clipJobs)
    .set({ status: "queued", errorMessage: null, updatedAt: new Date() })
    .where(eq(clipJobs.jobId, jobId));

  await processJobWithUpdates(ctx, jobId);
});

// ── Video processing callbacks ────────────────────────────────────────────────
bot.callbackQuery(/^process_v_(.+)$/, async (ctx) => {
  const jobId = ctx.match[1];
  await ctx.answerCallbackQuery("🚀 Memproses video...");
  await ctx.editMessageText("🚀 Memulai proses... Mohon tunggu!", {
    parse_mode: "Markdown",
  });
  await processJobWithUpdates(ctx, jobId, true);
});

bot.callbackQuery(/^process_o_(.+)$/, async (ctx) => {
  const jobId = ctx.match[1];
  await ctx.answerCallbackQuery("🚀 Memproses video...");
  await ctx.editMessageText("🚀 Memulai proses... Mohon tunggu!", {
    parse_mode: "Markdown",
  });
  await processJobWithUpdates(ctx, jobId, false);
});

bot.callbackQuery(/^process_(.+)$/, async (ctx) => {
  const rawMatch = ctx.match[1];
  if (rawMatch.startsWith("v_") || rawMatch.startsWith("o_")) return;
  const jobId = rawMatch;
  await ctx.answerCallbackQuery("🚀 Memproses video...");
  await ctx.editMessageText("🚀 Memulai proses... Mohon tunggu!", {
    parse_mode: "Markdown",
  });
  await processJobWithUpdates(ctx, jobId, true);
});

// ── Handler Functions ─────────────────────────────────────────────────────────

async function handleVideoUrl(ctx: Context, url: string) {
  const userId = ctx.from?.id?.toString();
  const chatId = ctx.chat?.id?.toString();
  const messageId = ctx.message?.message_id;

  if (!userId || !chatId) return;

  await ensureUserSettings(userId);

  const platform = detectPlatform(url);
  if (platform === "unknown") {
    await ctx.reply(messages.invalidUrl, { parse_mode: "MarkdownV2" });
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

  // Check connections
  const ytConnected =
    (await db.select().from(youtubeTokens).where(eq(youtubeTokens.telegramUserId, userId)))
      .length > 0;
  const ttConnected =
    (await db.select().from(tiktokTokens).where(eq(tiktokTokens.telegramUserId, userId)))
      .length > 0;

  // Build connection status text
  let connectionInfo = "";
  if (!ytConnected && !ttConnected) {
    connectionInfo =
      "\n\n⚠️ YouTube & TikTok belum terhubung. Klip akan dikirim ke Telegram saja.";
  } else {
    const platforms: string[] = [];
    if (ytConnected) platforms.push("📺 YouTube");
    if (ttConnected) platforms.push("🎵 TikTok");
    connectionInfo = `\n\n✅ Upload ke: ${platforms.join(" & ")}`;
  }

  const keyboard = new InlineKeyboard()
    .text("📱 Vertikal 9:16 (Shorts)", `process_v_${jobId}`)
    .row()
    .text("🎬 Original (Keep Ratio)", `process_o_${jobId}`);

  if (!ytConnected) {
    keyboard.row().url("🔗 Hubungkan YouTube", await getConnectUrl(userId));
  }
  if (!ttConnected) {
    keyboard.row().url("🎵 Hubungkan TikTok", getTikTokConnectUrl(userId));
  }

  await ctx.reply(
    `${getPlatformEmoji(platform)} *Video terdeteksi!*\n\n` +
      `Platform: ${platform.toUpperCase()}\n` +
      `URL: \`${url.slice(0, 50)}${url.length > 50 ? "..." : ""}\`` +
      connectionInfo +
      "\n\nPilih format output:",
    { parse_mode: "Markdown", reply_markup: keyboard }
  );
}

async function processJobWithUpdates(
  ctx: Context,
  jobId: string,
  makeVertical: boolean = true
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
    } catch {
      // Message might not have changed
    }
  };

  try {
    await processJob(jobId, onStatusUpdate);

    const jobs = await db
      .select()
      .from(clipJobs)
      .where(eq(clipJobs.jobId, jobId));
    const job = jobs[0];

    if (job.status === "done" && job.clips) {
      const clips = job.clips as ClipResult[];
      const successClips = clips.filter((c) => c.filePath);

      await ctx.api.editMessageText(
        chatId,
        statusMessageId,
        `✅ *Selesai! ${successClips.length} klip berhasil dibuat!*`,
        { parse_mode: "Markdown" }
      );

      for (let i = 0; i < successClips.length; i++) {
        const clip = successClips[i];

        const captionLines = [
          `<b>Klip ${i + 1}/${successClips.length}</b>`,
          `<b>📝 ${clip.title}</b>`,
          `⏱ Durasi: ${clip.duration}s`,
          `🔥 Viral Score: ${clip.viralScore}/10`,
          `💡 ${clip.reason}`,
        ];

        if (clip.youtubeUrl) {
          captionLines.push(`\n📺 YouTube: ${clip.youtubeUrl}`);
          captionLines.push(`<i>(Tersimpan sebagai Draft di YouTube Studio)</i>`);
        }
        if (clip.tiktokPublishId) {
          captionLines.push(`\n🎵 TikTok: Tersimpan di Inbox`);
          captionLines.push(`<i>(Buka TikTok → notifikasi → tap Post)</i>`);
        }

        const caption = captionLines.join("\n").trim();

        try {
          if (clip.filePath && fs.existsSync(clip.filePath)) {
            await ctx.api.sendVideo(chatId, new InputFile(clip.filePath), {
              caption,
              parse_mode: "HTML",
            });
          }
        } catch (err) {
          console.error(`Failed to send clip ${i + 1}:`, err);
          await ctx.api.sendMessage(chatId, caption, { parse_mode: "HTML" });
        }
      }

      // Summary
      const hasYoutube = successClips.some((c) => c.youtubeUrl);
      const hasTikTok = successClips.some((c) => c.tiktokPublishId);
      const summaryKeyboard = new InlineKeyboard();

      if (hasYoutube) {
        summaryKeyboard.url(
          "📺 Buka YouTube Studio",
          "https://studio.youtube.com/channel/videos/upload"
        );
        summaryKeyboard.row();
      }
      if (hasTikTok) {
        summaryKeyboard.url("🎵 Buka TikTok", "https://www.tiktok.com/inbox");
        summaryKeyboard.row();
      }
      summaryKeyboard.text("🎬 Proses Video Lain", "help");

      await ctx.api.sendMessage(
        chatId,
        messages.resultSummary(
          successClips.map((c) => ({
            title: c.title,
            duration: c.duration,
            youtubeUrl: c.youtubeUrl,
            tiktokPublishId: c.tiktokPublishId,
            viralScore: c.viralScore,
          }))
        ),
        { parse_mode: "MarkdownV2", reply_markup: summaryKeyboard }
      );

      // Cleanup clip files after sending
      setTimeout(() => {
        successClips.forEach((c) => {
          if (c.filePath && fs.existsSync(c.filePath)) {
            try {
              fs.unlinkSync(c.filePath);
            } catch {
              /* ignore */
            }
          }
        });
      }, 30000);
    } else if (job.status === "error") {
      await ctx.api.editMessageText(
        chatId,
        statusMessageId,
        messages.error(job.errorMessage || "Terjadi kesalahan tidak diketahui"),
        {
          parse_mode: "MarkdownV2",
          reply_markup: new InlineKeyboard().text(
            "🔄 Coba Lagi",
            `retry_job_${jobId}`
          ),
        }
      );
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await ctx.api
      .editMessageText(
        chatId,
        statusMessageId,
        messages.error(errorMsg),
        {
          parse_mode: "MarkdownV2",
          reply_markup: new InlineKeyboard().text(
            "🔄 Coba Lagi",
            `retry_job_${jobId}`
          ),
        }
      )
      .catch(() => {});
  }
}

async function handleConnectYouTube(ctx: Context) {
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

async function handleConnectTikTok(ctx: Context) {
  const userId = ctx.from?.id?.toString();
  if (!userId) return;

  let connectUrl: string;
  try {
    connectUrl = getTikTokConnectUrl(userId);
  } catch {
    await ctx.reply(
      "❌ TikTok OAuth belum dikonfigurasi.\n\nSet environment variable:\n• `TIKTOK_CLIENT_KEY`\n• `TIKTOK_CLIENT_SECRET`\n• `TIKTOK_REDIRECT_URI`",
      { parse_mode: "Markdown" }
    );
    return;
  }

  await ctx.reply(messages.connectingTikTok, {
    parse_mode: "MarkdownV2",
    reply_markup: new InlineKeyboard()
      .url("🎵 Login ke TikTok", connectUrl)
      .row()
      .text("ℹ️ Bantuan", "help"),
  });
}

async function getConnectUrl(userId: string): Promise<string> {
  try {
    return getAuthUrl(userId);
  } catch {
    return "https://accounts.google.com";
  }
}

function getTikTokConnectUrl(userId: string): string {
  return getTikTokAuthUrl(userId);
}

async function handleSettings(ctx: Context) {
  const userId = ctx.from?.id?.toString();
  if (!userId) return;

  await ensureUserSettings(userId);

  const settingsRows = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.telegramUserId, userId));
  const settings = settingsRows[0];

  const ytTokens = await db
    .select()
    .from(youtubeTokens)
    .where(eq(youtubeTokens.telegramUserId, userId));
  const ttTokens = await db
    .select()
    .from(tiktokTokens)
    .where(eq(tiktokTokens.telegramUserId, userId));

  const keyboard = new InlineKeyboard()
    .text("1 Klip", "set_clips_1")
    .text("2 Klip", "set_clips_2")
    .text("3 Klip", "set_clips_3")
    .row()
    .text("🔒 YT Private", "set_privacy_private")
    .text("🔗 YT Unlisted", "set_privacy_unlisted")
    .text("🌐 YT Public", "set_privacy_public")
    .row()
    .text("🔒 TT Private", "set_tiktok_privacy_SELF_ONLY")
    .text("👥 TT Friends", "set_tiktok_privacy_MUTUAL_FOLLOW_FRIENDS")
    .text("🌐 TT Public", "set_tiktok_privacy_PUBLIC_TO_EVERYONE")
    .row()
    .text(
      `TikTok Auto: ${settings?.tiktokAutoUpload !== false ? "✅" : "❌"}`,
      "toggle_tiktok_auto"
    )
    .row()
    .text("📺 Hubungkan YouTube", "connect_youtube")
    .text("🎵 Hubungkan TikTok", "connect_tiktok");

  await ctx.reply(
    messages.settings({
      maxClips: settings?.maxClips || 3,
      minDuration: settings?.minDuration || 20,
      maxDuration: settings?.maxDuration || 40,
      defaultPrivacy: settings?.defaultPrivacy || "private",
      youtubeConnected: ytTokens.length > 0,
      tiktokConnected: ttTokens.length > 0,
      tiktokPrivacy: settings?.tiktokPrivacy || "SELF_ONLY",
      tiktokAutoUpload: settings?.tiktokAutoUpload !== false,
    }),
    { parse_mode: "Markdown", reply_markup: keyboard }
  );
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
    await ctx.reply(
      "📭 Belum ada riwayat. Kirim link video untuk memulai!",
      { reply_markup: new InlineKeyboard().text("📚 Panduan", "help") }
    );
    return;
  }

  const statusEmoji: Record<string, string> = {
    queued: "⏳",
    downloading: "⬇️",
    analyzing: "🧠",
    clipping: "✂️",
    uploading: "📤",
    done: "✅",
    error: "❌",
  };

  let msg = `📋 *Riwayat (${jobs.length} job terbaru):*\n\n`;
  jobs.forEach((job, i) => {
    const clips = (job.clips as ClipResult[] | null) || [];
    const ytUploads = clips.filter((c) => c.youtubeUrl).length;
    const ttUploads = clips.filter((c) => c.tiktokPublishId).length;

    msg += `${i + 1}. ${statusEmoji[job.status] || "❓"} *${(job.videoTitle || "Video").slice(0, 35)}*\n`;
    msg += `   ${getPlatformEmoji(job.platform)} ${job.platform} | ${job.status}`;

    if (job.status === "done" && clips.length) {
      msg += ` | ${clips.length} klip`;
      if (ytUploads) msg += ` 📺${ytUploads}`;
      if (ttUploads) msg += ` 🎵${ttUploads}`;
    }
    msg += "\n";
  });

  await ctx.reply(msg, { parse_mode: "Markdown" });
}

async function ensureUserSettings(userId: string): Promise<void> {
  if (!userId) return;
  const existing = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.telegramUserId, userId));

  if (!existing.length) {
    await db.insert(userSettings).values({
      telegramUserId: userId,
      maxClips: 3,
      minDuration: 20,
      maxDuration: 40,
      defaultPrivacy: "private",
      tiktokPrivacy: "SELF_ONLY",
      tiktokAutoUpload: true,
      language: "id",
    });
  }
}

bot.catch((err) => {
  console.error("Bot error:", err);
});

export default bot;
