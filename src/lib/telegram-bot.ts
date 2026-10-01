import { Bot, Context, InlineKeyboard, InputFile } from "grammy";
import { db } from "@/db";
import { clipJobs, youtubeTokens, userSettings, ClipResult } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { detectPlatform } from "@/lib/video-processor";
import { getAuthUrl } from "@/lib/youtube-oauth";
import { messages, getPlatformEmoji, formatDuration } from "@/lib/bot-messages";
import { processJob } from "@/lib/job-processor";
import {
  getAspectRatioMode,
  getModeLabel,
  getThumbnailConfig,
  getThumbnailModeLabel,
  getWatermarkConfig,
  getWatermarkPositionLabel,
  getIntroOutroConfig,
  getZoomEffectConfig,
  getZoomEffectLabel,
  getMaxClipsConfig,
} from "@/lib/video-config";
import fs from "fs";

const token = process.env.TELEGRAM_BOT_TOKEN || "placeholder_token_for_build";
export const bot = new Bot(token);

const URL_REGEX =
  /https?:\/\/(www\.)?(youtube\.com\/watch|youtu\.be|youtube\.com\/shorts|facebook\.com\/(watch|video)|fb\.watch|tiktok\.com\/@[^/]+\/video|instagram\.com\/(reel|p|tv))[^\s]*/i;

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

// ===== /clips — INFO & CARA UBAH JUMLAH KLIP (BARU!) =====
bot.command("clips", async (ctx) => {
  const envMax = getMaxClipsConfig();
  const userId = ctx.from?.id?.toString();
  let userMax = envMax;
  if (userId) {
    const rows = await db.select().from(userSettings).where(eq(userSettings.telegramUserId, userId));
    userMax = rows[0]?.maxClips ?? envMax;
  }

  await ctx.reply(
    `✂️ *Konfigurasi Jumlah Klip AutoClip:*\n\n` +
    `Aktif (env \`MAX_CLIPS\`): *${envMax} klip*\n` +
    `Setting akunmu: *${userMax} klip*\n\n` +
    `*Cara Ubah (2 metode):*\n\n` +
    `*1️⃣ Railway Variables (global, semua user):*\n` +
    `  Set variabel \`MAX_CLIPS\` di Railway Dashboard\n` +
    `  Contoh: \`MAX_CLIPS=5\`   5 klip per video\n` +
    `• Rentang valid: \`1\` sampai \`10\`\n` +
    `• Tidak perlu redeploy — langsung berlaku\n\n` +
    `*2️⃣ Per-akun via /settings (tombol di bawah):*\n` +
    `• Tekan tombol jumlah klip yang diinginkan\n` +
    `• Berlaku untuk akun Telegram kamu saja\n\n` +
    `📋 *Semua nilai yang tersedia:*\n` +
    `• 1 klip — cepat, 1 momen terbaik\n` +
    `• 2 klip — standar minimal\n` +
    `• 3 klip — sebelumnya default\n` +
    `• 4 klip — lebih banyak pilihan\n` +
    `• *5 klip — default baru ⭐*\n` +
    `• 6-10 klip — maksimal (butuh lebih lama)\n\n` +
    `💡 ENV var \`MAX_CLIPS\` selalu override setting per-akun.`,
    {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard()
        .text("1️⃣", "set_clips_1")
        .text("2️⃣", "set_clips_2")
        .text("3️⃣", "set_clips_3")
        .text("4️⃣", "set_clips_4")
        .text("5️⃣ ⭐", "set_clips_5")
        .row()
        .text("6 klip", "set_clips_6")
        .text("7 klip", "set_clips_7")
        .text("8 klip", "set_clips_8")
        .text("9 klip", "set_clips_9")
        .text("10 klip", "set_clips_10"),
    }
  );
});

