import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
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
