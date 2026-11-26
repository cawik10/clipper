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
| 💬 **Subtitle / Caption Burn-In** | Caption burned-in dari transkripsi Whisper (timestamp per kata): `karaoke`, `word-highlight`, `simple`, `alex-hormozi` |
| 🪝 **AI Hook Overlay** | AI membuat teks hook di 1-2 detik pertama klip (`HOOK_*`), dirender via FFmpeg `drawtext`; style `bold-center` / `top-bar` / `split` |
| 💬 **Auto-First Comment** | AI membuat 1 kalimat komentar pancingan per klip; setelah upload, bot memposting otomatis via `commentThreads.insert` (`YOUTUBE_AUTO_COMMENT_*`) |
| 🛡️ **Source Credit & Copyright Guard** | Kredit sumber otomatis di deskripsi, whitelist channel, batas klip per video sumber per hari, skip video bertanda Content ID (SOURCE\_CREDIT\_ENABLED, COPYRIGHT\_GUARD\_MODE = warn \| block) |
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
| `HOOK_ENABLED` / `HOOK_DURATION` / `HOOK_STYLE` / `HOOK_FONT_SIZE` / `HOOK_COLOR` / `HOOK_BG_COLOR` | ⚪ | AI Hook Overlay (default: `true` / `2` / `bold-center` / `56` / `white` / `#FF0000`) |
| `YOUTUBE_AUTO_COMMENT_ENABLED` / `YOUTUBE_AUTO_COMMENT_STYLE` / `YOUTUBE_AUTO_COMMENT_SUFFIX` | ⚪ | Auto-First Comment (default: `false` / `mixed` / kosong) — lihat bagian Auto-First Comment |
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
/subtitle         - Info config subtitle + preview style (mis. /subtitle karaoke)
/hook             - Info AI Hook Overlay (teks pembuka)
/autocomment      - Info Auto-First Comment (komentar pancingan otomatis)
/introoutro       - Info & ubah konfigurasi intro/outro
/drive            - Google Drive: status, hubungkan, ganti akun
/drivefolder      - Ganti folder tujuan Drive (link / reset)
/driveon /driveoff - Nyalakan / matikan auto-upload Drive
/cost             - Biaya AI per job & per user (/cost models, /cost jobs, /cost users)
/cancel           - Batalkan proses
```

---

## 💬 Subtitle / Caption Burn-In

Caption otomatis di-burn ke setiap klip lewat FFmpeg `ass` filter (libass), memakai timestamp **per kata** dari Whisper. Langkah ini berjalan setelah zoom dan sebelum watermark/intro-outro. Kalau transkripsi kosong atau FFmpeg gagal, klip tetap dibuat tanpa subtitle.

| Variable | Default | Pilihan |
| --- | --- | --- |
| `SUBTITLE_ENABLED` | `true` | `true` \| `false` |
| `SUBTITLE_STYLE` | `karaoke` | `karaoke` \| `word-highlight` \| `simple` \| `alex-hormozi` |
| `SUBTITLE_FONT_SIZE` | `48` | 16–160 (ukuran dasar, tiap style punya pengali) |
| `SUBTITLE_COLOR` | `white` | nama warna / `#RRGGBB` |
| `SUBTITLE_HIGHLIGHT_COLOR` | `yellow` | nama warna / `#RRGGBB` |
| `SUBTITLE_POSITION` | `bottom-center` | `bottom-center` \| `center` \| `top-center` |
| `SUBTITLE_MAX_WORDS_PER_LINE` | `4` | 1–8 |
| `SUBTITLE_ANIMATION` | `pop` | `pop` \| `fade` \| `none` |
| `SUBTITLE_FONT` *(opsional)* | `Montserrat` | font terinstall / dari `SUBTITLE_FONTS_DIR` |
| `SUBTITLE_FONTS_DIR` *(opsional)* | – | folder font custom |
| `SUBTITLE_OUTLINE_COLOR` *(opsional)* | `black` | warna outline |
| `SUBTITLE_MARGIN_V` *(opsional)* | otomatis | jarak dari tepi (px, basis tinggi 1920) |

Style: **karaoke** (highlight menyapu mengikuti kata), **word-highlight** (hanya kata aktif berwarna), **simple** (teks putih biasa), **alex-hormozi** (HURUF BESAR, 1–3 kata, kata aktif berwarna + pop).

Telegram: `/subtitle` menampilkan config + tombol preview; `/subtitle karaoke`, `/subtitle alex-hormozi fade` mengirim video preview.

Mengubah tampilan/menambah style: edit `STYLE_PRESETS` di `src/lib/subtitle-config.ts`. File terkait: `src/lib/subtitle-burner.ts` (render ASS + FFmpeg).

---

## 📱 Cara Penggunaan

1. Buka bot Telegram milik Anda
2. Kirim `/connect` untuk menghubungkan akun YouTube Studio
3. Kirim link video (YouTube/Facebook/TikTok/Instagram)
4. Bot akan otomatis: download → transkripsi → analisis AI → potong klip → upload
5. Terima klip video beserta link YouTube Studio langsung di Telegram!

---

## 📈 AI Analytics & Feedback Loop (Bot yang Makin Pintar)

