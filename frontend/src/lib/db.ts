"use client";

/**
 * Dexie-backed IndexedDB storage layer for offline SparkOps local-first data.
 */

import Dexie, { type Table } from "dexie";

export type SyncStatus = "pending" | "synced" | "failed";

export interface JobDraft {
  id?: number;
  timestamp: number;
  voice_text?: string;
  audio_blob_base64?: string;
  receipt_image_base64?: string;
  sync_status: SyncStatus;
}

export async function setTrackingMapCache(payload: Omit<CachedMapState, "key" | "updated_at">): Promise<void> {
  await db.map_state.put({
    key: "tracking",
    current: payload.current,
    jobs: payload.jobs,
    updated_at: now(),
  });
}

export async function getTrackingMapCache(): Promise<CachedMapState | undefined> {
  return db.map_state.get("tracking");
}

export async function setProfileCache(payload: Omit<CachedProfileState, "key" | "updated_at">): Promise<void> {
  await db.profile_state.put({
    key: "profile",
    ...payload,
    updated_at: now(),
  });
}

export async function getProfileCache(): Promise<CachedProfileState | undefined> {
  return db.profile_state.get("profile");
}

export async function setTeamCache(payload: Omit<CachedTeamState, "key" | "updated_at">): Promise<void> {
  await db.team_state.put({
    key: "team",
    ...payload,
    updated_at: now(),
  });
}

export async function getTeamCache(): Promise<CachedTeamState | undefined> {
  return db.team_state.get("team");
}

export async function setAdminSettingsCache(payload: Omit<CachedAdminState, "key" | "updated_at">): Promise<void> {
  await db.admin_state.put({
    key: "admin",
    ...payload,
    updated_at: now(),
  });
}

export async function getAdminSettingsCache(): Promise<CachedAdminState | undefined> {
  return db.admin_state.get("admin");
}

export async function listVehiclesFromCache(): Promise<CachedVehicle[]> {
  return db.vehicles.orderBy("updated_at").reverse().toArray();
}

export async function upsertVehicleInCache(
  vehicle: Omit<CachedVehicle, "updated_at"> & { updated_at?: number },
): Promise<void> {
  await db.vehicles.put({
    ...vehicle,
    updated_at: vehicle.updated_at ?? now(),
  });
}

export async function deleteVehicleFromCache(id: string): Promise<void> {
  await db.vehicles.delete(id);
}

export interface CachedJob {
  id: string;
  status: string;
  client_name: string;
  date_scheduled: string | null;
  sync_status: SyncStatus;
  created_at: string;
  updated_at: string;
  extracted_data?: Record<string, unknown>;
  stale_at?: number;
}

export interface CachedClient {
  id: string;
  name: string;
  updated_at: string;
}

export interface CachedProduct {
  id: string;
  name: string;
  updated_at: string;
}

export interface CachedMapState {
  key: "tracking";
  current: { lat: number; lng: number };
  jobs: Array<{
    id: string;
    clientName: string;
    timeLabel: string;
    addressLabel: string;
    coordinate: { lat: number; lng: number };
    navigateUrl: string;
  }>;
  updated_at: number;
}

export interface CachedProfileState {
  key: "profile";
  full_name: string | null;
  email: string | null;
  organization: string | null;
  organization_id: string | null;
  role: string | null;
  trade: "ELECTRICAL" | "PLUMBING" | null;
  organization_default_trade: "ELECTRICAL" | "PLUMBING" | null;
  updated_at: number;
}

export interface CachedAdminState {
  key: "admin";
  logo_url: string | null;
  website_url: string | null;
  business_name: string | null;
  gst_number: string | null;
  default_trade: "ELECTRICAL" | "PLUMBING";
  tax_rate: number | null;
  standard_markup: number | null;
  terms_and_conditions: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  updated_at: number;
}

export interface CachedVehicle {
  id: string;
  name: string;
  plate: string;
  notes?: string | null;
  updated_at: number;
}

export interface CachedJobDetail {
  id: string;
  raw_transcript: string;
  client_email?: string | null;
  compliance_status?: string | null;
  certificate_pdf_url?: string | null;
  extracted_data: {
    client?: string;
    address?: string;
    scope?: string;
    line_items?: Array<{
      qty?: string | number;
      description?: string;
      type?: string;
      unit_price?: string | number;
      line_total?: string | number;
    }>;
    safety_tests?: Array<{
      type?: string;
      value?: string | null;
      unit?: string | null;
      result?: string | null;
      gps_lat?: number | null;
      gps_lng?: number | null;
    }>;
    latitude?: number | string;
    longitude?: number | string;
    location?: string;
    scheduled_date?: string | null;
    required_trade?: string;
    job_title?: string;
  };
  status: string;
  created_at: string;
  invoice_summary?: {
    subtotal?: string;
    markup_amount?: string;
    gst?: string;
    total?: string;
    material_cost_base?: string;
    material_cost_with_markup?: string;
    labor_total?: string;
  };
  compliance_summary?: {
    status?: string;
    notes?: string;
    missing_items?: string[];
    checks?: Array<{ key?: string; label?: string; present?: boolean }>;
  };
  updated_at: number;
}

