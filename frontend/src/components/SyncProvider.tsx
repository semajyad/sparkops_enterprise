"use client";

/**
 * Provider that keeps offline sync process alive across app navigation.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { getDraftCounts } from "@/lib/db";
import { backgroundSync } from "@/lib/syncService";
import { scheduleBackgroundSync, syncPendingDrafts } from "@/lib/syncManager";

interface SyncContextValue {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  refreshCounts: () => Promise<void>;
  triggerSync: () => Promise<void>;
}

export const SyncContext = createContext<SyncContextValue>({
  isOnline: true,
  isSyncing: false,
  pendingCount: 0,
  refreshCounts: async () => undefined,
  triggerSync: async () => undefined,
});

interface SyncProviderProps {
  children: React.ReactNode;
}

export function SyncProvider({ children }: SyncProviderProps): React.JSX.Element {
  const [isOnline, setIsOnline] = useState(
    typeof window === "undefined" ? true : window.navigator.onLine
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  const refreshCounts = useCallback(async () => {
    const counts = await getDraftCounts();
    setPendingCount(counts.pending);
  }, []);

  const runSync = useCallback(async () => {
    if (!window.navigator.onLine || isSyncing) {
      return;
    }

    setIsSyncing(true);
    try {
      await Promise.all([syncPendingDrafts(), backgroundSync()]);
      await refreshCounts();
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, refreshCounts]);

  useEffect(() => {
    setIsOnline(window.navigator.onLine);

    let unregisterMessageListener: (() => void) | undefined;

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
      const handleMessage = (event: MessageEvent) => {
        if (event.data?.type === "TRIGGER_SYNC") {
          void runSync();
        }
      };
      navigator.serviceWorker.addEventListener("message", handleMessage);
      unregisterMessageListener = () =>
        navigator.serviceWorker.removeEventListener("message", handleMessage);
    }

    void refreshCounts();
    void scheduleBackgroundSync();
    void backgroundSync();
    void runSync();

    const handleOnline = () => {
      setIsOnline(true);
      void scheduleBackgroundSync();
      void runSync();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      unregisterMessageListener?.();
    };
  }, [refreshCounts, runSync]);

  const value = useMemo(
    () => ({
      isOnline,
      isSyncing,
      pendingCount,
      refreshCounts,
      triggerSync: runSync,
    }),
    [isOnline, isSyncing, pendingCount, refreshCounts, runSync]
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncContextValue {
  return useContext(SyncContext);
}