Bot melacak performa tiap klip yang diupload ke YouTube, mengirim **laporan mingguan** ke Telegram, lalu AI **belajar dari klip yang sukses** dan otomatis menyesuaikan arahan niche (pengganti `DEFAULT_NICHE_PROMPT`) untuk klip berikutnya.

**Perintah Telegram**

```
/analytics                 - Laporan: klip View terbanyak + niche penghasil penonton terbanyak
/analytics 30              - Laporan untuk klip 30 hari terakhir
/analytics sync            - Tarik views terbaru dari YouTube sekarang
/analytics learn           - Suruh AI belajar dari klip sukses sekarang
/analytics apply           - Terapkan hasil belajar (jika ANALYTICS_LEARNING_AUTO_APPLY=false)
/analytics reset           - Hapus hasil belajar (kembali ke DEFAULT_NICHE_PROMPT)
/analytics weekly on|off   - Laporan mingguan otomatis
/analytics learning on|off - Smart Learning Loop
/analytics views <id> <n>  - Isi views manual (video private yang tak terbaca API)
```

**Cara kerja Smart Learning Loop:** klip dengan views tertinggi (default 30% teratas) dibandingkan dengan yang terendah → AI (Gemini/Groq, lihat `src/lib/ai-provider.ts`) menulis arahan niche baru → dipakai otomatis di analisis video berikutnya untuk akun yang belum mengatur `/niche` sendiri. Niche kustom user **tidak pernah ditimpa**. Kalau AI tidak tersedia, dipakai heuristik non-AI.

**Konfigurasi (Railway Variables — semuanya opsional):**

| Variable | Default | Deskripsi |
| --- | --- | --- |
| `ANALYTICS_ENABLED` | true | Matikan/nyalakan seluruh fitur |
| `ANALYTICS_WEEKLY_REPORT_ENABLED` | true | Laporan mingguan otomatis |
| `ANALYTICS_REPORT_DAY` / `ANALYTICS_REPORT_HOUR` | monday / 8 | Jadwal laporan |
| `ANALYTICS_TIMEZONE` | ikut `SCHEDULER_TIMEZONE` (Asia/Jakarta) | Zona waktu jadwal |
| `ANALYTICS_SYNC_INTERVAL_MINUTES` | 180 | Jeda tarik views dari YouTube |
| `ANALYTICS_WORKER_INTERVAL_MINUTES` | 15 | Seberapa sering worker bangun |
| `ANALYTICS_TRACK_DAYS` | 90 | Lama klip dilacak |
| `ANALYTICS_TOP_CLIPS` / `ANALYTICS_TOP_NICHES` | 5 / 5 | Jumlah baris di laporan |
| `ANALYTICS_LEARNING_ENABLED` | true | Smart Learning Loop |
| `ANALYTICS_LEARNING_AUTO_APPLY` | true | false = harus `/analytics apply` dulu |
| `ANALYTICS_LEARNING_MIN_CLIPS` | 5 | Minimal klip ber-data sebelum AI belajar |
| `ANALYTICS_LEARNING_TOP_PERCENT` | 30 | % klip teratas dianggap sukses |
| `ANALYTICS_LEARNING_MIN_VIEWS` | 10 | Views minimal klip sukses |
| `ANALYTICS_LEARNING_INTERVAL_DAYS` | 7 | Jeda minimal belajar otomatis |
| `ANALYTICS_LEARNED_PROMPT_MAX_LENGTH` | 300 | Batas panjang prompt hasil belajar |
| `ANALYTICS_REQUEST_READONLY_SCOPE` | true | Minta izin `youtube.readonly` saat `/connect` |
| `YOUTUBE_API_KEY` | – | Fallback baca views video public/unlisted |

> 🔑 **Penting:** klip diupload sebagai *private draft*, sehingga membaca views-nya butuh izin `youtube.readonly`. Akun yang sudah terhubung perlu mengirim `/connect` sekali lagi. Alternatif: ubah privasi video jadi public/unlisted + set `YOUTUBE_API_KEY`, atau isi manual lewat `/analytics views`.

Tabel `clip_performance`, `analytics_user_state`, `analytics_learning_log` dibuat **otomatis** saat runtime (tidak perlu `drizzle-kit push`). Pemicu manual/cron: `GET /api/analytics/run?secret=<SETUP_SECRET>[&action=sync|report|learn&userId=...]`.
Kata kunci klasifikasi niche & semua default ada di `src/lib/analytics-config.ts`; format laporan di `src/lib/analytics-report.ts`.

---

## 🩺 Auto-Title Doctor (bagian dari AI Analytics Loop)

Setelah worker analytics menarik views (default tiap 180 menit), klip yang sudah tayang **> 24 jam** tapi views-nya **di bawah ambang** (default 50) otomatis diperiksa: AI (Gemini/Groq) membuat **Judul & Hashtag baru yang lebih clickbait**, lalu video di YouTube di-update lewat API `videos.update`. Hasilnya dikirim ke Telegram dan dicatat di tabel `clip_retitle_log` (dibuat otomatis).

