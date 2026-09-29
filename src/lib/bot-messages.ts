// Bot message templates in Indonesian

export const messages = {
  welcome: `🤖 *AutoClip Bot* — Video Clipper Otomatis

Halo! Saya bisa memotong video panjang menjadi klip pendek viral untuk YouTube Shorts secara otomatis!

*Cara Penggunaan:*
1. Kirim link video (YouTube, Facebook, TikTok, Instagram)
2. Bot akan menganalisis dan memilih momen terbaik
3. Video akan dipotong otomatis (20-40 detik)
4. Upload langsung ke YouTube sebagai Draft

*Fitur Baru:*
🖼 Thumbnail auto-generate
💧 Watermark custom
🎬 Intro/Outro otomatis
🔍 Zoom effect pada highlight

*Perintah:*
/start - Menu utama
/help - Panduan lengkap
/connect - Hubungkan YouTube
/settings - Pengaturan bot
/status - Cek status
/history - Riwayat klip
/watermark - Info watermark config
/zoom - Info zoom effect config
/introoutro - Info intro/outro config
/thumbnail - Info thumbnail config
/mode - Info aspect ratio

Kirim link video untuk mulai! 🎬`,

  help: `📚 *Panduan AutoClip Bot*

*Platform yang Didukung:*
• 📺 YouTube (termasuk video panjang)
• 📘 Facebook
• 🎵 TikTok
• 📸 Instagram Reels/Video

*Proses Otomatis:*
1. *Download* - Video diunduh dari platform
2. *Transkripsi* - Audio ditranskripsi ke teks
3. *Analisis AI* - Momen viral diidentifikasi
4. *Pemotongan* - Video dipotong (20-40 detik)
5. *Zoom Effect* - Auto zoom pada highlight moment ✨
6. *Watermark* - Watermark custom ditambahkan ✨
7. *Intro/Outro* - Ditambahkan jika aktif ✨
8. *Thumbnail* - Thumbnail auto-generate ✨
9. *Upload* - Langsung upload ke YouTube Studio

*Format Output 9:16:*
• 🌀 Mode aktif bisa diubah via ASPECT_RATIO_MODE

*Perintah Info Konfigurasi:*
/mode - Info aspect ratio mode
/thumbnail - Info thumbnail config
/watermark - Info watermark config
/zoom - Info zoom effect config
/introoutro - Info intro/outro config

*Ketentuan:*
• Durasi klip: 20-40 detik
• Format output: Vertikal 9:16 (1080x1920)
• Maksimal 3 klip per video

Tips: Video dengan dialog, tips, atau momen emosional menghasilkan klip terbaik!`,

  connecting: `🔗 *Menghubungkan YouTube Studio...*

Klik tombol di bawah untuk login ke akun Google/YouTube Anda.

Izin yang diperlukan:
• Upload video (sebagai Draft)
• Kelola video YouTube

Setelah login, klip akan otomatis tersimpan sebagai Draft di YouTube Studio.`,

  error: (msg: string) => `❌ *Terjadi Kesalahan*

${msg}

Coba lagi atau hubungi /help untuk bantuan.`,

  invalidUrl: `❌ *URL Tidak Valid*

Kirim link video yang valid dari:
• YouTube (youtube.com/watch?v=... atau youtu.be/...)
• Facebook (facebook.com/watch/...)
• TikTok (tiktok.com/@.../video/...)
• Instagram (instagram.com/reel/...)`,

  settings: (s: {
    maxClips: number;
    minDuration: number;
    maxDuration: number;
    defaultPrivacy: string;
    youtubeConnected: boolean;
  }) =>
    `⚙️ *Pengaturan Bot*

• Maksimal Klip: ${s.maxClips}
• Durasi Min: ${s.minDuration} detik
• Durasi Max: ${s.maxDuration} detik
• Privacy Default: ${s.defaultPrivacy}
• YouTube: ${s.youtubeConnected ? "✅ Terhubung" : "❌ Belum terhubung"}`,

  resultSummary: (
    clips: {
      title: string;
      duration: number;
      youtubeUrl?: string;
      viralScore: number;
      hasThumbnail?: boolean;
      hasZoom?: boolean;
      hasWatermark?: boolean;
    }[]
  ) => {
    let msg = `🎉 *Proses Selesai!*\n\n`;
    msg += `Berhasil membuat ${clips.length} klip YouTube Shorts:\n\n`;
    clips.forEach((clip, i) => {
      msg += `*Klip ${i + 1}:* ${clip.title.slice(0, 50)}\n`;
      msg += `⏱ Durasi: ${clip.duration}s | 🔥 Viral Score: ${clip.viralScore}/10`;
      if (clip.hasThumbnail) msg += ` | 🖼✅`;
      if (clip.hasZoom) msg += ` | 🔍✅`;
      if (clip.hasWatermark) msg += ` | 💧✅`;
      msg += `\n`;
      if (clip.youtubeUrl) msg += `🔗 ${clip.youtubeUrl}\n`;
      msg += "\n";
    });
    msg += `📺 Cek YouTube Studio untuk melihat Draft!`;
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

export function createProgressBar(percent: number, length: number = 10): string {
  const filled = Math.round((percent / 100) * length);
  const empty = length - filled;
  return `[${"█".repeat(filled)}${"░".repeat(empty)}]`;
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}
