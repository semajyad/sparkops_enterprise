import { describe, expect, it } from "@jest/globals";

import { getDraftCounts, getPendingDrafts, saveJobDraft, updateDraft } from "@/lib/db";

describe("IndexedDB JobDraft storage", () => {
  it("saves a draft as pending and returns it via pending query", async () => {
    await saveJobDraft({ voice_text: "Hot water cylinder in cupboard" });

    const pending = await getPendingDrafts();

    expect(pending.length).toBeGreaterThan(0);
    expect(pending.some((row) => row.voice_text === "Hot water cylinder in cupboard")).toBe(true);
  });

  it("updates existing draft and allows status transition", async () => {
    const id = await saveJobDraft({
      voice_text: "Receipt captured",
      receipt_image_base64: "abc123",
    });

    await updateDraft({
      id,
      timestamp: Date.now(),
      voice_text: "Receipt captured",
      receipt_image_base64: undefined,
      sync_status: "synced",
    });

    const pending = await getPendingDrafts();
    expect(pending.find((row) => row.id === id)).toBeUndefined();
  });

  it("throws when attempting to update a draft without numeric id", async () => {
    await expect(
      updateDraft({
        timestamp: Date.now(),
        voice_text: "broken",
        sync_status: "pending",
      })
    ).rejects.toThrow("Draft id is required");
  });

  it("aggregates pending/synced/failed counts", async () => {
    const pendingId = await saveJobDraft({ voice_text: "pending row" });
    const syncedId = await saveJobDraft({ voice_text: "synced row" });
    const failedId = await saveJobDraft({ voice_text: "failed row" });

    await updateDraft({
      id: pendingId,
      timestamp: Date.now(),
      voice_text: "pending row",
      sync_status: "pending",
    });
    await updateDraft({
      id: syncedId,
      timestamp: Date.now(),
      voice_text: "synced row",
      sync_status: "synced",
    });
    await updateDraft({
      id: failedId,
      timestamp: Date.now(),
      voice_text: "failed row",
      sync_status: "failed",
    });

    const counts = await getDraftCounts();
    expect(counts.pending).toBeGreaterThanOrEqual(1);
    expect(counts.synced).toBeGreaterThanOrEqual(1);
    expect(counts.failed).toBeGreaterThanOrEqual(1);
  });
});