**Aktifkan:** set `ANALYTICS_AUTO_RETITLE_LOW_VIEWS=true` di Railway Variables, lalu kirim `/connect` sekali lagi di Telegram (butuh izin edit video `youtube.force-ssl`). Default **mati** karena fitur ini mengubah video di YouTube.

| Variable | Default | Deskripsi |
| --- | --- | --- |
| `ANALYTICS_AUTO_RETITLE_LOW_VIEWS` | false | Saklar utama |
| `ANALYTICS_RETITLE_VIEWS_THRESHOLD` | 50 | Angka views, atau `avg` = di bawah rata-rata klip user |
| `ANALYTICS_RETITLE_MIN_AGE_HOURS` | 24 | Klip diperiksa setelah tayang N jam |
| `ANALYTICS_RETITLE_MAX_AGE_DAYS` | 14 | Klip lebih tua dari ini tidak diutak-atik |
| `ANALYTICS_RETITLE_MAX_PER_CLIP` | 1 | Maks penggantian judul per klip |
| `ANALYTICS_RETITLE_COOLDOWN_HOURS` | 72 | Jeda antar-penggantian pada klip yang sama |
| `ANALYTICS_RETITLE_MAX_PER_CYCLE` | 5 | Batas klip per user per siklus (hemat kuota API) |
| `ANALYTICS_RETITLE_PRIVACY` | public | Privasi video yang boleh diganti (`public,unlisted,private`) |
| `ANALYTICS_RETITLE_HASHTAGS` | 4 | Jumlah hashtag baru (0 = hashtag tidak diubah) |
| `ANALYTICS_RETITLE_RETRY_HOURS` | 12 | Jeda coba ulang kalau AI/YouTube gagal |
| `ANALYTICS_RETITLE_NOTIFY` | true | Notifikasi Telegram tiap judul diganti |
| `ANALYTICS_RETITLE_DRY_RUN` | false | true = simulasi (AI membuat judul, YouTube tidak diubah) |
| `ANALYTICS_RETITLE_STYLE` | – | Tambahan gaya penulisan untuk AI |
| `ANALYTICS_RETITLE_REQUEST_SCOPE` | true | Minta izin edit video saat `/connect` |

Perintah: `/analytics retitle` (status & riwayat) · `/analytics retitle run` (jalankan sekarang) · `GET /api/analytics/run?secret=...&action=retitle[&dryRun=1][&userId=...]`.

> 💡 Video yang masih **private** tidak diganti judulnya (views 0 karena memang tidak bisa dilihat siapa pun). Hanya `description` bagian hashtag-akhir yang diganti; sisa deskripsi, kategori, dan bahasa video dipertahankan. Semua env & prompt AI ada di `src/lib/auto-title-doctor-config.ts`.

---

## ✂️ Auto-Prune Klip Gagal (bagian dari AI Analytics Loop)

Klip yang sudah tayang **> 14 hari**, views-nya masih **< 50**, dan sudah **di-retitle ≥ 1x** oleh Auto-Title Doctor akan **diusulkan** untuk disembunyikan atau dihapus. Channel yang penuh klip sepi bisa menurunkan performa distribusi. **Bot hanya memberi usulan — kamu yang memutuskan** lewat tombol di Telegram:

```
✂️ Auto-Prune Klip Gagal
🎬 Judul klip
👁 12 views · 📅 21 hari tayang · ✏️ sudah di-retitle 1x
[🙈 Sembunyikan] [🗑 Hapus] [✅ Pertahankan]
```

- **Sembunyikan** → privasi video diubah ke `private` (atau `unlisted`), field status lain dipertahankan. Bisa dibuka lagi kapan saja di YouTube Studio.
- **Hapus** → `videos.delete` (permanen), dengan konfirmasi tombol kedua.
- **Pertahankan** → klip tidak diusulkan lagi.
- Kalau aksi gagal (mis. izin kurang), usulan tetap menunggu dan tombolnya bisa dicoba lagi.

Berjalan otomatis di worker analytics setelah views disinkron (default tiap 180 menit). Default **nyala** karena hanya memberi usulan; matikan dengan `AUTO_PRUNE_ENABLED=false`.

