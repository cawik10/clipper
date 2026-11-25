FROM node:20-bookworm-slim AS base

# Hapus fonts-montserrat dari daftar, dan tambahkan fontconfig
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    python3-pip \
    python3-venv \
    curl \
    ca-certificates \
    fonts-dejavu-core \
    fontconfig \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Unduh file TTF Montserrat statis secara langsung dari GitHub resmi Google Fonts
RUN mkdir -p /usr/share/fonts/truetype/montserrat && \
    curl -L -o /usr/share/fonts/truetype/montserrat/Montserrat-Regular.ttf "https://raw.githubusercontent.com/google/fonts/main/ofl/montserrat/static/Montserrat-Regular.ttf" && \
    curl -L -o /usr/share/fonts/truetype/montserrat/Montserrat-Bold.ttf "https://raw.githubusercontent.com/google/fonts/main/ofl/montserrat/static/Montserrat-Bold.ttf" && \
    curl -L -o /usr/share/fonts/truetype/montserrat/Montserrat-Black.ttf "https://raw.githubusercontent.com/google/fonts/main/ofl/montserrat/static/Montserrat-Black.ttf" && \
    fc-cache -fv

# Instal Deno (sekarang akan berhasil karena unzip sudah tersedia)
ARG DENO_BUILD_DATE=2026-11-25
RUN curl -fsSL https://deno.land/x/install/install.sh | sh
ENV PATH="/root/.deno/bin:$PATH"

# Instal OpenCV dan Numpy
RUN pip3 install --no-cache-dir --force-reinstall opencv-python-headless numpy --break-system-packages
RUN pip3 install --no-cache-dir --force-reinstall opencv-contrib-python-headless numpy --break-system-packages

# Ubah nilai tanggal/angka ini kapan saja untuk memaksa Railway mengunduh yt-dlp terbaru
ARG YTDLP_BUILD_DATE=2026-11-25
RUN pip3 install --no-cache-dir -U --pre "yt-dlp[default]" curl-cffi --break-system-packages

# Dependencies stage
FROM base AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# Build stage
FROM base AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL
RUN npm run build

# Production stage
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Create temp directory for video processing
RUN mkdir -p /tmp/autoclip

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/cookies.txt ./
# 🎯 Auto-Reframe Speaker Tracking (BARU!) — script Python dipanggil at
# runtime oleh src/lib/speaker-tracker.ts, tidak mengubah copy lain di atas.
COPY --from=builder /app/scripts ./scripts

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

# Contoh baris akhir Dockerfile runner
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]