// ===== INFO COMMANDS =====
bot.command("mode", async (ctx) => {
  const currentMode = getAspectRatioMode();
  const modeLabel = getModeLabel(currentMode);
  await ctx.reply(
    `📐 *Mode Aspect Ratio 9:16 Aktif:*\n\n` +
    `Mode: *${modeLabel}* (\`${currentMode}\`)\n\n` +
    `*Semua Mode:*\n` +
    `• \`blur\` → 🌀 Background blur (REKOMENDASI)\n` +
    `• \`crop\` → ✂️ Center crop\n` +
    `• \`pad\` → ⬛ Black bars\n` +
    `• \`stretch\` → ↔️ Stretch paksa\n` +
    `• \`none\` → 📐 Original ratio\n\n` +
    `Ubah: set \`ASPECT_RATIO_MODE=blur\` di Railway Variables`,
    { parse_mode: "Markdown" }
  );
});

bot.command("thumbnail", async (ctx) => {
  const cfg = getThumbnailConfig();
  const modeLabel = getThumbnailModeLabel(cfg.mode);
  await ctx.reply(
    `🖼 *Konfigurasi Thumbnail:*\n\n` +
    `Status: ${cfg.enabled ? "✅ Aktif" : "❌ Nonaktif"}\n` +
    `Mode: *${modeLabel}* (\`${cfg.mode}\`)\n` +
    `Kualitas: ${cfg.quality}/31\n` +
    `Resolusi: ${cfg.width}×${cfg.height === 0 ? "auto" : cfg.height}\n\n` +
    `*Cara Ubah (Railway Variables):*\n` +
    `• \`THUMBNAIL_ENABLED\` = \`true\` / \`false\`\n` +
    `• \`THUMBNAIL_MODE\` = \`middle\` | \`best\` | \`start\` | \`custom\`\n` +
    `• \`THUMBNAIL_QUALITY\` = \`1\` sampai \`31\`\n` +
    `• \`THUMBNAIL_WIDTH\` = lebar (default: 1280)\n` +
    `• \`THUMBNAIL_HEIGHT\` = tinggi (default: 720)\n` +
    `• \`THUMBNAIL_OFFSET_SECONDS\` = detik (untuk mode custom)`,
    { parse_mode: "Markdown" }
  );
});

bot.command("watermark", async (ctx) => {
  const cfg = getWatermarkConfig();
  const posLabel = getWatermarkPositionLabel(cfg.position);
  await ctx.reply(
    `💧 *Konfigurasi Watermark:*\n\n` +
    `Status: ${cfg.enabled ? "✅ Aktif" : "❌ Nonaktif"}\n` +
    `Teks: \`${cfg.text}\`\n` +
    `Posisi: *${posLabel}* (\`${cfg.position}\`)\n` +
    `Font Size: ${cfg.fontSize}px\n` +
    `Warna: ${cfg.color} (opacity: ${cfg.opacity})\n` +
    `Kotak: ${cfg.box ? "✅ Ada" : "❌ Tidak"}\n` +
    (cfg.imagePath ? `Gambar: \`${cfg.imagePath}\`\n` : "") +
    `\n*Cara Ubah (Railway Variables):*\n` +
    `• \`WATERMARK_ENABLED\` = \`true\` / \`false\`\n` +
    `• \`WATERMARK_TEXT\` = \`@NamaChannel\` ← *teks watermark Anda*\n` +
    `• \`WATERMARK_POSITION\` = \`topleft\` | \`topright\` | \`bottomleft\` | \`bottomright\` | \`center\`\n` +
    `• \`WATERMARK_FONT_SIZE\` = ukuran font (default: 32)\n` +
    `• \`WATERMARK_COLOR\` = \`white\` / \`yellow\` / \`#FF0000\`\n` +
    `• \`WATERMARK_OPACITY\` = \`0.0\` sampai \`1.0\` (default: 0.85)\n` +
    `• \`WATERMARK_BOX\` = \`true\` / \`false\` (kotak background)\n` +
    `• \`WATERMARK_BOX_COLOR\` = \`black@0.4\` (transparansi kotak)\n` +
    `• \`WATERMARK_IMAGE_PATH\` = path ke file logo PNG (opsional)\n` +
    `• \`WATERMARK_IMAGE_SCALE\` = \`0.15\` (skala gambar, 0.01-1.0)`,
    { parse_mode: "Markdown" }
  );
});