| Variable                       | Default        | Deskripsi                                                                |
| ------------------------------ | -------------- | ------------------------------------------------------------------------ |
| AUTO\_PRUNE\_ENABLED           | true           | Saklar utama (hanya memberi usulan)                                      |
| AUTO\_PRUNE\_MIN\_AGE\_DAYS    | 14             | Klip dinilai gagal setelah tayang N hari                                 |
| AUTO\_PRUNE\_VIEWS\_THRESHOLD  | 50             | Views di bawah angka ini = sepi                                          |
| AUTO\_PRUNE\_MIN\_RETITLES     | 1              | Minimal sudah di-retitle N kali (0 = tidak wajib)                        |
| AUTO\_PRUNE\_RETITLE\_GRACE\_DAYS | 3          | Beri waktu N hari setelah retitle terakhir                               |
| AUTO\_PRUNE\_ACTIONS           | hide,delete    | Tombol yang ditawarkan (`hide`, `delete`, atau salah satu)               |
| AUTO\_PRUNE\_HIDE\_TO          | private        | "Sembunyikan" = ubah privasi ke `private` \| `unlisted`                  |
| AUTO\_PRUNE\_DELETE\_CONFIRM   | true           | Hapus butuh konfirmasi tombol kedua                                      |
| AUTO\_PRUNE\_PRIVACY           | public,unlisted | Hanya usulkan video dengan privasi ini                                  |
| AUTO\_PRUNE\_MAX\_PER\_NOTIFY  | 5              | Maks klip per notifikasi per siklus                                      |
| AUTO\_PRUNE\_NOTIFY            | true           | Kirim usulan ke Telegram                                                 |
| AUTO\_PRUNE\_REMINDER\_DAYS    | 0              | Ingatkan lagi usulan yang belum diputuskan tiap N hari (0 = tidak)       |
| AUTO\_PRUNE\_KEEP\_SNOOZE\_DAYS | 0             | Klip "Dipertahankan" boleh diusulkan lagi setelah N hari (0 = tidak)     |
| AUTO\_PRUNE\_MAX\_STALE\_HOURS | 48             | Views harus disinkron dalam N jam terakhir                               |
| AUTO\_PRUNE\_REQUEST\_SCOPE    | true           | Minta izin edit video (`youtube.force-ssl`) saat /connect                |

Perintah: `/prune` (status & aturan) · `/prune list` (lihat & putuskan usulan) · `/prune run` (cari klip gagal sekarang) · `GET /api/analytics/run?secret=...&action=prune[&userId=...][&notify=0]`.

> 🔑 Sembunyikan & hapus butuh izin `youtube.force-ssl` (sama dengan Auto-Title Doctor). Kalau akun belum memberi izin itu, kirim `/connect` sekali lagi. Syarat "sudah di-retitle" mengandalkan Auto-Title Doctor (`ANALYTICS_AUTO_RETITLE_LOW_VIEWS=true`); kalau tidak dipakai, set `AUTO_PRUNE_MIN_RETITLES=0`. Tabel `clip_prune_suggestion` dibuat **otomatis** saat runtime. Semua default & teks pesan ada di `src/lib/auto-prune-config.ts`; logika di `src/lib/auto-prune.ts`.

---

## 💬 Auto-First Comment (Pancingan Algoritma YouTube)

Algoritma YouTube Shorts menyukai kolom komentar yang ramai. Saat AI menganalisis klip, AI sekaligus membuat **1 kalimat komentar pancingan/kontroversial** yang relevan dengan isi klip (tanpa panggilan AI tambahan). Setelah video terupload lewat YouTube Data API, bot otomatis memposting komentar itu memakai endpoint `commentThreads.insert`.

Contoh: *"Setuju gak sama pendapat dia di detik terakhir? Coba komen!"* atau *"Full videonya ada di channel @namakamu"* (lewat `YOUTUBE_AUTO_COMMENT_SUFFIX`).

**Aktifkan:** set `YOUTUBE_AUTO_COMMENT_ENABLED=true` di Railway Variables, lalu kirim `/connect` sekali lagi di Telegram (butuh izin `youtube.force-ssl`). Default **mati**.

| Variable | Default | Deskripsi |
| --- | --- | --- |
| `YOUTUBE_AUTO_COMMENT_ENABLED` | false | Saklar utama |
| `YOUTUBE_AUTO_COMMENT_STYLE` | mixed | `question` \| `controversial` \| `cta` \| `mixed` |
| `YOUTUBE_AUTO_COMMENT_SUFFIX` | – | Kalimat tambahan di akhir komentar (mis. `Full video ada di channel @namakamu`) |
| `YOUTUBE_AUTO_COMMENT_PROMPT` | – | Arahan tambahan untuk AI |
| `YOUTUBE_AUTO_COMMENT_MAX_CHARS` | 150 | Batas panjang kalimat dari AI (30–500) |
| `YOUTUBE_AUTO_COMMENT_FALLBACK` | true | Pakai komentar cadangan kalau AI tidak memberi komentar |
| `YOUTUBE_AUTO_COMMENT_PRIVACY` | public,unlisted,private | Hanya komentari video dengan status ini |
| `YOUTUBE_AUTO_COMMENT_DELAY_SECONDS` | 5 | Jeda setelah upload sebelum komentar |
| `YOUTUBE_AUTO_COMMENT_RETRIES` | 3 | Maks percobaan per klip |
| `YOUTUBE_AUTO_COMMENT_RETRY_DELAY_SECONDS` | 15 | Jeda antar percobaan |
| `YOUTUBE_AUTO_COMMENT_PIN_LINK` | true | Kirim link komentar ke Telegram untuk di-pin manual |
| `YOUTUBE_AUTO_COMMENT_REQUEST_SCOPE` | true | Minta izin komentar saat `/connect` |

Perintah: `/autocomment` (status & konfigurasi).

> 📌 **Soal pin:** YouTube Data API v3 **tidak menyediakan endpoint untuk mem-pin komentar**. Bot memposting komentar sebagai pemilik channel, lalu mengirim link langsung ke komentar itu di Telegram — tinggal ⋮ → *Pin*. Kalau posting komentar gagal, upload video tetap sukses. Gaya, prompt AI & komentar cadangan ada di `src/lib/auto-comment-config.ts`.

