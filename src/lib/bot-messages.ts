// Bot message templates in Indonesian

export const messages = {
  welcome: `🤖 *AutoClip Bot* — AI Video Clipper

Halo\\! Saya memotong video panjang menjadi klip pendek viral secara otomatis, lalu upload ke *YouTube* dan *TikTok*\\!

*Cara Penggunaan:*
1\\. Kirim link video \\(YouTube, Facebook, TikTok, Instagram\\)
2\\. Bot analisis & pilih momen terbaik dengan AI
3\\. Video dipotong otomatis \\(20\\-40 detik, 9:16\\)
4\\. Upload langsung ke YouTube Draft & TikTok Inbox

*Perintah:*
/start \\- Menu utama
/help \\- Panduan lengkap
/connect \\- Hubungkan YouTube
/connect\\_tiktok \\- Hubungkan TikTok
/settings \\- Pengaturan bot
/status \\- Status pekerjaan terbaru
/history \\- Riwayat klip
/disconnect \\- Putus YouTube
/disconnect\\_tiktok \\- Putus TikTok

Kirim link video untuk mulai\\! 🎬`,

  help: `📚 *Panduan AutoClip Bot*

*Platform yang Didukung:*
• 📺 YouTube \\(termasuk video panjang\\)
• 📘 Facebook
• 🎵 TikTok
• 📸 Instagram Reels/Video

*Proses Otomatis:*
1\\. *Download* — Video diunduh dari platform
2\\. *Transkripsi* — Audio ditranskripsi ke teks
3\\. *Analisis AI* — Momen viral diidentifikasi
4\\. *Pemotongan* — Video dipotong \\(20\\-40 detik\\)
5\\. *Upload* — Langsung ke YouTube Studio & TikTok

*Ketentuan:*
• Durasi klip: 20\\-40 detik \\(optimal untuk Shorts\\)
• Format output: Vertikal 9:16 \\(1080x1920\\)
• Maksimal 3 klip per video

*Perintah Berguna:*
/connect \\- Login YouTube Studio
/connect\\_tiktok \\- Login TikTok
/settings \\- Ubah pengaturan
/cancel \\- Batalkan proses

*Tips:*
Video dengan dialog, tips, atau momen emosional menghasilkan klip terbaik\\!`,

  connecting: `🔗 *Menghubungkan YouTube Studio\\.\\.\\.*

Klik tombol di bawah untuk login ke akun Google/YouTube Anda\\.

Izin yang diperlukan:
• Upload video \\(sebagai Draft\\)
• Kelola video YouTube

Setelah login, klip akan otomatis tersimpan sebagai Draft di YouTube Studio\\.`,

  connectingTikTok: `🎵 *Menghubungkan TikTok\\.\\.\\.*

Klik tombol di bawah untuk login ke akun TikTok Anda\\.

Izin yang diperlukan:
• Upload video ke TikTok Inbox
• Info akun dasar

Setelah login, klip akan otomatis dikirim ke TikTok Inbox Anda\\.
📌 Buka TikTok → notifikasi → tap *Post* untuk publish\\.`,

  processing: (url: string, platform: string) =>
    `⚙️ *Memproses Video\\.\\.\\.*\n\n🔗 URL: \`${url.slice(0, 50)}${url.length > 50 ? "..." : ""}\`\n📱 Platform: ${getPlatformEmoji(platform)} ${platform.toUpperCase()}\n\nStatus: Menunggu dalam antrian\\.\\.\\.`,

  error: (msg: string) =>
    `❌ *Terjadi Kesalahan*\n\n${msg}\n\nCoba lagi atau hubungi /help untuk bantuan\\.`,

  settings: (s: {
    maxClips: number;
    minDuration: number;
    maxDuration: number;
    defaultPrivacy: string;
    youtubeConnected: boolean;
    tiktokConnected: boolean;
    tiktokPrivacy: string;
    tiktokAutoUpload: boolean;
  }) =>
    `⚙️ *Pengaturan Bot*\n\n` +
    `• Maksimal Klip: ${s.maxClips}\n` +
    `• Durasi Min: ${s.minDuration} detik\n` +
    `• Durasi Max: ${s.maxDuration} detik\n\n` +
    `*YouTube:*\n` +
    `• Status: ${s.youtubeConnected ? "✅ Terhubung" : "❌ Belum terhubung"}\n` +
    `• Privacy: ${s.defaultPrivacy}\n\n` +
    `*TikTok:*\n` +
    `• Status: ${s.tiktokConnected ? "✅ Terhubung" : "❌ Belum terhubung"}\n` +
    `• Privacy: ${s.tiktokPrivacy}\n` +
    `• Auto Upload: ${s.tiktokAutoUpload ? "✅ Aktif" : "❌ Nonaktif"}\n\n` +
    `Gunakan tombol di bawah untuk mengubah pengaturan:`,

  connected: `✅ *YouTube Berhasil Terhubung\\!*\n\nAkun YouTube Anda sudah terhubung dengan bot\\. Klip video akan otomatis diupload sebagai Draft di YouTube Studio\\.\n\nKirim link video untuk mulai membuat Shorts\\! 🎬`,

  connectedTikTok: `✅ *TikTok Berhasil Terhubung\\!*\n\nAkun TikTok Anda sudah terhubung dengan bot\\. Klip video akan otomatis dikirim ke TikTok Inbox Anda\\.\n\n📌 Buka TikTok → notifikasi → tap *Post* untuk publish\\.\n\nKirim link video untuk mulai\\! 🎬`,

  invalidUrl: `❌ *URL Tidak Valid*\n\nKirim link video yang valid dari:\n• YouTube \\(youtube\\.com/watch\\?v=\\.\\.\\. atau youtu\\.be/\\.\\.\\.\\)\n• Facebook \\(facebook\\.com/watch/\\.\\.\\.\\)\n• TikTok \\(tiktok\\.com/@\\.\\.\\.\\)\n• Instagram \\(instagram\\.com/reel/\\.\\.\\.\\)`,

  resultSummary: (
    clips: {
      title: string;
      duration: number;
      youtubeUrl?: string;
      tiktokPublishId?: string;
      viralScore: number;
    }[]
  ) => {
    let msg = `🎉 *Proses Selesai\\!*\n\nBerhasil membuat ${clips.length} klip:\n\n`;
    clips.forEach((clip, i) => {
      msg += `*Klip ${i + 1}:* ${clip.title.slice(0, 50)}\n`;
      msg += `⏱ Durasi: ${clip.duration}s | 🔥 Viral Score: ${clip.viralScore}/10\n`;
      if (clip.youtubeUrl) msg += `📺 YouTube: ${clip.youtubeUrl}\n`;
      if (clip.tiktokPublishId)
        msg += `🎵 TikTok: Tersimpan di Inbox \\(buka app untuk publish\\)\n`;
      msg += "\n";
    });
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
