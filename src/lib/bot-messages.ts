// Bot message templates in Indonesian
import { getMaxClipsConfig } from "@/lib/video-config";

export const messages = {
  welcome: `🤖 *AutoClip Bot* — Video Clipper Otomatis

Halo\\! Saya bisa memotong video panjang menjadi klip pendek viral untuk YouTube Shorts secara otomatis\\!

*Cara Penggunaan:*
1\\. Kirim link video \\(YouTube, Facebook, TikTok, Instagram\\)
2\\. Bot akan menganalisis dan memilih momen terbaik
3\\. Video akan dipotong otomatis \\(20\\-40 detik\\)
4\\. Upload langsung ke YouTube sebagai Draft

*Fitur Unggulan:*
✂️ AutoClip — hingga 5 klip per video
🖼 Thumbnail auto\\-generate
💧 Watermark custom
🎬 Intro/Outro otomatis
🔍 Zoom effect pada highlight

*Perintah:*
/start \\- Menu utama
/settings \\- ⚙️ Pengaturan per\\-akun \\(BARU\\!\\)
/connect \\- Hubungkan YouTube
/help \\- Panduan lengkap
/status \\- Cek status
/history \\- Riwayat klip

Kirim link video untuk mulai\\! 🎬`,

  help: `📚 *Panduan AutoClip Bot*

*Platform yang Didukung:*
• 📺 YouTube
• 📘 Facebook
• 🎵 TikTok
• 📸 Instagram Reels/Video

*Proses Otomatis:*
1\\. *Download* \\- Video diunduh dari platform
2\\. *Transkripsi* \\- Audio ditranskripsi ke teks
3\\. *Analisis AI* \\- Momen viral diidentifikasi
4\\. *Pemotongan* \\- Video dipotong \\(20\\-40 detik\\)
5\\. *Zoom Effect* \\- Auto zoom pada highlight moment ✨
6\\. *Watermark* \\- Watermark custom ditambahkan ✨
7\\. *Intro/Outro* \\- Ditambahkan jika aktif ✨
8\\. *Thumbnail* \\- Thumbnail auto\\-generate ✨
9\\. *Upload* \\- Langsung upload ke YouTube Studio

*Semua setting bisa diatur via /settings per akun Telegram\\!*`,

  connecting: `🔗 *Menghubungkan YouTube Studio...*

Klik tombol di bawah untuk login ke akun Google/YouTube Anda\\.

Izin yang diperlukan:
• Upload video \\(sebagai Draft\\)
• Kelola video YouTube

Setelah login, klip akan otomatis tersimpan sebagai Draft di YouTube Studio\\.`,

  error: (msg: string) =>
    `❌ *Terjadi Kesalahan*\n\n${msg}\n\nCoba lagi atau hubungi /help untuk bantuan.`,

  invalidUrl: `❌ *URL Tidak Valid*

Kirim link video yang valid dari:
• YouTube \\(youtube\\.com/watch?v=\\.\\.\\. atau youtu\\.be/\\.\\.\\.\\)
• Facebook \\(facebook\\.com/watch/\\.\\.\\.\\)
• TikTok \\(tiktok\\.com/@\\.\\.\\./video/\\.\\.\\.\\)
• Instagram \\(instagram\\.com/reel/\\.\\.\\.\\)`,

  settings: (s: {
    maxClips: number;
    minDuration: number;
    maxDuration: number;
    defaultPrivacy: string;
    youtubeConnected: boolean;
    watermarkText: string;
    watermarkEnabled: boolean;
    aspectRatioMode: string;
    zoomEnabled: boolean;
    introEnabled: boolean;
    outroEnabled: boolean;
  }) =>
    `⚙️ *Pengaturan Akun Anda*\n\n` +
    `🆔 *Klip & Durasi:*\n` +
    `• Maksimal Klip: *${s.maxClips}* klip\n` +
    `• Durasi: ${s.minDuration}\\-${s.maxDuration} detik\n` +
    `• Privacy Default: *${s.defaultPrivacy}*\n\n` +
    `📐 *Mode Aspect Ratio:* ${s.aspectRatioMode}\n` +
    `💧 *Watermark:* ${s.watermarkEnabled ? `✅ "${s.watermarkText}"` : "❌ Nonaktif"}\n` +
    `🔍 *Zoom Effect:* ${s.zoomEnabled ? "✅ Aktif" : "❌ Nonaktif"}\n` +
    `🎬 *Intro:* ${s.introEnabled ? "✅" : "❌"} | *Outro:* ${s.outroEnabled ? "✅" : "❌"}\n` +
    `📺 *YouTube:* ${s.youtubeConnected ? "✅ Terhubung" : "❌ Belum terhubung"}`,

  resultSummary: (
    clips: {
      title: string;
      duration: number;
      youtubeUrl?: string;
      viralScore: number;
      hasThumbnail?: boolean;
    }[]
  ) => {
    let msg = `🎉 *Proses Selesai\\!*\n\n`;
    msg += `Berhasil membuat ${clips.length} klip YouTube Shorts:\n\n`;
    clips.forEach((clip, i) => {
      msg += `*Klip ${i + 1}:* ${clip.title.slice(0, 50)}\n`;
      msg += `⏱ Durasi: ${clip.duration}s | 🔥 Viral Score: ${clip.viralScore}/10`;
      if (clip.hasThumbnail) msg += ` | 🖼✅`;
      msg += `\n`;
      if (clip.youtubeUrl) msg += `🔗 ${clip.youtubeUrl}\n`;
      msg += "\n";
    });
    msg += `📺 Cek YouTube Studio untuk melihat Draft\\!`;
    return msg;
  },
};

export function getPlatformEmoji(platform: string): string {
  const emojis: Record<string, string> = {
    youtube: "📺",
    facebook: "📘",
    tiktok: "🎵",
    instagram: "📸",
    twitter: "🐦",
    unknown: "🌐",
  };
  return emojis[platform.toLowerCase()] || "🌐";
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

export { getMaxClipsConfig };