---

## 🛡️ Source Credit & Copyright Guard

Auto-Monitor mengambil video channel lain secara otomatis — risiko terbesarnya **copyright strike** atau **penolakan monetisasi (reused content)**. Fitur ini menambah pengaman berikut (semua opsional, diatur lewat Railway Variables, kode lain tidak perlu disentuh):

| Pengaman | Cara kerja |
| --- | --- |
| **Source Credit** | Deskripsi YouTube tiap klip otomatis ditambah `Source: <judul> — <channel> <link>` (sebelum baris hashtag). |
| **Whitelist channel** | Hanya channel milik sendiri (hasil `/connect`) atau yang diizinkan (`COPYRIGHT_WHITELIST_CHANNELS` / `/whitelist add`) yang lolos. |
| **Batas klip / sumber / hari** | Maks N klip dari satu video sumber per hari (default 3). Mode `block` memangkas klip / menolak job. |
| **Skip Content ID** | Video dengan sinyal Content ID (musik berlisensi, "Provided to YouTube by", error blokir hak cipta, kata kunci kustom) di-skip. |

Pengecekan berjalan **sebelum download** (hemat bandwidth/CPU) lewat metadata `yt-dlp --dump-json`, berlaku untuk Auto-Monitor **dan** link manual (ubah dengan `COPYRIGHT_GUARD_SCOPE=monitor`). Video yang diblokir guard di Auto-Monitor ditandai `skipped` (bukan error).

| Variable | Default | Deskripsi |
| --- | --- | --- |
| SOURCE\_CREDIT\_ENABLED | true | Saklar kredit sumber di deskripsi |
| SOURCE\_CREDIT\_TEMPLATE | `Source: {title} — {channel} {url}` | Format baris kredit (placeholder `{title}` `{channel}` `{url}`) |
| SOURCE\_CREDIT\_POSITION | bottom | `bottom` (sebelum hashtag) \| `top` |
| COPYRIGHT\_GUARD\_MODE | warn | `warn` = peringatan saja \| `block` = blokir pelanggaran \| `off` |
| COPYRIGHT\_GUARD\_SCOPE | all | `all` = semua job \| `monitor` = hanya Auto-Monitor |
| COPYRIGHT\_WHITELIST\_CHANNELS | – | ID `UCxxx` / `@handle` / nama / URL channel, pisah koma |
| COPYRIGHT\_WHITELIST\_REQUIRED | false | true = whitelist wajib walau kosong (hanya channel sendiri yang lolos) |
| COPYRIGHT\_ALLOW\_OWN\_CHANNEL | true | Channel YouTube hasil `/connect` otomatis lolos (butuh izin `youtube.readonly`) |
| COPYRIGHT\_MAX\_CLIPS\_PER\_SOURCE\_PER\_DAY | 3 | Maks klip per video sumber per hari (0 = tanpa batas) |
| COPYRIGHT\_DAY\_TIMEZONE | Asia/Jakarta | Zona waktu pergantian hari (default ikut `SCHEDULER_TIMEZONE`) |
| COPYRIGHT\_SKIP\_CONTENT\_ID | true | Skip video bertanda Content ID |
| COPYRIGHT\_CONTENT\_ID\_MUSIC\_SIGNAL | true | Metadata musik berlisensi dianggap tanda Content ID |
| COPYRIGHT\_CONTENT\_ID\_KEYWORDS | – | Kata kunci tambahan (pisah koma) di judul/deskripsi/channel sumber |
| COPYRIGHT\_PREFLIGHT\_TIMEOUT\_MS | 45000 | Batas waktu pengambilan metadata sumber |

Perintah Telegram: `/sourceguard` (status, konfigurasi & statistik) · `/whitelist` (daftar) · `/whitelist add @channel` · `/whitelist remove <nomor|channel>`.

> ⚠️ **Mode default `warn`** hanya memberi peringatan di progress Telegram + log (tidak ada yang berubah selain kredit di deskripsi). Setelah yakin, set `COPYRIGHT_GUARD_MODE=block`. Kalau whitelist aktif di mode `block`, video yang channel-nya tidak bisa diverifikasi (metadata gagal diambil) ikut diblokir.
>
> 🔎 YouTube **tidak menyediakan API publik** untuk melihat klaim Content ID video orang lain, jadi deteksi berbasis **sinyal** (bukan jaminan 100%). Whitelist tetap pengaman terkuat. Daftar penanda bawaan: `DEFAULT_CONTENT_ID_KEYWORDS` di `src/lib/source-guard-config.ts`; logika di `src/lib/source-guard.ts`. Tabel `source_guard_log` & `source_whitelist` dibuat **otomatis** saat runtime.

---

## 🚨 Post-Upload Claim Monitor (`/claims`, `/blacklist`)

Karena bot mengambil video channel lain, **Copyright Guard sebelum upload belum cukup** — klaim Content ID / pembatasan baru muncul **setelah** video tayang. Fitur ini memantau video yang sudah diupload, dan semua pengaturannya lewat Railway Variables (kode lain tidak perlu disentuh):

