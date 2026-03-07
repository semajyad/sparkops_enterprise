import { describe, expect, it } from "@jest/globals";

import { getPendingDrafts, saveJobDraft, updateDraft } from "@/lib/db";

describe("IndexedDB JobDraft storage", () => {
  it("saves a draft as pending and returns it via pending query", async () => {
    await saveJobDraft({ voice_text: "Hori in the cupboard" });

    const pending = await getPendingDrafts();

    expect(pending.length).toBeGreaterThan(0);
    expect(pending.some((row) => row.voice_text === "Hori in the cupboard")).toBe(true);
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
});
