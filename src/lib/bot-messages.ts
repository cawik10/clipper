// Bot message templates in Indonesian

export const messages = {
  welcome: `🤖 *AutoClip Bot* - Video Clipper Otomatis

Halo! Saya bisa memotong video panjang menjadi klip pendek viral untuk YouTube Shorts secara otomatis!

*Cara Penggunaan:*
1. Kirim link video (YouTube, Facebook, TikTok, Instagram)
2. Bot akan menganalisis dan memilih momen terbaik
3. Video akan dipotong otomatis (20-40 detik)
4. Upload langsung ke YouTube sebagai Draft

*Perintah:*
/start - Menu utama
/help - Panduan lengkap
/connect - Hubungkan akun YouTube
/status - Cek status pekerjaan
/settings - Pengaturan bot
/history - Riwayat klip

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
5. *Upload* - Langsung upload ke YouTube Studio

*Ketentuan:*
• Durasi klip: 20-40 detik (optimal untuk Shorts)
• Format output: Vertikal 9:16 (1080x1920)
• Maksimal 3 klip per video

*Perintah Berguna:*
/connect - Login YouTube Studio
/settings - Ubah pengaturan
/cancel - Batalkan proses

*Tips:*
Video dengan dialog, tips, atau momen emosional menghasilkan klip terbaik!`,

  connecting: `🔗 *Menghubungkan YouTube Studio...*

Klik tombol di bawah untuk login ke akun Google/YouTube Anda.
Izin yang diperlukan:
• Upload video (sebagai Draft)
• Kelola video YouTube

Setelah login, klip akan otomatis tersimpan sebagai Draft di YouTube Studio.`,

  processing: (url: string, platform: string) => 
    `⚙️ *Memproses Video...*
    
🔗 URL: \`${url.slice(0, 50)}${url.length > 50 ? '...' : ''}\`
📱 Platform: ${getPlatformEmoji(platform)} ${platform.toUpperCase()}

Status: Menunggu dalam antrian...`,

  downloading: (progress: number) =>
    `⬇️ *Mengunduh Video...*
    
Progress: ${createProgressBar(progress)} ${progress.toFixed(0)}%`,

  analyzing: `🧠 *Menganalisis Video dengan AI...*
    
Sedang mencari momen terbaik yang berpotensi viral...
Ini mungkin membutuhkan waktu 1-2 menit.`,

  clipping: (current: number, total: number) =>
    `✂️ *Memotong Video...*
    
Memproses klip ${current}/${total}
${createProgressBar((current / total) * 100)}`,

  uploading: (current: number, total: number) =>
    `📤 *Mengupload ke YouTube Studio...*
    
Mengupload klip ${current}/${total} sebagai Draft...`,

  clipFound: (clips: number) =>
    `🎯 *${clips} Momen Viral Ditemukan!*
    
AI berhasil mengidentifikasi ${clips} klip terbaik.
Sedang memotong dan memproses video...`,

  noClips: `❌ *Tidak Ada Klip yang Ditemukan*
    
Maaf, AI tidak dapat menemukan momen yang cocok.
Coba dengan video yang memiliki lebih banyak dialog atau momen yang jelas.`,

  error: (msg: string) =>
    `❌ *Terjadi Kesalahan*
    
${msg}
    
Coba lagi atau hubungi /help untuk bantuan.`,

  notConnected: `⚠️ *YouTube Belum Terhubung*
    
Anda perlu menghubungkan akun YouTube terlebih dahulu.
Gunakan /connect untuk login ke YouTube Studio.

Klip tetap akan dibuat dan dikirim ke Telegram!`,

  settings: (settings: {
    maxClips: number;
    minDuration: number;
    maxDuration: number;
    defaultPrivacy: string;
    youtubeConnected: boolean;
  }) => `⚙️ *Pengaturan Bot*

• Maksimal Klip: ${settings.maxClips}
• Durasi Min: ${settings.minDuration} detik
• Durasi Max: ${settings.maxDuration} detik
• Privacy Default: ${settings.defaultPrivacy}
• YouTube: ${settings.youtubeConnected ? '✅ Terhubung' : '❌ Belum terhubung'}

Gunakan tombol di bawah untuk mengubah pengaturan:`,

  connected: `✅ *YouTube Berhasil Terhubung!*
    
Akun YouTube Anda sudah terhubung dengan bot.
Klip video akan otomatis diupload sebagai Draft di YouTube Studio.

Kirim link video untuk mulai membuat Shorts! 🎬`,

  invalidUrl: `❌ *URL Tidak Valid*
    
Kirim link video yang valid dari:
• YouTube (youtube.com/watch?v=... atau youtu.be/...)
• Facebook (facebook.com/watch/...)
• TikTok (tiktok.com/@.../video/...)
• Instagram (instagram.com/reel/...)`,

  tooShort: (duration: number) =>
    `⚠️ *Video Terlalu Pendek*
    
Durasi video: ${Math.round(duration)} detik
Minimal durasi yang disarankan: 60 detik

Video terlalu pendek untuk menghasilkan klip yang optimal.`,

  resultSummary: (clips: { title: string; duration: number; youtubeUrl?: string; viralScore: number }[]) => {
    let msg = `🎉 *Proses Selesai!*\n\n`;
    msg += `Berhasil membuat ${clips.length} klip YouTube Shorts:\n\n`;
    
    clips.forEach((clip, i) => {
      msg += `*Klip ${i + 1}:* ${clip.title.slice(0, 50)}\n`;
      msg += `⏱ Durasi: ${clip.duration}s | 🔥 Viral Score: ${clip.viralScore}/10\n`;
      if (clip.youtubeUrl) {
        msg += `🔗 ${clip.youtubeUrl}\n`;
      }
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
