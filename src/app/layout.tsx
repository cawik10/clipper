import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AutoClip Bot — AI YouTube Shorts Generator",
  description:
    "Bot Telegram yang otomatis memotong video panjang menjadi klip viral 20-40 detik untuk YouTube Shorts dengan auto-generate thumbnail",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
