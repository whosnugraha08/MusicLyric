import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "LyricStage - Personal Lyric Video Studio",
  description:
    "Create stunning lyric videos with synchronized text, beautiful backgrounds, and smooth animations. Your personal lyric video production studio.",
  keywords: ["lyric video", "music", "karaoke", "lyrics", "video studio"],
  authors: [{ name: "LyricStage" }],
  openGraph: {
    title: "LyricStage - Personal Lyric Video Studio",
    description: "Create stunning lyric videos with synchronized text and beautiful animations.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className={`${inter.variable} h-full`}>
      <body className="min-h-full bg-[#09090b] font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
