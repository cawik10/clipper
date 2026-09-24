# 🤖 AutoClip Bot — AI YouTube Shorts Generator

> Bot Telegram cerdas yang secara otomatis memotong video panjang menjadi klip viral 20-40 detik untuk YouTube Shorts, lalu auto-upload ke YouTube Studio sebagai Draft.

![AutoClip Bot](./public/images/hero-bg.jpg)

## ✨ Fitur Utama

| Fitur | Deskripsi |
|-------|-----------|
| 🎬 **Multi-Platform** | YouTube, Facebook, TikTok, Instagram |
| 🧠 **AI Analysis** | GPT-4o / Gemini memilih momen viral terbaik |
| 🎙️ **Transkripsi** | OpenAI Whisper / Groq untuk transkripsi akurat |
| ✂️ **Auto Clip** | FFmpeg memotong video 20-40 detik, format 9:16 |
| 📤 **Auto Upload** | Upload langsung ke YouTube Studio sebagai Draft |
| 🔥 **Viral Score** | Rating 1-10 untuk setiap klip |
| ⚡ **Realtime** | Update status real-time di Telegram |
| 🔒 **Privacy** | Draft private by default |

## 🚀 Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/yourname/autoclip-bot.git
cd autoclip-bot
npm install
```

### 2. Setup Environment Variables

```bash
cp .env.example .env
# Edit .env dengan kredensial Anda
```

### 3. Install System Dependencies

```bash
# yt-dlp (video downloader)
pip3 install yt-dlp
# atau
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
  -o /usr/local/bin/yt-dlp && chmod +x /usr/local/bin/yt-dlp

# FFmpeg (video processor)
# Ubuntu/Debian:
apt-get install -y ffmpeg
# macOS:
brew install ffmpeg
```

### 4. Setup Database

```bash
npx drizzle-kit push
```

### 5. Run Development

```bash
npm run dev
```

### 6. Setup Telegram Webhook

```bash
# Setelah deploy, jalankan:
curl "https://yourapp.vercel.app/api/webhook/setup?secret=setup-autoclip-2024"
```

## 📋 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL URL |
| `TELEGRAM_BOT_TOKEN` | ✅ | Token dari @BotFather |
| `GOOGLE_CLIENT_ID` | 🔶 | Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | 🔶 | Google OAuth Client Secret |
| `GOOGLE_REDIRECT_URI` | 🔶 | `https://yourapp.vercel.app/api/youtube/callback` |
| `OPENAI_API_KEY` | ⚪ | GPT-4o + Whisper transcription |
| `GEMINI_API_KEY` | ⚪ | Gemini AI (alternatif OpenAI) |
| `GROQ_API_KEY` | ⚪ | Groq Whisper (gratis, cepat) |
| `NEXT_PUBLIC_APP_URL` | ⚪ | URL aplikasi Anda |

> ✅ Required | 🔶 Required for YouTube upload | ⚪ Optional (ada fallback)

## 🔧 Google OAuth Setup (untuk YouTube Upload)

1. Buka [Google Cloud Console](https://console.cloud.google.com)
2. Buat project baru
3. Enable **YouTube Data API v3**
4. Buat **OAuth 2.0 Client ID** (Web Application)
5. Tambahkan redirect URI: `https://yourapp.vercel.app/api/youtube/callback`
6. Copy Client ID dan Client Secret ke `.env`

## 🤖 Telegram Bot Commands

```
/start    - Menu utama
/help     - Panduan lengkap
/connect  - Hubungkan YouTube Studio
/settings - Pengaturan bot
/status   - Status job terbaru
/history  - Riwayat semua job
/cancel   - Batalkan proses
```

## 📱 Cara Penggunaan

1. Buka bot di Telegram: `@your_bot`
2. Kirim `/connect` untuk hubungkan YouTube Studio
3. Kirim link video (YouTube/Facebook/TikTok/Instagram)
4. Bot akan:
   - ⬇️ Download video
   - 🎙️ Transkripsi audio
   - 🧠 Analisis momen viral (AI)
   - ✂️ Potong video 20-40 detik
   - 📤 Upload ke YouTube Studio sebagai Draft
5. Terima klip video + link YouTube Studio di Telegram!

## 🌐 Deploy ke Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yourname/autoclip-bot)

```bash
# Install Vercel CLI
npm i -g vercel

# Login & deploy
vercel login
vercel deploy --prod
```

⚠️ **Catatan:** Vercel Serverless Functions tidak support `ffmpeg` langsung. Untuk video processing penuh:
- Gunakan **Railway** atau **Render** (support custom buildpacks)
- Atau deploy ke **VPS** (DigitalOcean, Hetzner, dll)

## 🚂 Deploy ke Railway (Recommended)

Railway mendukung `ffmpeg` dan `yt-dlp` via custom Dockerfile:

```dockerfile
FROM node:20-alpine
RUN apk add --no-cache ffmpeg python3 py3-pip
RUN pip3 install yt-dlp
WORKDIR /app
COPY . .
RUN npm ci
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

## 🏗️ Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Bot SDK:** Grammy.js
- **Database:** PostgreSQL + Drizzle ORM
- **Video Download:** yt-dlp
- **Video Processing:** FFmpeg
- **AI Analysis:** OpenAI GPT-4o-mini / Google Gemini
- **Transcription:** OpenAI Whisper / Groq Whisper
- **YouTube API:** Google APIs (googleapis)
- **Deploy:** Vercel / Railway / VPS

## 📊 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | System health check |
| `/api/telegram/webhook` | POST | Telegram webhook receiver |
| `/api/youtube/callback` | GET | Google OAuth callback |
| `/api/webhook/setup` | GET | Setup Telegram webhook |

## 📝 License

MIT License — Free to use and modify.

---

Made with ❤️ using Next.js, Grammy.js, FFmpeg & OpenAI