| Tahap | Cara kerja |
| --- | --- |
| **Cek berkala** | Worker (default tiap 60 menit) memanggil YouTube `videos.list` (`part=status,contentDetails`, 1 unit kuota per 50 video) dan membaca `status.uploadStatus` + `status.rejectionReason`, `contentDetails.licensedContent`, `contentDetails.regionRestriction` (+ opsional `contentRating` age-restricted). |
| **Alert Telegram** | Klaim/pembatasan baru dikirim dengan tombol **[🗑 Hapus] [🔒 Private] [🙈 Abaikan]**. Bot tidak pernah menghapus/memprivatekan sendiri — hanya setelah kamu menekan tombol (Hapus meminta konfirmasi kedua). |
| **Rasio klaim per source channel** | `klip kena klaim ÷ klip yang sudah dicek` dihitung per channel sumber (diambil dari log Source Guard, cadangan: monitor channel). |
| **Auto-blacklist** | Channel yang melewati ambang (default: ≥ 3 klip dicek, ≥ 2 kena klaim, rasio ≥ 30%) masuk blacklist: job dari channel itu **ditolak** oleh Source Guard, Auto-Monitor-nya **dijeda**. Channel whitelist / milik sendiri tidak pernah di-auto-blacklist. Salah blacklist? Tekan **[↩️ Keluarkan]** — channel baru di-blacklist lagi kalau ada klaim *baru*. |

Perintah Telegram: `/claims` (status & rasio) · `/claims list` (alert yang menunggu) · `/claims channels` (rasio per channel) · `/claims run` (cek sekarang) · `/blacklist` · `/blacklist add @channel` · `/blacklist remove <nomor|channel>`.

| Variable | Default | Deskripsi |
| --- | --- | --- |
| CLAIM\_MONITOR\_ENABLED | true | Saklar utama (false = mati total) |
| CLAIM\_MONITOR\_INTERVAL\_MINUTES | 60 | Seberapa sering worker mengecek |
| CLAIM\_MONITOR\_TRACK\_DAYS | 90 | Hanya cek video yang diupload ≤ N hari lalu |
| CLAIM\_MONITOR\_FRESH\_DAYS / CLAIM\_MONITOR\_OLD\_RECHECK\_HOURS | 7 / 24 | Video baru dicek tiap siklus; yang lebih tua tiap N jam |
| CLAIM\_MONITOR\_SIGNALS | rejected,licensed,region | Sinyal yang dianggap klaim: `rejected` \| `licensed` \| `region` \| `age` |
| CLAIM\_MONITOR\_NOTIFY | true | Kirim alert ke Telegram |
| CLAIM\_MONITOR\_ACTIONS | delete,private | Tombol yang ditawarkan (Abaikan selalu ada) |
| CLAIM\_MONITOR\_HIDE\_TO | private | Tombol "Private" mengubah ke `private` \| `unlisted` |
| CLAIM\_MONITOR\_DELETE\_CONFIRM | true | Hapus butuh konfirmasi tombol kedua |
| CLAIM\_MONITOR\_MAX\_ALERTS\_PER\_CYCLE | 10 | Maks alert per user per siklus |
| CLAIM\_MONITOR\_REMINDER\_HOURS | 0 | Ingatkan lagi alert yang belum diputuskan tiap N jam (0 = tidak) |
| CLAIM\_MONITOR\_REQUEST\_SCOPE | true | Minta izin `youtube.force-ssl` saat `/connect` (dibutuhkan tombol Hapus/Private) |
| CLAIM\_AUTO\_BLACKLIST | true | Auto-blacklist channel sumber yang sering kena klaim |
| CLAIM\_BLACKLIST\_MIN\_CLIPS / CLAIM\_BLACKLIST\_MIN\_CLAIMS | 3 / 2 | Minimal klip dicek / minimal klip kena klaim |
| CLAIM\_BLACKLIST\_RATIO\_PERCENT | 30 | Rasio klaim minimal (%) |
| CLAIM\_RATIO\_COUNT\_IGNORED | true | Klaim yang di-"Abaikan" tetap dihitung di rasio |
| CLAIM\_BLACKLIST\_ENFORCE | block | `block` = job ditolak \| `warn` = peringatan saja \| `off` = hanya dicatat |
| CLAIM\_BLACKLIST\_PAUSE\_MONITORS | true | Jeda Auto-Monitor yang menunjuk channel blacklist |
| CLAIM\_BLACKLIST\_CHANNELS | – | Blacklist global manual: `UCxxx` / `@handle` / nama / URL, pisah koma |
| CLAIM\_BLACKLIST\_NOTIFY | true | Kabari saat channel di-auto-blacklist |

> 🔑 **Setelah deploy, kirim `/connect` sekali lagi** supaya Google memberi izin `youtube.force-ssl` (baca status klaim + tombol Hapus/Private). Tanpa itu, cek tetap jalan lewat izin baca yang sudah ada / `YOUTUBE_API_KEY` (hanya video public/unlisted, tanpa `rejectionReason`), tapi tombol Hapus/Private akan meminta `/connect` ulang.
>
> 🔎 YouTube **tidak punya API klaim Content ID** — yang dibaca adalah sinyal dari `videos.list`. Klaim parsial pada audio sering **tidak** muncul di API; cek juga YouTube Studio → Konten → kolom "Pembatasan". Pesan, label alasan penolakan & default bisa diubah di `src/lib/claim-monitor-config.ts`; logika di `src/lib/claim-monitor.ts`. Tabel `video_claim_watch` & `source_blacklist` dibuat **otomatis** saat runtime. Endpoint cadangan Railway Cron: `GET /api/claims/run?secret=SETUP_SECRET` (`&force=1` cek semua, `&notify=0` tanpa alert).

