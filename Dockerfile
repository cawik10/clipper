FROM node:20-bookworm-slim AS base

# Tambahkan 'unzip' ke dalam daftar paket
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    python3-pip \
    python3-venv \
    curl \
    ca-certificates \
    fonts-dejavu-core \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Instal Deno (sekarang akan berhasil karena unzip sudah tersedia)
RUN curl -fsSL https://deno.land/x/install/install.sh | sh
ENV PATH="/root/.deno/bin:$PATH"

# Instal OpenCV dan Numpy
RUN pip3 install --no-cache-dir opencv-python-headless numpy --break-system-packages

# Install yt-dlp versi nightly terbaru untuk bypass proteksi YouTube terbaru
RUN pip3 install --no-cache-dir -U --pre "yt-dlp[default]" curl-cffi --break-system-packages || true
RUN pip3 install --no-cache-dir -U --pre --extra-index-url https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download/ "yt-dlp[default]" --break-system-packages || true

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

CMD ["node", "server.js"]