import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { MobileNav } from "@/components/MobileNav";
import { SyncProvider } from "@/components/SyncProvider";
import { AuthProvider } from "@/lib/auth";
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
  title: "SparkOps Basement Interface",
  description: "Offline-first voice and receipt capture for NZ electricians.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SparkOps",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    apple: [{ url: "/favicon.ico" }],
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
          <SyncProvider>{children}</SyncProvider>
        </AuthProvider>
        <MobileNav />
      </body>
    </html>
  );
}
