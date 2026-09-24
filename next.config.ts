import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // Tambahkan baris ini
  serverExternalPackages: ["child_process", "fs", "path", "os"],
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
};

export default nextConfig;