bot.command("zoom", async (ctx) => {
  const cfg = getZoomEffectConfig();
  const typeLabel = getZoomEffectLabel(cfg.type);
  await ctx.reply(
    `🔍 *Konfigurasi Zoom Effect pada Highlight:*\n\n` +
    `Status: ${cfg.enabled ? "✅ Aktif" : "❌ Nonaktif"}\n` +
    `Mode: \`${cfg.mode}\` (auto/always/never)\n` +
    `Tipe: *${typeLabel}* (\`${cfg.type}\`)\n` +
    `Intensitas: ${cfg.intensity}× (1.0 = tidak zoom, 1.3 = kuat)\n` +
    `Durasi: ${cfg.duration} detik\n` +
    `Min Score (auto): ${cfg.minScore}/10\n\n` +
    `*Cara Ubah (Railway Variables):*\n` +
    `• \`ZOOM_EFFECT_ENABLED\` = \`true\` / \`false\`\n` +
    `• \`ZOOM_EFFECT_MODE\` = \`auto\` | \`always\` | \`never\`\n` +
    `• \`ZOOM_EFFECT_TYPE\` = \`in\` | \`out\` | \`in-out\` | \`pulse\`\n` +
    `• \`ZOOM_EFFECT_INTENSITY\` = \`1.05\` (subtle) sampai \`1.3\` (strong)\n` +
    `• \`ZOOM_EFFECT_DURATION\` = durasi dalam detik (default: 2.0)\n` +
    `• \`ZOOM_EFFECT_MIN_SCORE\` = min viral score 1-10 (default: 7)`,
    { parse_mode: "Markdown" }
  );
});

bot.command("introoutro", async (ctx) => {
  const cfg = getIntroOutroConfig();
  await ctx.reply(
    `🎬 *Konfigurasi Intro / Outro Otomatis:*\n\n` +
    `*INTRO:*\n` +
    `Status: ${cfg.introEnabled ? "✅ Aktif" : "❌ Nonaktif"}\n` +
    (cfg.introVideoPath ? `File: \`${cfg.introVideoPath}\`\n` : `Mode: Auto-generate (${cfg.introDuration}s)\n`) +
    `Teks: \`${cfg.introText}\`\n` +
    `Warna BG: \`${cfg.introColor}\`\n\n` +
    `*OUTRO:*\n` +
    `Status: ${cfg.outroEnabled ? "✅ Aktif" : "❌ Nonaktif"}\n` +
    (cfg.outroVideoPath ? `File: \`${cfg.outroVideoPath}\`\n` : `Mode: Auto-generate (${cfg.outroDuration}s)\n`) +
    `Teks: \`${cfg.outroText}\`\n` +
    `Warna BG: \`${cfg.outroColor}\`\n\n` +
    `*Cara Ubah (Railway Variables):*\n` +
    `• \`INTRO_ENABLED\` = \`true\` / \`false\`\n` +
    `• \`INTRO_VIDEO_PATH\` = path ke file intro.mp4 (opsional)\n` +
    `• \`INTRO_DURATION\` = durasi intro otomatis dalam detik (default: 3)\n` +
    `• \`INTRO_TEXT\` = teks pada intro otomatis\n` +
    `• \`INTRO_COLOR\` = warna background (\`#000000\` = hitam)\n` +
    `• \`OUTRO_ENABLED\` = \`true\` / \`false\`\n` +
    `• \`OUTRO_VIDEO_PATH\` = path ke file outro.mp4 (opsional)\n` +
    `• \`OUTRO_DURATION\` = durasi outro otomatis dalam detik (default: 3)\n` +
    `• \`OUTRO_TEXT\` = teks pada outro (misal: \`Subscribe! 🔔\`)\n` +
    `• \`OUTRO_COLOR\` = warna background outro\n\n` +
    `💡 *Tips:* Jika tidak ada file video, intro/outro akan di-generate otomatis menggunakan FFmpeg dengan teks yang Anda set.`,
    { parse_mode: "Markdown" }
  );
});

