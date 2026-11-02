import type { Metadata } from "next";
import { Geist_Mono, VT323 } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const vt323 = VT323({
  variable: "--font-vt323",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "RHODE GUARD — Panel Anti-Cheat FiveM",
  description:
    "Anti-cheat défensif FiveM: guards mouvement/événements/combat/économie, panel temps réel, dossiers d'incident, rôles staff et webhooks Discord.",
  keywords: ["FiveM", "anti-cheat", "GTA RP", "panel", "bans", "ESX", "ox_inventory"],
  icons: { icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="dark" suppressHydrationWarning>
      <body
        className={`${geistMono.variable} ${vt323.variable} antialiased bg-background text-foreground min-h-screen`}
      >
        {children}
        {/* Overlays CRT */}
        <div aria-hidden="true" className="scanlines fixed inset-0 z-[90] pointer-events-none" />
        <div aria-hidden="true" className="crt-vignette fixed inset-0 z-[91] pointer-events-none" />
        <Toaster />
      </body>
    </html>
  );
}