export type CachedTeamMember = {
  id: string;
  email: string;
  full_name: string;
  role: "OWNER" | "EMPLOYEE";
  trade: "ELECTRICAL" | "PLUMBING";
  status: "ACTIVE" | "PENDING";
  invited_at: string | null;
  last_sign_in_at: string | null;
};

export interface CachedTeamState {
  key: "team";
  activeUsers: CachedTeamMember[];
  pendingInvites: CachedTeamMember[];
  updated_at: number;
}

export type SyncQueueEntity = "job" | "safety_test";
export type SyncQueueAction = "create" | "update";

export interface SyncQueueItem {
  id?: number;
  entity_type: SyncQueueEntity;
  action: SyncQueueAction;
  payload: Record<string, unknown>;
  status: SyncStatus;
  created_at: number;
  updated_at: number;
  retry_count: number;
  last_error?: string;
}

const DB_NAME = "sparkops-offline-db";
const STALE_CACHE_MS = 5 * 60 * 1000;
const LAST_JOB_SYNC_KEY = "sparkops:last-job-sync";

class SparkOpsDexie extends Dexie {
  jobDrafts!: Table<JobDraft, number>;
  jobs!: Table<CachedJob, string>;
  job_details!: Table<CachedJobDetail, string>;
  clients!: Table<CachedClient, string>;
  products!: Table<CachedProduct, string>;
  map_state!: Table<CachedMapState, "tracking">;
  profile_state!: Table<CachedProfileState, "profile">;
  team_state!: Table<CachedTeamState, "team">;
  admin_state!: Table<CachedAdminState, "admin">;
  vehicles!: Table<CachedVehicle, string>;
  sync_queue!: Table<SyncQueueItem, number>;

  constructor() {
    super(DB_NAME);
    this.version(1).stores({
      jobDrafts: "++id,sync_status,timestamp",
    });
    this.version(2).stores({
      jobDrafts: "++id,sync_status,timestamp",
      jobs: "id,status,client_name,date_scheduled,sync_status,updated_at",
      clients: "id,name,updated_at",
      products: "id,name,updated_at",
      sync_queue: "++id,status,entity_type,created_at,retry_count",
    });
    this.version(3).stores({
      jobDrafts: "++id,sync_status,timestamp",
      jobs: "id,status,client_name,date_scheduled,sync_status,updated_at",
      clients: "id,name,updated_at",
      products: "id,name,updated_at",
      map_state: "key,updated_at",
      profile_state: "key,updated_at",
      sync_queue: "++id,status,entity_type,created_at,retry_count",
    });
    this.version(4).stores({
      jobDrafts: "++id,sync_status,timestamp",
      jobs: "id,status,client_name,date_scheduled,sync_status,updated_at",
      job_details: "id,updated_at,status",
      clients: "id,name,updated_at",
      products: "id,name,updated_at",
      map_state: "key,updated_at",
      profile_state: "key,updated_at",
      team_state: "key,updated_at",
      sync_queue: "++id,status,entity_type,created_at,retry_count",
    });
    this.version(5).stores({
      jobDrafts: "++id,sync_status,timestamp",
      jobs: "id,status,client_name,date_scheduled,sync_status,updated_at",
      job_details: "id,updated_at,status",
      clients: "id,name,updated_at",
      products: "id,name,updated_at",
      map_state: "key,updated_at",
      profile_state: "key,updated_at",
      team_state: "key,updated_at",
      admin_state: "key,updated_at",
      vehicles: "id,updated_at,plate,name",
      sync_queue: "++id,status,entity_type,created_at,retry_count",
    });
  }

  get drafts(): Table<CachedJob, string> {
    return this.jobs;
  }
}

export const db = new SparkOpsDexie();

function now(): number {
  return Date.now();
}

function safeIsoDate(value: unknown): string {
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  return new Date().toISOString();
}

export function getLastJobSyncAt(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(LAST_JOB_SYNC_KEY);
}

export function setLastJobSyncAt(value: string): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(LAST_JOB_SYNC_KEY, value);
}

