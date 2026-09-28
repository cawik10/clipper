import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    // TypeScript is checked separately via tsc --noEmit; skip it in the build
    // to avoid OOM errors in memory-constrained environments.
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
