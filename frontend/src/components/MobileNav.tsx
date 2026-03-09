"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, ClipboardList, Home, MapPin, Mic, UserRound } from "lucide-react";
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

type NavItem = {
  href: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  isActive: (pathname: string) => boolean;
  highlighted?: boolean;
};

const HIDDEN_PATH_PREFIXES = ["/login", "/signup", "/auth"];

export function MobileNav(): React.JSX.Element {
  const pathname = usePathname();
  const { role, mode } = useAuth();
  const isAdminMode = role === "OWNER" && mode === "ADMIN";

  if (pathname === "/" || HIDDEN_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return <></>;
  }

  const navItems: NavItem[] = isAdminMode
    ? [
        {
          href: "/home",
          label: "Home",
          Icon: Home,
          isActive: (path) => path === "/home" || path === "/dashboard",
        },
        {
          href: "/jobs",
          label: "Jobs",
          Icon: ClipboardList,
          isActive: (path) => path.startsWith("/jobs"),
        },
        {
          href: "/capture",
          label: "Capture",
          Icon: Mic,
          isActive: (path) => path.startsWith("/capture"),
          highlighted: true,
        },
        {
          href: "/map",
          label: "Map",
          Icon: MapPin,
          isActive: (path) => path.startsWith("/map") || path.startsWith("/tracking"),
        },
        {
          href: "/admin",
          label: "Admin",
          Icon: Building2,
          isActive: (path) => path.startsWith("/admin"),
        },
      ]
    : [
        {
          href: "/home",
          label: "Home",
          Icon: Home,
          isActive: (path) => path === "/home" || path === "/dashboard",
        },
        {
          href: "/jobs",
          label: "Jobs",
          Icon: ClipboardList,
          isActive: (path) => path.startsWith("/jobs"),
        },
        {
          href: "/capture",
          label: "Capture",
          Icon: Mic,
          isActive: (path) => path.startsWith("/capture"),
          highlighted: true,
        },
        {
          href: "/map",
          label: "Map",
          Icon: MapPin,
          isActive: (path) => path.startsWith("/map") || path.startsWith("/tracking"),
        },
        {
          href: "/profile",
          label: "Profile",
          Icon: UserRound,
          isActive: (path) => path.startsWith("/profile"),
        },
      ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-16 items-center justify-around border-t border-slate-800 bg-slate-900/95 backdrop-blur">
      {navItems.map((item) => {
        const active = item.isActive(pathname);
        const sharedClasses = item.highlighted
          ? centerItemClass(active)
          : `inline-flex flex-col items-center gap-1 text-xs font-medium ${itemClass(active)}`;
        return (
          <Link key={item.href} href={item.href} className={sharedClasses}>
            <item.Icon className="h-5 w-5" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
