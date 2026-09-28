import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AutoClip Bot — AI YouTube Shorts Generator",
  description:
    "Bot Telegram AI untuk membuat YouTube Shorts otomatis dari video panjang YouTube, Facebook, TikTok, dan Instagram. Auto-clip, transkripsi, analisis viral, dan upload ke YouTube Studio.",
  keywords: [
    "youtube shorts",
    "auto clip",
    "telegram bot",
    "video clipper",
    "AI",
    "viral",
    "youtube studio",
  ],
  openGraph: {
    title: "AutoClip Bot — AI YouTube Shorts Generator",
    description: "Bot Telegram AI untuk membuat YouTube Shorts otomatis",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className={`${inter.className} bg-gray-950 text-white antialiased`}>
        {children}
      </body>
    </html>
  );
}
