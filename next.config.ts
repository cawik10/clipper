import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // Tambahkan baris ini agar Next.js membuat folder standalone
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