export async function upsertJobs(rows: Array<Record<string, unknown>>): Promise<number> {
  if (rows.length === 0) {
    return 0;
  }

  const mapped: CachedJob[] = [];
  for (const row of rows) {
    const id = String(row.id ?? "").trim();
    if (!id) {
      continue;
    }

    const extractedData = row.extracted_data;
    mapped.push({
      id,
      status: String(row.status ?? "DRAFT"),
      client_name: String(row.client_name ?? (typeof extractedData === "object" && extractedData ? (extractedData as Record<string, unknown>).client ?? "" : "") ?? "Unknown Client"),
      date_scheduled:
        typeof row.date_scheduled === "string"
          ? row.date_scheduled
          : typeof extractedData === "object" && extractedData
            ? ((extractedData as Record<string, unknown>).scheduled_date as string | null | undefined) ?? null
            : null,
      sync_status: (String(row.sync_status ?? "synced") as SyncStatus) || "synced",
      created_at: safeIsoDate(row.created_at),
      updated_at: safeIsoDate(row.updated_at ?? row.created_at),
      extracted_data: typeof extractedData === "object" && extractedData ? (extractedData as Record<string, unknown>) : undefined,
      stale_at: now() + STALE_CACHE_MS,
    });
  }

  await db.jobs.bulkPut(mapped);
  return mapped.length;
}

export async function listJobsFromCache(): Promise<CachedJob[]> {
  return db.jobs.orderBy("updated_at").reverse().toArray();
}

export async function getJobFromCache(id: string): Promise<CachedJob | undefined> {
  return db.jobs.get(id);
}

export async function putJobInCache(job: CachedJob): Promise<void> {
  await db.jobs.put(job);
}

export async function upsertJobDetail(detail: Omit<CachedJobDetail, "updated_at">): Promise<void> {
  await db.job_details.put({
    ...detail,
    updated_at: now(),
  });
}

export async function getJobDetailFromCache(id: string): Promise<CachedJobDetail | undefined> {
  return db.job_details.get(id);
}

export async function deleteJobFromCache(id: string): Promise<void> {
  await db.jobs.delete(id);
}

export async function upsertClients(rows: CachedClient[]): Promise<void> {
  if (rows.length === 0) {
    return;
  }
  await db.clients.bulkPut(rows);
}

export async function upsertProducts(rows: CachedProduct[]): Promise<void> {
  if (rows.length === 0) {
    return;
  }
  await db.products.bulkPut(rows);
}

export async function enqueueSyncAction(
  item: Omit<SyncQueueItem, "id" | "created_at" | "updated_at" | "retry_count" | "status"> & {
    status?: SyncStatus;
  }
): Promise<number> {
  return db.sync_queue.add({
    entity_type: item.entity_type,
    action: item.action,
    payload: item.payload,
    status: item.status ?? "pending",
    created_at: now(),
    updated_at: now(),
    retry_count: 0,
  });
}

export async function getPendingSyncQueueItems(): Promise<SyncQueueItem[]> {
  return db.sync_queue.where("status").equals("pending").sortBy("created_at");
}

export async function markSyncQueueItemSynced(id: number): Promise<void> {
  await db.sync_queue.delete(id);
}

export async function markSyncQueueItemFailed(id: number, message: string): Promise<void> {
  const existing = await db.sync_queue.get(id);
  await db.sync_queue.update(id, {
    status: "failed",
    updated_at: now(),
    retry_count: (existing?.retry_count ?? 0) + 1,
    last_error: message.slice(0, 280),
  });
}

export async function resetSyncQueueItemToPending(id: number): Promise<void> {
  await db.sync_queue.update(id, {
    status: "pending",
    updated_at: now(),
  });
}

export async function getSyncQueueCounts(): Promise<{ pending: number; synced: number; failed: number }> {
  const rows = await db.sync_queue.toArray();
  return rows.reduce(
    (acc, row) => {
      if (row.status === "pending") acc.pending += 1;
      if (row.status === "synced") acc.synced += 1;
      if (row.status === "failed") acc.failed += 1;
      return acc;
    },
    { pending: 0, synced: 0, failed: 0 }
  );
}

export async function saveJobDraft(
  draft: Omit<JobDraft, "id" | "timestamp" | "sync_status"> & {
    sync_status?: SyncStatus;
  }
): Promise<number> {
  return db.jobDrafts.add({
    ...draft,
    timestamp: now(),
    sync_status: draft.sync_status ?? "pending",
  } satisfies JobDraft);
}

export async function getPendingDrafts(): Promise<JobDraft[]> {
  const rows = await db.jobDrafts.where("sync_status").equals("pending").toArray();
  return rows.sort((a, b) => a.timestamp - b.timestamp);
}

export async function updateDraft(draft: JobDraft): Promise<void> {
  if (typeof draft.id !== "number") {
    throw new Error("Draft id is required to update records.");
  }
  await db.jobDrafts.put(draft);
}

export async function getDraftCounts(): Promise<{ pending: number; synced: number; failed: number }> {
  const rows = (await db.jobDrafts.toArray()) ?? [];

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
