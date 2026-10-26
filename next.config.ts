import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Wajib agar Dockerfile (Railway) tidak error di tahap COPY .next/standalone
  output: "standalone",
  // Type-checking penuh sudah dijalankan terpisah lewat `tsc --noEmit` (lebih
  // hemat memori). Menjalankannya lagi di dalam `next build` menyebabkan OOM
  // di beberapa environment karena proyek ini memakai googleapis (tipe besar).
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
