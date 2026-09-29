import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "AutoClip Bot — AI YouTube Shorts Generator",
  description:
    "Bot Telegram cerdas yang memotong video panjang menjadi klip viral 20-40 detik untuk YouTube Shorts. Dilengkapi watermark custom, intro/outro otomatis, dan zoom effect.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <body className="bg-slate-950 text-slate-100 antialiased">{children}</body>
    </html>
  );
}
