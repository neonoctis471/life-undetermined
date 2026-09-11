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

export const metadata: Metadata = {
  title: "人生未定式",
  description: "毕业后的五年，你可以走两遍。",
};

export const viewport: Viewport = {
  themeColor: "#f4f4f1",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" className={display.variable}>
      <body>{children}</body>
    </html>
  );
}
