import { describe, expect, it } from "@jest/globals";

import {
  getCaptureStatusState,
  getPrimaryActionState,
  hasMeaningfulCaptureContent,
} from "@/app/capture/captureLogic";

describe("captureLogic", () => {
  it("detects meaningful content from trimmed voice text", () => {
    expect(hasMeaningfulCaptureContent("  fault note  ", "", "")).toBe(true);
    expect(hasMeaningfulCaptureContent("   ", "", "")).toBe(false);
  });

  it("detects meaningful content from audio or receipt payloads", () => {
    expect(hasMeaningfulCaptureContent("", "audio-b64", "")).toBe(true);
    expect(hasMeaningfulCaptureContent("", "", "receipt-b64")).toBe(true);
  });

  it("returns offline status when network is unavailable", () => {
    expect(getCaptureStatusState(false, 10)).toBe("offline");
  });

  it("returns syncing status when online and pending exists", () => {
    expect(getCaptureStatusState(true, 1)).toBe("syncing");
  });

  it("returns healthy status when online and no pending drafts", () => {
    expect(getCaptureStatusState(true, 0)).toBe("healthy");
  });

  it("disables action while saving/syncing/recording", () => {
    expect(
      getPrimaryActionState({
        isOnline: true,
        pendingCount: 3,
        isSavingDraft: true,
        isSyncingNow: false,
        isRecording: false,
        voiceText: "x",
        audioBlob: "",
        receiptBase64: "",
      }).disabled,
    ).toBe(true);

    expect(
      getPrimaryActionState({
        isOnline: true,
        pendingCount: 3,
        isSavingDraft: false,
        isSyncingNow: true,
        isRecording: false,
        voiceText: "x",
        audioBlob: "",
        receiptBase64: "",
      }).disabled,
    ).toBe(true);

    expect(
      getPrimaryActionState({
        isOnline: true,
        pendingCount: 3,
        isSavingDraft: false,
        isSyncingNow: false,
        isRecording: true,
        voiceText: "x",
        audioBlob: "",
        receiptBase64: "",
      }).disabled,
    ).toBe(true);
  });

  it("disables action when offline and no content", () => {
    const result = getPrimaryActionState({
      isOnline: false,
      pendingCount: 2,
      isSavingDraft: false,
      isSyncingNow: false,
      isRecording: false,
      voiceText: "   ",
      audioBlob: "",
      receiptBase64: "",
    });

    expect(result.disabled).toBe(true);
    expect(result.label).toBe("Save / Sync Now");
  });

  it("disables action when online with no content and no pending drafts", () => {
    const result = getPrimaryActionState({
      isOnline: true,
      pendingCount: 0,
      isSavingDraft: false,
      isSyncingNow: false,
      isRecording: false,
      voiceText: "",
      audioBlob: "",
      receiptBase64: "",
    });

    expect(result.disabled).toBe(true);
    expect(result.label).toBe("Save / Sync Now");
  });

  it("enables sync-only mode when online with pending drafts and no new content", () => {
    const result = getPrimaryActionState({
      isOnline: true,
      pendingCount: 2,
      isSavingDraft: false,
      isSyncingNow: false,
      isRecording: false,
      voiceText: "",
      audioBlob: "",
      receiptBase64: "",
    });

    expect(result.disabled).toBe(false);
    expect(result.label).toBe("Sync Pending Drafts");
  });

  it("enables save/sync mode when meaningful content exists", () => {
    const result = getPrimaryActionState({
      isOnline: false,
      pendingCount: 0,
      isSavingDraft: false,
      isSyncingNow: false,
      isRecording: false,
      voiceText: "Installed polarity test",
      audioBlob: "",
      receiptBase64: "",
    });

    expect(result.disabled).toBe(false);
    expect(result.label).toBe("Save / Sync Now");
  });
});
