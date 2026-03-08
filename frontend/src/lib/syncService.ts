"use client";

import { apiFetch, parseApiJson } from "@/lib/api";
import {
  enqueueSyncAction,
  getLastJobSyncAt,
  getPendingSyncQueueItems,
  markSyncQueueItemFailed,
  markSyncQueueItemSynced,
  setLastJobSyncAt,
  upsertJobs,
  type CachedJob,
} from "@/lib/db";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

type RemoteJob = Record<string, unknown>;

function parseUpdatedAt(job: RemoteJob): string {
  const updatedAt = job.updated_at;
  if (typeof updatedAt === "string" && updatedAt.trim()) {
    return updatedAt;
  }
  const createdAt = job.created_at;
  if (typeof createdAt === "string" && createdAt.trim()) {
    return createdAt;
  }
  return new Date().toISOString();
}

export async function pull(): Promise<{ fetched: number; upserted: number }> {
  const response = await apiFetch(`${API_BASE_URL}/api/jobs`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to pull jobs (${response.status})`);
  }

  const payload = await parseApiJson<RemoteJob[]>(response);
  const jobs = Array.isArray(payload) ? payload : [];

  const lastSyncAt = getLastJobSyncAt();
  const filtered = lastSyncAt
    ? jobs.filter((job) => {
        const timestamp = Date.parse(parseUpdatedAt(job));
        const boundary = Date.parse(lastSyncAt);
        if (Number.isNaN(timestamp) || Number.isNaN(boundary)) {
          return true;
        }
        return timestamp > boundary;
      })
    : jobs;

  const upserted = await upsertJobs(filtered);
  setLastJobSyncAt(new Date().toISOString());
  return { fetched: jobs.length, upserted };
}

async function pushJobCreate(payload: Record<string, unknown>): Promise<void> {
  const response = await apiFetch(`${API_BASE_URL}/api/jobs`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`Job sync failed (${response.status})`);
  }

  const created = await parseApiJson<RemoteJob>(response);
  await upsertJobs([created]);
}

async function pushSafetyTestCreate(payload: Record<string, unknown>): Promise<void> {
  const jobId = String(payload.job_id ?? "").trim();
  if (!jobId) {
    throw new Error("Safety test sync payload is missing job_id.");
  }

  const response = await apiFetch(`${API_BASE_URL}/api/ingest`, {
    method: "POST",
    body: JSON.stringify({
      voice_notes: payload.voice_notes,
      gps_lat: payload.gps_lat,
      gps_lng: payload.gps_lng,
    }),
  });

  if (!response.ok) {
    throw new Error(`Safety test sync failed (${response.status})`);
  }

  const maybeUpdatedJob = await parseApiJson<RemoteJob>(response).catch(() => null);
  if (maybeUpdatedJob && typeof maybeUpdatedJob === "object") {
    await upsertJobs([maybeUpdatedJob]);
  }
}

export async function push(): Promise<{ attempted: number; synced: number; failed: number }> {
  const queue = await getPendingSyncQueueItems();
  let synced = 0;
  let failed = 0;

  for (const item of queue) {
    if (typeof item.id !== "number") {
      continue;
    }

    try {
      if (item.entity_type === "job" && item.action === "create") {
        await pushJobCreate(item.payload);
      } else if (item.entity_type === "safety_test" && item.action === "create") {
        await pushSafetyTestCreate(item.payload);
      }
      await markSyncQueueItemSynced(item.id);
      synced += 1;
    } catch (error) {
      await markSyncQueueItemFailed(item.id, error instanceof Error ? error.message : "Queue push failed");
      failed += 1;
    }
  }

  return { attempted: queue.length, synced, failed };
}

export async function backgroundSync(): Promise<{ fetched: number; upserted: number; pushed: number }> {
  const pulled = await pull();

  if (typeof window !== "undefined" && !window.navigator.onLine) {
    return { fetched: pulled.fetched, upserted: pulled.upserted, pushed: 0 };
  }

  const pushed = await push();
  return {
    fetched: pulled.fetched,
    upserted: pulled.upserted,
    pushed: pushed.synced,
  };
}

export async function queueJobCreate(payload: {
  client_name: string;
  title: string;
  location: string;
  scheduled_date: string | null;
}): Promise<number> {
  return enqueueSyncAction({
    entity_type: "job",
    action: "create",
    payload,
  });
}

export async function queueSafetyTestLog(payload: {
  job_id: string;
  voice_notes?: string;
  gps_lat?: number;
  gps_lng?: number;
}): Promise<number> {
  return enqueueSyncAction({
    entity_type: "safety_test",
    action: "create",
    payload,
  });
}

export function toCachedJob(input: {
  id: string;
  client_name: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  date_scheduled?: string | null;
  extracted_data?: Record<string, unknown>;
  sync_status?: "pending" | "synced" | "failed";
}): CachedJob {
  const createdAt = input.created_at || new Date().toISOString();
  return {
    id: input.id,
    client_name: input.client_name,
    status: input.status ?? "DRAFT",
    created_at: createdAt,
    updated_at: input.updated_at ?? createdAt,
    date_scheduled: input.date_scheduled ?? null,
    extracted_data: input.extracted_data,
    sync_status: input.sync_status ?? "pending",
    stale_at: Date.now() + 5 * 60 * 1000,
  };
}
