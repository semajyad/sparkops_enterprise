"use client";

/**
 * Sync manager for flushing offline captures to backend ingest API.
 */

import { getPendingDrafts, updateDraft } from "@/lib/db";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

export async function syncPendingDrafts(): Promise<{ synced: number; attempted: number }> {
  const pendingDrafts = await getPendingDrafts();
  let synced = 0;

  for (const draft of pendingDrafts) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/ingest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          voice_notes: draft.voice_text,
          audio_base64: draft.audio_blob_base64,
          receipt_image_base64: draft.receipt_image_base64,
        }),
      });

      if (!response.ok) {
        continue;
      }

      await updateDraft({
        ...draft,
        sync_status: "synced",
        audio_blob_base64: undefined,
        receipt_image_base64: undefined,
      });
      synced += 1;
    } catch {
      continue;
    }
  }

  return { synced, attempted: pendingDrafts.length };
}

export async function scheduleBackgroundSync(): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  const registration = await navigator.serviceWorker.ready;
  if ("sync" in registration) {
    await (registration as ServiceWorkerRegistration & {
      sync: { register: (tag: string) => Promise<void> };
    }).sync.register("sparkops-sync");
  }
}
