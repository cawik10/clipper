import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["grammy", "@google/generative-ai", "googleapis", "form-data"],
  typescript: {
    // tsc is verified separately; skip in-build check to avoid OOM on constrained sandboxes
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
