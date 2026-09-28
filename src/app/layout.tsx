import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "AutoClip Bot — AI YouTube Shorts & TikTok Generator",
  description:
    "Bot Telegram cerdas yang memotong video panjang menjadi klip viral dan auto-upload ke YouTube Studio & TikTok.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <body className="bg-[#0a0a0a] text-white antialiased">{children}</body>
    </html>
  );
}
