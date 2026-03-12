import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { GlobalSyncStatusDot } from "@/components/GlobalSyncStatusDot";
import { GlobalErrorSuppressor } from "@/components/GlobalErrorSuppressor";
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const initialRole = cookieStore.get("tradeops_user_role")?.value ?? null;
  const initialMode = cookieStore.get("tradeops_owner_mode")?.value ?? "FIELD";

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-50 text-gray-900 pb-20 overflow-x-hidden`}
      >
        <AuthProvider initialRole={initialRole as "OWNER" | "EMPLOYEE" | null} initialMode={initialMode as "FIELD" | "ADMIN"}>
          <UserModeProvider>
            <SyncProvider>
              <GlobalErrorSuppressor />
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
