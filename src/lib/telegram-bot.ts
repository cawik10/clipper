import { Bot, Context, InlineKeyboard, InputFile } from "grammy";
import { db } from "@/db";
import { clipJobs, youtubeTokens, userSettings, ClipResult } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { detectPlatform } from "@/lib/video-processor";
import { getAuthUrl } from "@/lib/youtube-oauth";
import { messages, getPlatformEmoji, formatDuration } from "@/lib/bot-messages";
import { processJob } from "@/lib/job-processor";
import fs from "fs";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");

export const bot = new Bot(token);

// URL detection regex
const URL_REGEX = /https?:\/\/(www\.)?(youtube\.com\/watch|youtu\.be|youtube\.com\/shorts|facebook\.com\/(watch|video)|fb\.watch|tiktok\.com\/@[^/]+\/video|instagram\.com\/(reel|p|tv))[^\s]*/i;

// ===== COMMANDS =====

bot.command("start", async (ctx) => {
  await ensureUserSettings(ctx.from?.id?.toString() || "");
  await ctx.reply(messages.welcome, {
    parse_mode: "Markdown",
    reply_markup: new InlineKeyboard()
      .text("🎬 Cara Pakai", "help")
      .text("🔗 Hubungkan YouTube", "connect")
      .row()
      .text("⚙️ Pengaturan", "settings")
      .text("📋 Riwayat", "history"),
  });
});

bot.command("help", async (ctx) => {
  await ctx.reply(messages.help, { parse_mode: "Markdown" });
});

bot.command("connect", async (ctx) => {
  await handleConnect(ctx);
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

  const latest = jobs[0];
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
  await ctx.reply("⛔ Untuk membatalkan proses yang sedang berjalan, silakan tunggu sebentar. Proses akan otomatis berhenti jika ada error.");
});

// ===== MESSAGE HANDLER (URL detection) =====
bot.on("message:text", async (ctx) => {
  const text = ctx.message.text;
  const urlMatch = text.match(URL_REGEX);

  if (!urlMatch) {
    // Not a URL - show help
    if (text.startsWith("/")) return; // ignore unknown commands
    await ctx.reply(
      "Kirim link video YouTube, Facebook, TikTok, atau Instagram untuk mulai! 🎬\n\nGunakan /help untuk panduan lengkap.",
      {
        reply_markup: new InlineKeyboard()
          .text("📚 Panduan", "help")
          .text("🔗 Hubungkan YouTube", "connect"),
      }
    );
    return;
  }

  const url = urlMatch[0];
  await handleVideoUrl(ctx, url);
});

// ===== CALLBACK QUERY HANDLERS =====

bot.callbackQuery("help", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(messages.help, { parse_mode: "Markdown" });
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

// Settings callbacks
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

bot.callbackQuery(/^set_privacy_(private|unlisted|public)$/, async (ctx) => {
  const userId = ctx.from.id.toString();
  const privacy = ctx.match[1];
  await ctx.answerCallbackQuery(`✅ Privacy diset ke ${privacy}`);
  await db
    .update(userSettings)
    .set({ defaultPrivacy: privacy, updatedAt: new Date() })
    .where(eq(userSettings.telegramUserId, userId));
  await ctx.editMessageText(`✅ Privacy video diset ke: *${privacy}*`, { parse_mode: "Markdown" });
});

bot.callbackQuery(/^retry_job_(.+)$/, async (ctx) => {
  const jobId = ctx.match[1];
  await ctx.answerCallbackQuery("🔄 Mencoba ulang...");
  
  const jobs = await db.select().from(clipJobs).where(eq(clipJobs.jobId, jobId));
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

// ===== HANDLER FUNCTIONS =====

async function handleVideoUrl(ctx: Context, url: string) {
  const userId = ctx.from?.id?.toString();
  const chatId = ctx.chat?.id?.toString();
  const messageId = ctx.message?.message_id;

  if (!userId || !chatId) return;

  await ensureUserSettings(userId);

  const platform = detectPlatform(url);
  if (platform === "unknown") {
    await ctx.reply(messages.invalidUrl, { parse_mode: "Markdown" });
    return;
  }

  // Create job
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

  // Check YouTube connection
  const tokens = await db
    .select()
    .from(youtubeTokens)
    .where(eq(youtubeTokens.telegramUserId, userId));

  const isConnected = tokens.length > 0;

  if (!isConnected) {
    await ctx.reply(
      `${getPlatformEmoji(platform)} *Video terdeteksi!*\n\n` +
      `⚠️ YouTube belum terhubung. Klip akan dikirim ke Telegram saja.\n\n` +
      `Hubungkan YouTube untuk auto-upload ke YouTube Studio!`,
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
      `Pilih format output:`,
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard()
          .text("📱 Vertikal 9:16 (Shorts)", `process_v_${jobId}`)
          .row()
          .text("🎬 Original (Keep Ratio)", `process_o_${jobId}`),
      }
    );
  }
}

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
  // Make sure it's not handled by the above patterns
  if (rawMatch.startsWith("v_") || rawMatch.startsWith("o_")) return;
  const jobId = rawMatch;
  await ctx.answerCallbackQuery("🚀 Memproses video...");
  await ctx.editMessageText("🚀 Memulai proses... Mohon tunggu!", { parse_mode: "Markdown" });
  await processJobWithUpdates(ctx, jobId, true);
});

