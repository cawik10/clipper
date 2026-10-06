import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "AutoClip Bot — AI YouTube Shorts Generator",
  description: "Bot Telegram yang otomatis memotong video panjang menjadi klip viral untuk YouTube Shorts, dengan durasi klip bisa dipilih: 15, 20, 30, 40, atau 60 detik.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <body className="bg-slate-950 text-slate-100 antialiased">{children}</body>
    </html>
  );
}
