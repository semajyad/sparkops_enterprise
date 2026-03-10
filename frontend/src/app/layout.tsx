import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { GlobalSyncStatusDot } from "@/components/GlobalSyncStatusDot";
import { MobileNav } from "@/components/MobileNav";
import { SyncProvider } from "@/components/SyncProvider";
import { AuthProvider } from "@/lib/auth";
import { UserModeProvider } from "@/lib/user-mode";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TradeOps Field Interface",
  description: "Offline-first voice and receipt capture for NZ electricians.",
  manifest: "/manifest.json",
  other: {
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "TradeOps",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#f59e0b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased pb-28`}
      >
        <AuthProvider>
          <UserModeProvider>
            <SyncProvider>
              {children}
              <GlobalSyncStatusDot />
            </SyncProvider>
            <MobileNav />
          </UserModeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
