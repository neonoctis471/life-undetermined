import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";

import "./globals.css";

/**
 * Noto Sans SC Black (SIL OFL 1.1), subset to the fixed copy in
 * src/app/play/copy.ts. AI-generated text uses the system font stack.
 */
const display = localFont({
  src: "./fonts/display-subset.woff2",
  variable: "--font-display",
  weight: "900",
  style: "normal",
  display: "swap",
  preload: true,
  adjustFontFallback: false,
});

/**
 * Noto Serif SC Regular (SIL OFL 1.1), GB2312 level 1 — the narration face for
 * AI-written prose and quotes. 677KB, so it is never preloaded: the system
 * serif stack renders first and this swaps in when it arrives.
 */
const serif = localFont({
  src: "./fonts/serif-subset.woff2",
  variable: "--font-serif-cjk",
  weight: "400",
  style: "normal",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: "人生未定式",
  // Matches the hero pitch: this is what a shared link previews as.
  description: "把知乎网友真实走过的人生经验，变成你可以亲自验证、对照和讨论的平行人生。毕业后的五年，你可以走两遍。",
  icons: { icon: "/brand/icon.png", apple: "/brand/icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#0b4bc4",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" className={`${display.variable} ${serif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
