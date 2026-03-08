import { beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";

type DraftRow = {
  id: number;
  timestamp: number;
  voice_text?: string;
  audio_blob_base64?: string;
  receipt_image_base64?: string;
  sync_status: "pending" | "synced" | "failed";
};

type ApiResponseLike = {
  ok: boolean;
  status: number;
};

const getPendingDrafts = jest.fn<() => Promise<DraftRow[]>>();
const updateDraft = jest.fn<(draft: DraftRow) => Promise<void>>();
const apiFetch = jest.fn<(input: string, init?: RequestInit) => Promise<ApiResponseLike>>();

jest.mock("@/lib/db", () => ({
  getPendingDrafts,
  updateDraft,
}));

jest.mock("@/lib/api", () => ({
  apiFetch,
}));

let scheduleBackgroundSync: () => Promise<void>;
let syncPendingDrafts: () => Promise<{ synced: number; attempted: number }>;

describe("syncManager", () => {
  beforeAll(async () => {
    const syncModule = await import("@/lib/syncManager");
    scheduleBackgroundSync = syncModule.scheduleBackgroundSync;
    syncPendingDrafts = syncModule.syncPendingDrafts;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("marks empty drafts as failed and skips API call", async () => {
    getPendingDrafts.mockResolvedValue([
      {
        id: 11,
        timestamp: Date.now(),
        voice_text: "   ",
        audio_blob_base64: "",
        receipt_image_base64: "",
        sync_status: "pending",
      },
    ]);

    const result = await syncPendingDrafts();

    expect(result).toEqual({ synced: 0, attempted: 1 });
    expect(updateDraft).toHaveBeenCalledWith(expect.objectContaining({ id: 11, sync_status: "failed" }));
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("marks synced drafts and strips heavy payload fields", async () => {
    getPendingDrafts.mockResolvedValue([
      {
        id: 22,
        timestamp: Date.now(),
        voice_text: "Install RCD",
        audio_blob_base64: "abc",
        receipt_image_base64: "xyz",
        sync_status: "pending",
      },
    ]);
    apiFetch.mockResolvedValue({ ok: true, status: 200 });

    const result = await syncPendingDrafts();

    expect(result).toEqual({ synced: 1, attempted: 1 });
    expect(apiFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/ingest"),
      expect.objectContaining({ method: "POST" })
    );
    expect(updateDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 22,
        sync_status: "synced",
        audio_blob_base64: undefined,
        receipt_image_base64: undefined,
      })
    );
  });

  it("marks 4xx responses as failed and continues", async () => {
    getPendingDrafts.mockResolvedValue([
      {
        id: 33,
        timestamp: Date.now(),
        voice_text: "Install switch",
        sync_status: "pending",
      },
    ]);
    apiFetch.mockResolvedValue({ ok: false, status: 401 });

    const result = await syncPendingDrafts();

    expect(result).toEqual({ synced: 0, attempted: 1 });
    expect(updateDraft).toHaveBeenCalledWith(expect.objectContaining({ id: 33, sync_status: "failed" }));
  });

  it("continues when ingest request throws network error", async () => {
    getPendingDrafts.mockResolvedValue([
      {
        id: 44,
        timestamp: Date.now(),
        voice_text: "Install socket",
        sync_status: "pending",
      },
    ]);
    apiFetch.mockRejectedValue(new Error("network down"));

    const result = await syncPendingDrafts();

    expect(result).toEqual({ synced: 0, attempted: 1 });
    expect(updateDraft).not.toHaveBeenCalledWith(expect.objectContaining({ id: 44, sync_status: "synced" }));
  });

  it("does not mark draft failed for 5xx responses", async () => {
    getPendingDrafts.mockResolvedValue([
      {
        id: 45,
        timestamp: Date.now(),
        voice_text: "Install board",
        sync_status: "pending",
      },
    ]);
    apiFetch.mockResolvedValue({ ok: false, status: 500 });

    const result = await syncPendingDrafts();

    expect(result).toEqual({ synced: 0, attempted: 1 });
    expect(updateDraft).not.toHaveBeenCalledWith(expect.objectContaining({ id: 45, sync_status: "failed" }));
  });

  it("registers background sync when service worker supports sync", async () => {
    const register = jest.fn(async () => undefined);
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        serviceWorker: {
          ready: Promise.resolve({ sync: { register } }),
        },
      },
    });

    await scheduleBackgroundSync();

    expect(register).toHaveBeenCalledWith("sparkops-sync");
  });

  it("exits without error when sync API is unavailable", async () => {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        serviceWorker: {
          ready: Promise.resolve({}),
        },
      },
    });

    await expect(scheduleBackgroundSync()).resolves.toBeUndefined();
  });

  it("returns early when service workers are unavailable", async () => {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {},
    });

    await expect(scheduleBackgroundSync()).resolves.toBeUndefined();
  });

  it("returns early when window is undefined", async () => {
    const previousWindow = globalThis.window;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: undefined,
    });

    await expect(scheduleBackgroundSync()).resolves.toBeUndefined();

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: previousWindow,
    });
  });
});