---

## 🛠️ Admin Panel Telegram (`/admin`, `/broadcast`)

Panel khusus admin langsung di Telegram: statistik global, daftar user, ban/unban, atur kuota, broadcast, dan notifikasi error otomatis. **Tidak mengubah dashboard web** — hanya fitur tambahan.

**Aktifkan:** set `ADMIN_TELEGRAM_IDS=123,456` di Railway Variables (ID Telegram admin, cek lewat @userinfobot), lalu redeploy. Kosong = fitur admin nonaktif.

```
/admin                                  - Panel utama (tombol: Statistik, Daftar User, Broadcast, Konfigurasi)
/admin stats                            - Statistik global (user, job, klip, error, top user, server)
/admin users [halaman]                  - Daftar user (tombol → detail & aksi)
/admin user <id|@username>              - Detail user + tombol Ban/Unban/Kuota
/admin ban <id|@username> [alasan]      - Blokir user
/admin unban <id|@username>             - Buka blokir
/admin quota <id|@username> <n|default|unlimited> - Atur kuota job user
/broadcast <pesan>                      - Kirim pesan ke semua user (dengan konfirmasi)
```

| Variable | Default | Deskripsi |
| --- | --- | --- |
| ADMIN_TELEGRAM_IDS | – | ID admin, pisah koma |
| ADMIN_DEFAULT_QUOTA | 0 | Kuota job default per user (0 = tanpa batas) |
| ADMIN_QUOTA_PERIOD | day | `day` \| `month` — periode reset kuota |
| ADMIN_QUOTA_TIMEZONE | ikut SCHEDULER_TIMEZONE | Zona waktu reset kuota |
| ADMIN_EXEMPT_QUOTA | true | Admin bebas kuota |
| ADMIN_ERROR_NOTIFY | true | Notifikasi error otomatis ke admin |
| ADMIN_ERROR_DEDUPE_SECONDS | 300 | Error identik hanya dikirim sekali per N detik |
| ADMIN_ERROR_MAX_PER_MINUTE | 10 | Batas pesan error per menit |
| ADMIN_ERROR_IGNORE | – | Kata kunci error yang diabaikan (pisah koma) |
| BROADCAST_CONFIRM | true | Minta konfirmasi tombol sebelum broadcast |
| BROADCAST_DELAY_MS | 50 | Jeda antar pesan broadcast |
| BROADCAST_INCLUDE_BANNED | false | Kirim juga ke user yang diban |
| BROADCAST_HEADER | 📢 Pengumuman | Judul di atas pesan broadcast |
| ADMIN_USERS_PER_PAGE | 8 | Jumlah user per halaman |
| ADMIN_NOTIFY_USER_ON_BAN | true | Beri tahu user saat di-ban/unban |

**Cara kerja:** user yang diban tidak bisa memakai bot (termasuk Auto-Monitor miliknya ditunda). Kuota dihitung dari jumlah job (selain yang error) per hari/bulan; saat habis user mendapat pesan dan job tidak dibuat. Error dari bot, job (clip/publish), webhook, dan unhandled rejection dikirim ke semua admin (dengan dedupe & batas per menit).

Semua pengaturan & teks pesan untuk user ada di `src/lib/admin-config.ts`. Logika Telegram: `src/lib/admin-telegram.ts`, data: `src/lib/admin-store.ts`, notifikasi error: `src/lib/admin-notify.ts`. Tabel `admin_users` & `admin_broadcasts` dibuat **otomatis** saat runtime.

---

## 💰 Cost Tracker (`/cost`, `DAILY_BUDGET_USD`)

Melacak biaya **OpenAI / Gemini / Groq / Whisper per job dan per user**, menampilkannya di `/cost`, di **laporan mingguan** Telegram, dan di dashboard web (section baru, section lain tidak berubah). Saat biaya hari ini melewati `DAILY_BUDGET_USD`, **AI dijeda otomatis**. Berguna untuk menentukan model mana yang layak dan, kalau bot dijual sebagai layanan, untuk menghitung harga langganan.

| Yang dicatat | Cara hitung |
| --- | --- |
| **Analisis momen viral** (GPT / Gemini) | token masuk + keluar dari respons API × harga model |
| **Transkripsi** (Whisper OpenAI / Groq) | durasi audio × harga per jam |
| **Title Doctor, Smart Learning, rekomendasi jam upload** | token × harga model (tanpa job, tetap per user kalau bisa) |

Setiap panggilan disimpan di tabel `ai_cost_log` (dibuat **otomatis** saat runtime) lengkap dengan job, user, fitur, model, token/durasi, dan biaya USD. Biaya per job dikaitkan lewat `AsyncLocalStorage`, jadi tidak ada fungsi lama yang berubah signature.

