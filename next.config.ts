import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Skip type checking during production build to avoid OOM
  // Types are still checked separately via `tsc --noEmit`
  typescript: {
    ignoreBuildErrors: true,
  },
  // Reduce memory pressure
  experimental: {
    workerThreads: false,
  },
};

export default nextConfig;
