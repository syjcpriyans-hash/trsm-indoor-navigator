import type { Metadata, Viewport } from "next";
import "./globals.css";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";

export const metadata: Metadata = {
  title: "TRSM Indoor Navigator (prototype)",
  description: "Independent demonstration prototype: 3D indoor navigation for TRSM floors 7–9. Not an official TMU service.",
  manifest: `${BASE}/manifest.webmanifest`,
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "TRSM Nav", statusBarStyle: "default" },
  icons: { icon: `${BASE}/icon.svg`, apple: `${BASE}/icon-192.png` },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#F4F5F7",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-CA">
      <body className="font-sans">{children}</body>
    </html>
  );
}