// ===== MESSAGE HANDLER =====
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
          .text("🔗 Hubungkan YouTube", "connect"),
      }
    );
    return;
  }
  await handleVideoUrl(ctx, urlMatch[0]);
});

// ===== CALLBACK HANDLERS =====
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

// Updated: support 1–10 clips
bot.callbackQuery(/^set_clips_(\d+)$/, async (ctx) => {
  const userId = ctx.from.id.toString();
  const maxClips = parseInt(ctx.match[1]);
  if (maxClips < 1 || maxClips > 10) {
    await ctx.answerCallbackQuery("❌ Nilai tidak valid (1-10)");
    return;
  }
  await ctx.answerCallbackQuery(`✅ Maksimal klip diset ke ${maxClips}`);
  await db
    .update(userSettings)
    .set({ maxClips, updatedAt: new Date() })
    .where(eq(userSettings.telegramUserId, userId));
  const envMax = getMaxClipsConfig();
  await ctx.editMessageText(
    `✅ Setting akun: Maksimal *${maxClips} klip* per video.\n\n` +
    `💡 Catatan: env var \`MAX_CLIPS=${envMax}\` selalu override setting ini.`,
    { parse_mode: "Markdown" }
  );
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
  const currentMode = getAspectRatioMode();
  const modeLabel = getModeLabel(currentMode);
  const wmCfg = getWatermarkConfig();
  const zoomCfg = getZoomEffectConfig();
  const ioCfg = getIntroOutroConfig();
  const maxClips = getMaxClipsConfig();

  const featureInfo =
    `📐 Mode 9:16: *${modeLabel}*\n` +
    `✂️ AutoClip: *${maxClips} klip* _(ubah: \`MAX_CLIPS\` atau /clips)\n` +
    `💧 Watermark: *${wmCfg.enabled ? `✅ "${wmCfg.text}"` : "❌ Nonaktif"}*\n` +
    `🔍 Zoom Effect: *${zoomCfg.enabled ? `✅ ${zoomCfg.mode} (${zoomCfg.type})` : "❌ Nonaktif"}*\n` +
    `🎬 Intro/Outro: *${ioCfg.introEnabled || ioCfg.outroEnabled ? "✅ Aktif" : "❌ Nonaktif"}*`;

  if (!isConnected) {
    await ctx.reply(
      `${getPlatformEmoji(platform)} *Video terdeteksi!*\n\n` +
      `⚠️ YouTube belum terhubung. Klip akan dikirim ke Telegram saja.\n\n` +
      `${featureInfo}\n\n` +
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
      `${featureInfo}\n\n` +
      `Pilih format output:`,
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard()
          .text(`📱 Vertikal 9:16 (${modeLabel})`, `process_v_${jobId}`)
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
      /* ignore unchanged message errors */
    }
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
        `✅ *Selesai! ${successClips.length} klip berhasil dibuat!*`,
        { parse_mode: "Markdown" }
      );

      for (let i = 0; i < successClips.length; i++) {
        const clip = successClips[i];
        if (!clip.filePath || !fs.existsSync(clip.filePath)) continue;

        const caption = [
          `━━ Klip ${i + 1}/${successClips.length} ━━ `,
          ``,
          `📝 ${clip.title}`,
          ``,
          `⏱ Durasi: ${clip.duration}s`,
          `🔥 Viral Score: ${clip.viralScore}/10`,
          `💡 ${clip.reason}`,
          clip.thumbnailPath ? `🖼 Thumbnail: ✅` : ``,
          clip.youtubeUrl ? `\n🔗 YouTube: ${clip.youtubeUrl}` : ``,
          clip.youtubeUrl ? ` (Tersimpan sebagai Draft di YouTube Studio) ` : ``,
        ]
          .join("\n")
          .trim();

        try {
          if (clip.thumbnailPath && fs.existsSync(clip.thumbnailPath)) {
            await ctx.api.sendPhoto(chatId, new InputFile(clip.thumbnailPath), {
              caption: `🖼 Thumbnail Klip ${i + 1}`,
              parse_mode: "HTML",
            });
          }
          await ctx.api.sendVideo(chatId, new InputFile(clip.filePath!), {
            caption,
            parse_mode: "HTML",
          });
        } catch (err) {
          console.error(`Failed to send clip ${i + 1}:`, err);
          await ctx.api.sendMessage(
            chatId,
            `✅ Klip ${i + 1}: *${clip.title}*${clip.youtubeUrl ? `\n🔗 ${clip.youtubeUrl}` : ""}`,
            { parse_mode: "Markdown" }
          );
        }
      }

      const hasYoutube = successClips.some((c) => c.youtubeUrl);
      const summaryKeyboard = new InlineKeyboard();
      if (hasYoutube) {
        summaryKeyboard
          .url("📺 Buka YouTube Studio", "https://studio.youtube.com/channel/videos/upload")
          .row();
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
            hasThumbnail: !!(c.thumbnailPath && fs.existsSync(c.thumbnailPath)),
          }))
        ),
        { parse_mode: "Markdown", reply_markup: summaryKeyboard }
      );

      // Cleanup after 30s
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
    await ctx.api
      .editMessageText(chatId, statusMessageId, messages.error(errorMsg), {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard().text("🔄 Coba Lagi", `retry_job_${jobId}`),
      })
      .catch(() => {});
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

  const currentMode = getAspectRatioMode();
  const modeLabel = getModeLabel(currentMode);
  const wmCfg = getWatermarkConfig();
  const zoomCfg = getZoomEffectConfig();
  const ioCfg = getIntroOutroConfig();
  const envMaxClips = getMaxClipsConfig();

  const extraInfo =
    `\n\n*Fitur Aktif:*\n` +
    `• Mode 9:16: *${modeLabel}*\n` +
    `• AutoClip: *${envMaxClips} klip* (env \`MAX_CLIPS\`   /clips untuk ubah)\n` +
    `• Watermark: *${wmCfg.enabled ? `"${wmCfg.text}" @ ${wmCfg.position}` : "Nonaktif"}*\n` +
    `• Zoom Effect: *${zoomCfg.enabled ? `${zoomCfg.mode} (${zoomCfg.type})` : "Nonaktif"}*\n` +
    `• Intro: *${ioCfg.introEnabled ? `✅ "${ioCfg.introText}"` : "❌"}* | Outro: *${ioCfg.outroEnabled ? `✅ "${ioCfg.outroText}"` : "❌"}*\n\n` +
    `_Gunakan /clips /watermark /zoom /introoutro /thumbnail /mode untuk info detail_`;

  await ctx.reply(
    messages.settings({
      maxClips: settings.maxClips || envMaxClips,
      minDuration: settings.minDuration || 20,
      maxDuration: settings.maxDuration || 40,
      defaultPrivacy: settings.defaultPrivacy || "private",
      youtubeConnected: tokens.length > 0,
    }) + extraInfo,
    {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard()
        .text("1️⃣ Klip", "set_clips_1")
        .text("2️⃣ Klip", "set_clips_2")
        .text("3️⃣ Klip", "set_clips_3")
        .text("4️⃣ Klip", "set_clips_4")
        .text("5️⃣ Klip ⭐", "set_clips_5")
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

async function ensureUserSettings(userId: string): Promise<void> {
  if (!userId) return;
  const existing = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.telegramUserId, userId));
  if (!existing.length) {
    const envMaxClips = getMaxClipsConfig();
    await db.insert(userSettings).values({
      telegramUserId: userId,
      maxClips: envMaxClips, // Use env var as default for new users
      minDuration: 20,
      maxDuration: 40,
      defaultPrivacy: "private",
      language: "id",
    });
  }
}

bot.catch((err) => {
  console.error("Bot error:", err);
});

export default bot;
export { formatDuration };
