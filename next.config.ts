import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "grammy",
    "openai",
    "@google/generative-ai",
    "googleapis",
    "axios",
    "form-data",
    "yt-dlp-wrap",
  ],
};

export default nextConfig;
