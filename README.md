# 🤖 AutoClip Bot — AI YouTube Shorts Generator

> Bot Telegram cerdas yang secara otomatis memotong video panjang menjadi klip viral untuk YouTube Shorts (durasi klip bisa dipilih: 15/20/30/40/60 detik), lalu auto-upload ke YouTube Studio sebagai Draft.

[![Live Demo](https://img.shields.io/badge/demo-online-brightgreen)](https://cawik-clipper.up.railway.app/)
[![Deployed on Railway](https://img.shields.io/badge/deployed%20on-Railway-black)](https://cawik-clipper.up.railway.app/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](#-license)

🔗 **Repository:** [github.com/cawik10/clipper](https://github.com/cawik10/clipper)
🌐 **Live Dashboard:** [cawik-clipper.up.railway.app](https://cawik-clipper.up.railway.app/)

---

## 📖 Tentang Proyek

**AutoClip Bot** adalah aplikasi web + bot Telegram yang mengotomasi proses pembuatan klip pendek (Shorts/Reels/TikTok) dari video panjang. Cukup kirim link video (YouTube, Facebook, TikTok, atau Instagram) ke bot Telegram, dan sistem akan:

1. ⬇️ Mengunduh video menggunakan `yt-dlp`
2. 🎙️ Mentranskripsi audio menggunakan Whisper (OpenAI/Groq)
3. 🧠 Menganalisis momen paling viral menggunakan AI (GPT-4o / Gemini)
4. ✂️ Memotong video menjadi beberapa klip format 9:16 menggunakan FFmpeg
5. 📤 Mengunggah hasil klip ke YouTube Studio sebagai Draft (opsional ke Google Drive)
6. 📱 Mengirimkan hasil klip beserta laporan progres real-time langsung ke chat Telegram

Dashboard web menampilkan statistik job, konfigurasi fitur (jumlah klip, durasi klip, watermark, zoom effect, intro/outro, thumbnail, aspect ratio), serta daftar job terbaru yang telah diproses.

---

## ✨ Fitur Utama

| Fitur | Deskripsi |
| --- | --- |
| 🎬 **Multi-Platform** | Mendukung YouTube, Facebook, TikTok, dan Instagram |
| 🧠 **AI Analysis** | GPT-4o / Gemini memilih momen paling viral secara otomatis |
| 🎙️ **Transkripsi** | OpenAI Whisper / Groq untuk transkripsi audio yang akurat |
| ✂️ **Auto Clip** | FFmpeg memotong video dengan durasi yang bisa dipilih (15/20/30/40/60 detik), format 9:16 |
| 📤 **Auto Upload** | Upload langsung ke YouTube Studio sebagai Draft |
| ☁️ **Google Drive** | Auto-upload klip & thumbnail ke Google Drive milik user |
| 💧 **Watermark Custom** | Teks atau logo pada setiap klip, posisi & gaya dapat diatur |
| 🔍 **Zoom Effect** | Efek zoom otomatis pada momen dengan viral score tinggi |
| 🎬 **Intro/Outro** | Tambahan intro & outro otomatis di setiap klip |
| 🖼 **Thumbnail Generator** | Generate thumbnail otomatis dari frame klip |
| 📐 **Aspect Ratio 9:16** | Mode blur background, center crop, black bars, stretch, atau original |
| 🔥 **Viral Score** | Rating 1–10 untuk setiap klip hasil analisis AI |
| ⚡ **Realtime Progress** | Update status step-by-step secara real-time di Telegram |
| 🔒 **Privacy** | Draft upload bersifat private secara default |

---

## 🖥️ Live Demo

Dashboard web (statistik job & konfigurasi fitur) dapat diakses di:

👉 **https://cawik-clipper.up.railway.app/**

Dashboard menampilkan:
- Total job, job selesai, jumlah pengguna, klip & thumbnail yang dibuat
- Konfigurasi aktif: jumlah klip (`MAX_CLIPS`), durasi klip (`CLIP_DURATION`), watermark, zoom effect, intro/outro, thumbnail, dan aspect ratio
- Alur proses lengkap dari download hingga upload
- Daftar perintah bot Telegram
- Riwayat job terbaru beserta statusnya

---

## 🏗️ Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Bot SDK:** Grammy.js (Telegram Bot)
- **Database:** PostgreSQL + Drizzle ORM
- **Video Download:** yt-dlp
- **Video Processing:** FFmpeg
- **AI Analysis:** OpenAI GPT-4o-mini / Google Gemini
- **Transkripsi:** OpenAI Whisper / Groq Whisper
- **YouTube & Drive API:** Google APIs (`googleapis`)
- **Hosting:** Railway (Docker, mendukung FFmpeg & yt-dlp secara native)

---

## 🚀 Quick Start (Local Development)

### 1. Clone & Install

```bash
git clone https://github.com/cawik10/clipper.git
cd clipper
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

### 5. Jalankan Development Server

```bash
npm run dev
```

### 6. Setup Telegram Webhook

```bash
curl "https://<domain-deploy-anda>/api/webhook/setup?secret=setup-autoclip-2024"
```

---

## 📋 Environment Variables (Ringkasan)

| Variable | Wajib | Deskripsi |
| --- | --- | --- |
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `TELEGRAM_BOT_TOKEN` | ✅ | Token dari @BotFather |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | 🔶 | Untuk upload YouTube & Google Drive |
| `OPENAI_API_KEY` / `GEMINI_API_KEY` / `GROQ_API_KEY` | ⚪ | AI analysis & transkripsi |
| `MAX_CLIPS` | ⚪ | Jumlah klip per video (1–10, default `5`) |
| `CLIP_DURATION` | ⚪ | Durasi klip tetap: `15`, `20`, `30`, `40`, atau `60` detik (default `30`) |
| `WATERMARK_ENABLED` / `WATERMARK_TEXT` / `WATERMARK_POSITION` | ⚪ | Pengaturan watermark klip |
| `ZOOM_EFFECT_ENABLED` / `ZOOM_EFFECT_MODE` / `ZOOM_EFFECT_TYPE` | ⚪ | Pengaturan efek zoom otomatis |
| `INTRO_ENABLED` / `OUTRO_ENABLED` | ⚪ | Pengaturan intro & outro otomatis |
| `THUMBNAIL_ENABLED` / `THUMBNAIL_MODE` | ⚪ | Pengaturan thumbnail otomatis |
| `ASPECT_RATIO_MODE` | ⚪ | `blur` \| `crop` \| `pad` \| `stretch` \| `none` (default `blur`) |
| `GOOGLE_DRIVE_ENABLED` / `GOOGLE_DRIVE_FOLDER_ID` | ⚪ | Pengaturan auto-upload Google Drive |

> ✅ Wajib | 🔶 Wajib untuk fitur upload YouTube/Drive | ⚪ Opsional (ada nilai default)
>
> Daftar lengkap environment variables tersedia di file `.env.example` dan pada dashboard aplikasi.

---

## 🤖 Perintah Bot Telegram

```
/start            - Menu utama
/help             - Panduan lengkap
/connect          - Hubungkan YouTube Studio
/settings         - Pengaturan bot
/clips            - Info & ubah jumlah klip (1-10, default 5)
/duration         - Info & ubah durasi klip (15/20/30/40/60 detik, default 30)
/status           - Status job terbaru
/history          - Riwayat semua job
/mode             - Info & ubah ASPECT_RATIO_MODE
/thumbnail        - Info & ubah konfigurasi thumbnail
/watermark        - Info & ubah konfigurasi watermark
/zoom             - Info & ubah konfigurasi zoom effect
/introoutro       - Info & ubah konfigurasi intro/outro
/drive            - Google Drive: status, hubungkan, ganti akun
/drivefolder      - Ganti folder tujuan Drive (link / reset)
/driveon /driveoff - Nyalakan / matikan auto-upload Drive
/cancel           - Batalkan proses
```

---

## 📱 Cara Penggunaan

1. Buka bot Telegram milik Anda
2. Kirim `/connect` untuk menghubungkan akun YouTube Studio
3. Kirim link video (YouTube/Facebook/TikTok/Instagram)
4. Bot akan otomatis: download → transkripsi → analisis AI → potong klip → upload
5. Terima klip video beserta link YouTube Studio langsung di Telegram!

---

## 🚂 Deployment

Proyek ini sudah **live di Railway**: **https://cawik-clipper.up.railway.app/**

Railway dipilih karena mendukung `ffmpeg` dan `yt-dlp` melalui custom Dockerfile, yang tidak didukung penuh oleh platform serverless seperti Vercel.

```dockerfile
FROM node:20-alpine AS base
RUN apk add --no-cache ffmpeg python3 py3-pip curl ca-certificates
RUN pip3 install yt-dlp --break-system-packages || pip3 install yt-dlp

FROM base AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM base AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
RUN mkdir -p /tmp/autoclip
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1
CMD ["node", "server.js"]
```

Setelah deploy, jalankan setup webhook Telegram:

```bash
curl "https://cawik-clipper.up.railway.app/api/webhook/setup?secret=<SETUP_SECRET>"
```

---

## 📊 API Endpoints

| Endpoint | Method | Deskripsi |
| --- | --- | --- |
| `/api/health` | GET | System health check |
| `/api/telegram/webhook` | POST | Telegram webhook receiver |
| `/api/youtube/callback` | GET | Google OAuth callback |
| `/api/webhook/setup` | GET | Setup Telegram webhook |

---

## 📝 License

MIT License — Bebas digunakan dan dimodifikasi.

---

Made with ❤️ using Next.js, Grammy.js, FFmpeg & OpenAI.
