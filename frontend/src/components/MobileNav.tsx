"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BriefcaseBusiness, Home, MapPinned, Mic, UserRound } from "lucide-react";
import { useAuth } from "@/lib/auth";

function itemClass(isActive: boolean): string {
  return isActive ? "text-amber-400" : "text-slate-400";
}

function centerItemClass(isActive: boolean): string {
  return [
    "inline-flex min-h-11 min-w-11 flex-col items-center justify-center gap-1 rounded-xl border px-3 py-2 text-xs font-semibold transition",
    isActive
      ? "border-amber-400/80 bg-amber-500/20 text-amber-100"
      : "border-slate-600 bg-slate-900/80 text-slate-300 hover:border-amber-400/60",
  ].join(" ");
}

export function MobileNav(): React.JSX.Element {
  const pathname = usePathname();
  const { role, mode } = useAuth();
  const isAdminMode = role === "OWNER" && mode === "ADMIN";
  const homeHref = isAdminMode ? "/dashboard" : "/";
  const homeActive = isAdminMode ? pathname === "/dashboard" : pathname === "/";
  const centerHref = isAdminMode ? "/admin" : "/capture";
  const centerLabel = isAdminMode ? "Admin" : "Capture";
  const centerActive = isAdminMode ? pathname.startsWith("/admin") : pathname.startsWith("/capture");

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-16 items-center justify-around border-t border-slate-800 bg-slate-900/95 backdrop-blur">
      <Link
        href={homeHref}
        className={`inline-flex flex-col items-center gap-1 text-xs font-medium ${itemClass(homeActive)}`}
      >
        <Home className="h-5 w-5" />
        {isAdminMode ? "Dashboard" : "Home"}
      </Link>
      <Link
        href="/jobs"
        className={`inline-flex flex-col items-center gap-1 text-xs font-medium ${itemClass(pathname.startsWith("/jobs"))}`}
      >
        <BriefcaseBusiness className="h-5 w-5" />
        Jobs
      </Link>
      <Link href={centerHref} className={centerItemClass(centerActive)}>
        {isAdminMode ? <BriefcaseBusiness className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        {centerLabel}
      </Link>
      <Link
        href="/tracking"
        className={`inline-flex flex-col items-center gap-1 text-xs font-medium ${itemClass(pathname.startsWith("/tracking"))}`}
      >
        <MapPinned className="h-5 w-5" />
        Map
      </Link>
      <Link
        href="/profile"
        className={`inline-flex flex-col items-center gap-1 text-xs font-medium ${itemClass(pathname.startsWith("/profile"))}`}
      >
        <UserRound className="h-5 w-5" />
        Profile
      </Link>
    </nav>
  );
}
