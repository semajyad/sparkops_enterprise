"use client";

/**
 * IndexedDB storage layer for offline SparkOps job capture.
 */

export type SyncStatus = "pending" | "synced" | "failed";

export interface JobDraft {
  id?: number;
  timestamp: number;
  voice_text?: string;
  audio_blob_base64?: string;
  receipt_image_base64?: string;
  sync_status: SyncStatus;
}

const DB_NAME = "sparkops-offline-db";
const DB_VERSION = 1;
const STORE_NAME = "jobDrafts";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("sync_status", "sync_status", { unique: false });
        store.createIndex("timestamp", "timestamp", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txRequest<T = unknown>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveJobDraft(
  draft: Omit<JobDraft, "id" | "timestamp" | "sync_status"> & {
    sync_status?: SyncStatus;
  }
): Promise<number> {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);

  const request = store.add({
    ...draft,
    timestamp: Date.now(),
    sync_status: draft.sync_status ?? "pending",
  } satisfies JobDraft);

  const id = (await txRequest(request)) as number;

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

  db.close();
  return id;
}

export async function getPendingDrafts(): Promise<JobDraft[]> {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);
  const index = store.index("sync_status");
  const request = index.getAll("pending");
  const rows = (await txRequest(request)) as JobDraft[];
  db.close();
  return rows.sort((a, b) => a.timestamp - b.timestamp);
}

export async function updateDraft(draft: JobDraft): Promise<void> {
  if (typeof draft.id !== "number") {
    throw new Error("Draft id is required to update records.");
  }

  const db = await openDb();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  store.put(draft);

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

  db.close();
}

export async function getDraftCounts(): Promise<{ pending: number; synced: number; failed: number }> {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);
  const rows = ((await txRequest(store.getAll())) as JobDraft[]) ?? [];
  db.close();

  return rows.reduce(
    (acc, row) => {
      if (row.sync_status === "pending") acc.pending += 1;
      if (row.sync_status === "synced") acc.synced += 1;
      if (row.sync_status === "failed") acc.failed += 1;
      return acc;
    },
    { pending: 0, synced: 0, failed: 0 }
  );
}
