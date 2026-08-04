import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SSYNC",
  description: "SOUS SOUS reference library + style development tool",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:ital,wght@0,300;0,400;0,500;0,600;1,400&family=Instrument+Serif:ital@0;1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
