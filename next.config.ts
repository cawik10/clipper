import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // Wajib agar Dockerfile tidak error di tahap COPY
  eslint: {
    ignoreDuringBuilds: true, // Mengabaikan error ESLint saat build
  },
  typescript: {
    ignoreBuildErrors: true, // Mengabaikan error TypeScript saat build
  },
};

export default nextConfig;