export type CapturePrimaryActionInput = {
  isOnline: boolean;
  pendingCount: number;
  isSavingDraft: boolean;
  isSyncingNow: boolean;
  isRecording: boolean;
  voiceText: string;
  audioBlob: string;
  receiptBase64: string;
};

export function hasMeaningfulCaptureContent(
  voiceText: string,
  audioBlob: string,
  receiptBase64: string,
): boolean {
  return Boolean(voiceText.trim() || audioBlob || receiptBase64);
}

export function getCaptureStatusState(isOnline: boolean, pendingCount: number): "offline" | "syncing" | "healthy" {
  if (!isOnline) {
    return "offline";
  }
  if (pendingCount > 0) {
    return "syncing";
  }
  return "healthy";
}

export function getPrimaryActionState(input: CapturePrimaryActionInput): {
  disabled: boolean;
  label: "Save / Sync Now" | "Sync Pending Drafts";
} {
  const hasContent = hasMeaningfulCaptureContent(input.voiceText, input.audioBlob, input.receiptBase64);

  const disabled =
    input.isSavingDraft ||
    input.isSyncingNow ||
    input.isRecording ||
    (!hasContent && (!input.isOnline || input.pendingCount === 0));

  const label = hasContent ? "Save / Sync Now" : input.isOnline && input.pendingCount > 0 ? "Sync Pending Drafts" : "Save / Sync Now";

  return { disabled, label };
}
