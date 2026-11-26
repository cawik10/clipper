import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Wajib agar Dockerfile (Railway) tidak error di tahap COPY .next/standalone
  output: "standalone",
  // Paket server-only berukuran besar tidak perlu di-bundle ulang oleh Next —
  // dimuat langsung dari node_modules (ikut ter-trace ke .next/standalone).
  // Menurunkan pemakaian memori saat `next build` secara signifikan.
  serverExternalPackages: ["googleapis", "@google/generative-ai", "openai", "grammy"],
  // Type-checking penuh sudah dijalankan terpisah lewat `tsc --noEmit` (lebih
  // hemat memori). Menjalankannya lagi di dalam `next build` menyebabkan OOM
  // di beberapa environment karena proyek ini memakai googleapis (tipe besar).
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
