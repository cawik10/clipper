import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // TypeScript errors are caught by our separate `tsc --noEmit` step.
    // Disabling here avoids OOM during `next build` in memory-constrained environments.
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
