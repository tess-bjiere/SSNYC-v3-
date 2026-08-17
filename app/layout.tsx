import type { Metadata } from "next";
import "./globals.css";
import { APP } from "@/lib/appConfig";

// Title and description follow the deployment's identity (SSYNC or FRED) — see
// lib/appConfig.ts. One codebase, two apps.
export const metadata: Metadata = {
  title: APP.name,
  description: `${APP.name} — reference library + style development tool`,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* ONE FAMILY (Tess, 2026-08-06: "change all fonts to barlow").
            Instrument Serif is gone — it was the display face on page titles,
            the library modal's heading and the AI summary sentence, and it is
            a second webfont fetched on every page load to set about nine
            words. Barlow Semi Condensed now carries the whole app, and the
            weights it loads are the hierarchy: 300 for the one light lead
            sentence, 400 body, 500 for emphasis inside prose, 600 for titles
            and captions. Nothing is set in a weight that is not in this list —
            anything else is the browser faking it, which is what made bold
            text look slightly different in different corners of the page. */}
        <link
          href="https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:ital,wght@0,300;0,400;0,500;0,600;1,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
