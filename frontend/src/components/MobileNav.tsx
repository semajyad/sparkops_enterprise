"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BriefcaseBusiness, Home, MapPinned, Mic, UserRound } from "lucide-react";
import { useAuth } from "@/lib/auth";

function itemClass(isActive: boolean): string {
  return isActive ? "text-amber-400" : "text-slate-400";
}

export function MobileNav(): React.JSX.Element {
  const pathname = usePathname();
  const { role, mode } = useAuth();
  const isAdminMode = role === "OWNER" && mode === "ADMIN";

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-16 items-center justify-around border-t border-slate-800 bg-slate-900/95 backdrop-blur">
      <Link
        href="/dashboard"
        className={`inline-flex flex-col items-center gap-1 text-xs font-medium ${itemClass(pathname === "/dashboard")}`}
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
      {isAdminMode ? null : (
        <Link
          href="/capture"
          className={`inline-flex flex-col items-center gap-1 text-xs font-medium ${itemClass(pathname.startsWith("/capture"))}`}
        >
          <Mic className="h-5 w-5" />
          Capture
        </Link>
      )}
      <Link
        href="/tracking"
        className={`inline-flex flex-col items-center gap-1 text-xs font-medium ${itemClass(pathname.startsWith("/tracking"))}`}
      >
        <MapPinned className="h-5 w-5" />
        Map
      </Link>
      {isAdminMode ? (
        <Link
          href="/admin"
          className={`inline-flex flex-col items-center gap-1 text-xs font-medium ${itemClass(pathname.startsWith("/admin"))}`}
        >
          <BriefcaseBusiness className="h-5 w-5" />
          Business
        </Link>
      ) : null}
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