async function processJobWithUpdates(
  ctx: Context,
  jobId: string,
  makeVertical: boolean = true
) {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  let statusMessageId: number | null = null;

  // Send initial status message
  const statusMsg = await ctx.api.sendMessage(chatId, "⏳ *Memproses...*", {
    parse_mode: "Markdown",
  });
  statusMessageId = statusMsg.message_id;

  const onStatusUpdate = async (status: string, message: string) => {
    if (statusMessageId) {
      try {
        await ctx.api.editMessageText(chatId, statusMessageId, `*${message}*`, {
          parse_mode: "Markdown",
        });
      } catch {
        // Message might not have changed
      }
    }
  };

  try {
    await processJob(jobId, onStatusUpdate);

    // Get completed job
    const jobs = await db.select().from(clipJobs).where(eq(clipJobs.jobId, jobId));
    const job = jobs[0];

    if (job.status === "done" && job.clips) {
      const clips = job.clips as ClipResult[];
      const successClips = clips.filter((c) => c.filePath);

      // Update status message
      if (statusMessageId) {
        await ctx.api.editMessageText(
          chatId,
          statusMessageId,
          `✅ *Selesai! ${successClips.length} klip berhasil dibuat!*`,
          { parse_mode: "Markdown" }
        );
      }

      // Send each clip video
      for (let i = 0; i < successClips.length; i++) {
        const clip = successClips[i];
        if (!clip.filePath || !fs.existsSync(clip.filePath)) continue;

        const caption = [
          `🎬 <b>Klip ${i + 1}/${successClips.length}</b>`,
          ``,
          `📝 <b>${clip.title}</b>`,
          ``,
          `⏱ Durasi: ${clip.duration}s`,
          `🔥 Viral Score: ${clip.viralScore}/10`,
          `💡 ${clip.reason}`,
          clip.youtubeUrl ? `\n🔗 YouTube: ${clip.youtubeUrl}` : "",
          clip.youtubeUrl ? `<i>(Tersimpan sebagai Draft di YouTube Studio)</i>` : ``,
        ]
          .join("\n")
          .trim();

        try {
          await ctx.api.sendVideo(chatId, new InputFile(clip.filePath), {
            caption,
            parse_mode: "HTML", // <- Ubah Markdown menjadi HTML di sini
            supports_streaming: true,
          });
        } catch (err) {
          console.error(`Failed to send clip ${i}:`, err);
          await ctx.api.sendMessage(
            chatId,
            `⚠️ Gagal mengirim klip ${i + 1}: File mungkin terlalu besar.`
          );
        }
      }

      // Summary with YouTube link if available
      const hasYoutube = successClips.some((c) => c.youtubeUrl);
      const summaryKeyboard = new InlineKeyboard();

      if (hasYoutube) {
        summaryKeyboard.url(
          "📺 Buka YouTube Studio",
          "https://studio.youtube.com/channel/videos/upload"
        );
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
            viralScore: c.viralScore,
          }))
        ),
        {
          parse_mode: "Markdown",
          reply_markup: summaryKeyboard,
        }
      );

      // Cleanup clip files after sending
      setTimeout(() => {
        successClips.forEach((c) => {
          if (c.filePath && fs.existsSync(c.filePath)) {
            try {
              fs.unlinkSync(c.filePath);
            } catch { /* ignore */ }
          }
        });
      }, 30000); // Wait 30s before cleanup
    } else if (job.status === "error") {
      if (statusMessageId) {
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
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    if (statusMessageId) {
      await ctx.api
        .editMessageText(chatId, statusMessageId, messages.error(errorMsg), {
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard().text("🔄 Coba Lagi", `retry_job_${jobId}`),
        })
        .catch(() => {});
    }
  }
}

async function handleConnect(ctx: Context) {
  const userId = ctx.from?.id?.toString();
  if (!userId) return;

  const connectUrl = await getConnectUrl(userId);

  await ctx.reply(messages.connecting, {
    parse_mode: "Markdown",
    reply_markup: new InlineKeyboard()
      .url("🔗 Login ke YouTube Studio", connectUrl)
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

async function handleSettings(ctx: Context) {
  const userId = ctx.from?.id?.toString();
  if (!userId) return;

  await ensureUserSettings(userId);
  const settingsRows = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.telegramUserId, userId));
  const settings = settingsRows[0];

  const tokens = await db
    .select()
    .from(youtubeTokens)
    .where(eq(youtubeTokens.telegramUserId, userId));

  await ctx.reply(
    messages.settings({
      maxClips: settings.maxClips || 3,
      minDuration: settings.minDuration || 20,
      maxDuration: settings.maxDuration || 40,
      defaultPrivacy: settings.defaultPrivacy || "private",
      youtubeConnected: tokens.length > 0,
    }),
    {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard()
        .text("1 Klip", "set_clips_1")
        .text("2 Klip", "set_clips_2")
        .text("3 Klip", "set_clips_3")
        .row()
        .text("🔒 Private", "set_privacy_private")
        .text("🔗 Unlisted", "set_privacy_unlisted")
        .text("🌐 Public", "set_privacy_public")
        .row()
        .text("🔗 Hubungkan YouTube", "connect"),
    }
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
    await ctx.reply("📭 Belum ada riwayat. Kirim link video untuk memulai!", {
      reply_markup: new InlineKeyboard().text("📚 Panduan", "help"),
    });
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
    const doneClips = clips.filter((c) => c.youtubeUrl).length;
    msg += `${i + 1}. ${statusEmoji[job.status] || "❓"} *${
      (job.videoTitle || "Video").slice(0, 35)
    }*\n`;
    msg += `   ${getPlatformEmoji(job.platform)} ${job.platform} | ${job.status}`;
    if (job.status === "done" && clips.length) {
      msg += ` | ${clips.length} klip`;
      if (doneClips) msg += ` (${doneClips} di YT)`;
    }
    msg += `\n`;
  });

  await ctx.reply(msg, { parse_mode: "Markdown" });
}

// Ensure user settings exist
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
      language: "id",
    });
  }
}

// Error handler
bot.catch((err) => {
  console.error("Bot error:", err);
});

export default bot;
