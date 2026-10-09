FROM node:20-alpine AS base

# Install system dependencies (ffmpeg, python, curl, deno)
RUN apk add --no-cache \
    ffmpeg \
    python3 \
    py3-pip \
    curl \
    ca-certificates \
    ttf-dejavu \
    deno

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

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]