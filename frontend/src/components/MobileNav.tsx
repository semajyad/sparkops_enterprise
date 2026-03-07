"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Boxes, Home, Mic, ShieldAlert } from "lucide-react";

function itemClass(isActive: boolean): string {
  return isActive ? "text-emerald-500" : "text-slate-400";
}

export function MobileNav(): React.JSX.Element {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-16 items-center justify-around border-t border-slate-800 bg-slate-900">
      <Link href="/" className={`inline-flex flex-col items-center gap-1 text-xs font-medium ${itemClass(pathname === "/")}`}>
        <Home className="h-5 w-5" />
        Home
      </Link>
      <Link
        href="/capture"
        className={`inline-flex flex-col items-center gap-1 text-xs font-medium ${itemClass(pathname.startsWith("/capture"))}`}
      >
        <Mic className="h-5 w-5" />
        Capture
      </Link>
      <Link
        href="/ladder"
        className={`inline-flex flex-col items-center gap-1 text-xs font-medium ${itemClass(pathname.startsWith("/ladder"))}`}
      >
        <ShieldAlert className="h-5 w-5" />
        Ladder
      </Link>
      <Link
        href="/settings"
        className={`inline-flex flex-col items-center gap-1 text-xs font-medium ${itemClass(pathname.startsWith("/settings"))}`}
      >
        <Boxes className="h-5 w-5" />
        Materials
      </Link>
    </nav>
  );
}
