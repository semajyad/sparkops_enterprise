"use client";

import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useSync } from "@/components/SyncProvider";

const HIDDEN_PATH_PREFIXES = ["/", "/login", "/signup", "/auth"];

export function GlobalSyncStatusDot(): React.JSX.Element {
  const pathname = usePathname();
  const { isOnline, isSyncing, pendingCount } = useSync();
  const [hint, setHint] = useState<string | null>(null);

  const hidden = HIDDEN_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

  const syncIndicator = useMemo(() => {
    if (isSyncing) {
      return {
        colorClass: "bg-amber-400",
        pulseClass: "animate-pulse",
        label: "Sync status: Syncing",
        hint: "Syncing changes to cloud...",
      };
    }

    if (!isOnline) {
      return {
        colorClass: "bg-rose-500",
        pulseClass: "",
        label: "Sync status: Offline",
        hint: "Offline - changes are saved locally.",
      };
    }

    return {
      colorClass: "bg-emerald-400",
      pulseClass: "",
      label: "Sync status: All saved",
      hint: "All changes saved to cloud.",
    };
  }, [isOnline, isSyncing]);

  useEffect(() => {
    if (!hint) {
      return;
    }
    const timer = window.setTimeout(() => setHint(null), 1800);
    return () => window.clearTimeout(timer);
  }, [hint]);

  if (hidden) {
    return <></>;
  }

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[9999] flex items-center gap-2">
      <button
        type="button"
        onClick={() => setHint(syncIndicator.hint)}
        aria-label={syncIndicator.label}
        className="pointer-events-auto inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-slate-900/85"
      >
        <span className={`h-2 w-2 rounded-full ${syncIndicator.colorClass} ${syncIndicator.pulseClass}`} aria-hidden="true"></span>
      </button>
      {pendingCount > 0 ? <span className="rounded-md bg-slate-900/85 px-2 py-1 text-xs text-slate-300">{pendingCount} pending</span> : null}
      {hint ? (
        <p className="pointer-events-auto whitespace-nowrap rounded-lg border border-slate-700 bg-slate-950/95 px-3 py-2 text-xs text-slate-200 shadow-lg shadow-black/50">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