**Perilaku saat batas terlewati** (`COST_BUDGET_MODE=pause`):

* Link baru dari user **ditolak** dengan pesan jelas (job yang sudah berjalan dibiarkan selesai).
* Auto-Monitor **menunda** channel (video baru tidak hilang, diproses setelah reset).
* Title Doctor, Smart Learning, dan rekomendasi jam **di-skip** memakai fallback non-AI.
* Admin dikabari saat 80% dan 100% batas. Reset otomatis tengah malam (`COST_TIMEZONE`), atau naikkan `DAILY_BUDGET_USD` lalu redeploy/restart.

Perintah Telegram: `/cost` (admin: semua user · user biasa: akunnya sendiri) · `/cost 30` · `/cost models` (bandingkan model) · `/cost jobs` (biaya per job) · `/cost me` · `/cost users` (admin) · `/cost price` (admin, harga yang dipakai). Biaya global **tidak** ditampilkan ke user biasa; admin = ID di `ADMIN_TELEGRAM_IDS`.

| Variable | Default | Deskripsi |
| --- | --- | --- |
| DAILY\_BUDGET\_USD | 5 | Batas biaya AI per hari, semua user (USD). 0 = tanpa batas |
| USER\_DAILY\_BUDGET\_USD | 0 | Batas per user per hari (USD). 0 = tanpa batas — untuk model bisnis layanan |
| COST\_BUDGET\_MODE | pause | `pause` AI dijeda · `warn` hanya notifikasi admin · `off` tanpa batas |
| COST\_BUDGET\_NOTIFY\_ADMIN | true | Kabari admin saat mendekati/melewati batas |
| COST\_BUDGET\_WARN\_PERCENT | 80 | Peringatan dini (0 = nonaktif) |
| COST\_TRACKER\_ENABLED | true | Saklar utama (false = tidak mencatat & tidak membatasi) |
| COST\_TIMEZONE | ikut ANALYTICS\_TIMEZONE | Zona waktu pergantian hari |
| COST\_IDR\_RATE | 16000 | Kurs USD→Rp untuk tampilan (0 = sembunyikan) |
| COST\_WEEKLY\_REPORT | true | Sertakan biaya di laporan mingguan |
| COST\_REPORT\_DAYS | 7 | Periode laporan mingguan (hari) |
| COST\_TOP\_N | 5 | Jumlah baris teratas di laporan |
| COST\_PRICE\_OVERRIDES | – | JSON harga: `{"gemini-3.5-flash-lite":{"in":0.1,"out":0.4},"whisper-1":{"perHour":0.36}}` (`in`/`out` = USD per 1 juta token) |

> 🏷️ **Harga model** ada di `MODEL_PRICES` (`src/lib/cost-config.ts`) — ubah satu baris saat tarif provider berubah, atau timpa lewat `COST_PRICE_OVERRIDES` tanpa deploy kode. Model yang tidak ada di tabel memakai harga perkiraan dan ditandai `≈` di laporan. Teks pesan jeda ada di `COST_TEXT` pada file yang sama; tampilan laporan di `src/lib/cost-report.ts`.
>
> 🔎 Biaya adalah **estimasi dari harga publik** × pemakaian yang dilaporkan API (token/durasi), bukan tagihan resmi — cocokkan sesekali dengan dashboard billing provider. Kalau API tidak mengembalikan token, dipakai perkiraan ≈ karakter/4 dan ditandai `≈`. Gemini: token "thinking" dihitung sebagai output.
>
> 🧪 **Membandingkan model:** ganti `GEMINI_MODEL` / `GROQ_MODEL` / `GROQ_WHISPER_MODEL` / `AI_PROVIDER_ORDER` di Railway, proses beberapa video, lalu lihat `/cost models` dan `/cost jobs` (biaya per job & per klip). Ekspor JSON: `GET /api/cost/summary?secret=SETUP_SECRET&days=30`.

Logika: `src/lib/cost-tracker.ts` · konfigurasi & harga: `src/lib/cost-config.ts` · laporan: `src/lib/cost-report.ts` · Telegram: `src/lib/cost-telegram.ts` · dashboard: `src/components/CostTrackerSection.tsx`.

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
| `/api/claims/run` | GET | Paksa satu siklus Claim Monitor (`?secret=SETUP_SECRET`) |
| `/api/cost/summary` | GET | Ekspor ringkasan biaya AI (JSON) (`?secret=SETUP_SECRET&days=30&user=ID`) |

---

## 📝 License

MIT License — Bebas digunakan dan dimodifikasi.

---

Made with ❤️ using Next.js, Grammy.js, FFmpeg & OpenAI.
| SUBTITLE\_ENABLED / SUBTITLE\_STYLE / SUBTITLE\_FONT\_SIZE / SUBTITLE\_COLOR / SUBTITLE\_HIGHLIGHT\_COLOR / SUBTITLE\_POSITION / SUBTITLE\_MAX\_WORDS\_PER\_LINE / SUBTITLE\_ANIMATION | ⚪ | Caption burn-in (lihat bagian Subtitle di bawah) |     |         |                     |
