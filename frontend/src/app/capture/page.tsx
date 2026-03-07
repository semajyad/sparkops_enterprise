"use client";

/**
 * Capture UI for offline-first SparkOps job drafting.
 */

import { ChangeEvent, useContext, useMemo, useState } from "react";

import { SyncContext } from "@/components/SyncProvider";
import { saveJobDraft, updateDraft } from "@/lib/db";

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Failed to convert file to base64."));
        return;
      }

      const [, base64 = ""] = result.split(",");
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

type DraftBuffer = {
  id?: number;
  voice_text?: string;
  audio_blob_base64?: string;
  receipt_image_base64?: string;
};

export default function CapturePage() {
  const { isOnline, isSyncing, pendingCount, triggerSync, refreshCounts } = useContext(SyncContext);

  const [voiceText, setVoiceText] = useState("");
  const [audioBase64, setAudioBase64] = useState<string | undefined>(undefined);
  const [receiptBase64, setReceiptBase64] = useState<string | undefined>(undefined);
  const [draftBuffer, setDraftBuffer] = useState<DraftBuffer>({});
  const [statusMessage, setStatusMessage] = useState("Ready for offline capture.");

  const networkLabel = useMemo(() => {
    if (isSyncing) {
      return "Syncing";
    }
    return isOnline ? "Online" : "Offline";
  }, [isOnline, isSyncing]);

  async function persistDraft(nextBuffer: DraftBuffer): Promise<DraftBuffer> {
    const payload = {
      voice_text: nextBuffer.voice_text,
      audio_blob_base64: nextBuffer.audio_blob_base64,
      receipt_image_base64: nextBuffer.receipt_image_base64,
    };

    if (typeof nextBuffer.id === "number") {
      await updateDraft({
        id: nextBuffer.id,
        timestamp: Date.now(),
        sync_status: "pending",
        ...payload,
      });
      return nextBuffer;
    }

    const id = await saveJobDraft(payload);
    return { ...nextBuffer, id };
  }

  function hasMeaningfulContent(buffer: DraftBuffer): boolean {
    return Boolean(
      buffer.voice_text?.trim() ||
        buffer.audio_blob_base64 ||
        buffer.receipt_image_base64
    );
  }

  const statusClass = useMemo(() => {
    if (isSyncing) {
      return "bg-amber-500 text-amber-950";
    }
    if (isOnline) {
      return "bg-emerald-500 text-emerald-950";
    }
    return "bg-rose-500 text-rose-950";
  }, [isOnline, isSyncing]);

  async function handleAudioFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const base64 = await toBase64(file);
    setAudioBase64(base64);
    const nextBuffer: DraftBuffer = {
      ...draftBuffer,
      voice_text: voiceText.trim() || undefined,
      audio_blob_base64: base64,
      receipt_image_base64: receiptBase64,
    };
    const persisted = await persistDraft(nextBuffer);
    setDraftBuffer(persisted);
    setStatusMessage("Audio captured and saved to IndexedDB instantly.");
    await refreshCounts();
  }

  async function handleReceiptFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const base64 = await toBase64(file);
    setReceiptBase64(base64);
    const nextBuffer: DraftBuffer = {
      ...draftBuffer,
      voice_text: voiceText.trim() || undefined,
      audio_blob_base64: audioBase64,
      receipt_image_base64: base64,
    };
    const persisted = await persistDraft(nextBuffer);
    setDraftBuffer(persisted);
    setStatusMessage("Receipt captured and saved to IndexedDB instantly.");
    await refreshCounts();
  }

  async function handleVoiceChange(event: ChangeEvent<HTMLTextAreaElement>): Promise<void> {
    const value = event.target.value;
    setVoiceText(value);

    const nextBuffer: DraftBuffer = {
      ...draftBuffer,
      voice_text: value.trim() || undefined,
      audio_blob_base64: audioBase64,
      receipt_image_base64: receiptBase64,
    };

    if (!hasMeaningfulContent(nextBuffer)) {
      return;
    }

    const persisted = await persistDraft(nextBuffer);
    setDraftBuffer(persisted);
    setStatusMessage("Voice text cached locally for zombie-mode safety.");
    await refreshCounts();
  }

  async function saveOfflineDraft(): Promise<void> {
    const nextBuffer: DraftBuffer = {
      ...draftBuffer,
      voice_text: voiceText.trim() || undefined,
      audio_blob_base64: audioBase64,
      receipt_image_base64: receiptBase64,
    };

    if (!hasMeaningfulContent(nextBuffer)) {
      setStatusMessage("Add voice text, audio, or receipt before saving.");
      return;
    }

    const persisted = await persistDraft(nextBuffer);
    setDraftBuffer(persisted);

    setStatusMessage("Draft persisted locally and queued for sync.");
    setVoiceText("");
    setAudioBase64(undefined);
    setReceiptBase64(undefined);
    setDraftBuffer({});
    await refreshCounts();

    if (isOnline) {
      void triggerSync();
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#284b63_0%,_#0d1b2a_40%,_#0b111c_100%)] p-6 text-slate-100 md:p-10">
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 rounded-3xl border border-white/20 bg-white/5 p-6 backdrop-blur md:p-8">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-cyan-200/80">SparkOps Basement Interface</p>
            <h1 className="text-3xl font-bold tracking-tight text-white">Capture Job Data Instantly</h1>
          </div>
          <div className={`rounded-full px-4 py-2 text-sm font-semibold ${statusClass}`}>
            {networkLabel} · {pendingCount} pending
          </div>
        </header>

        <label className="text-sm font-semibold text-cyan-100" htmlFor="voiceText">
          Voice Notes (text)
        </label>
        <textarea
          id="voiceText"
          value={voiceText}
          onChange={(event) => void handleVoiceChange(event)}
          placeholder="e.g. Chucked a Hori in the cupboard, swapped breaker, tested circuits"
          className="min-h-32 rounded-2xl border border-white/20 bg-black/30 p-4 text-base text-white placeholder:text-slate-400 focus:border-cyan-300 focus:outline-none"
        />

        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-cyan-200/60 bg-cyan-500/10 p-6 text-center transition hover:bg-cyan-500/20">
            <span className="text-lg font-bold">Record Voice</span>
            <span className="mt-1 text-sm text-cyan-100/80">Capture audio clip</span>
            <input className="hidden" type="file" accept="audio/*" capture="user" onChange={handleAudioFile} />
          </label>

          <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-emerald-200/60 bg-emerald-500/10 p-6 text-center transition hover:bg-emerald-500/20">
            <span className="text-lg font-bold">Scan Receipt</span>
            <span className="mt-1 text-sm text-emerald-100/80">Upload or snap image</span>
            <input className="hidden" type="file" accept="image/*" capture="environment" onChange={handleReceiptFile} />
          </label>
        </div>

        <button
          type="button"
          onClick={saveOfflineDraft}
          className="rounded-2xl bg-gradient-to-r from-cyan-400 to-emerald-400 px-6 py-4 text-lg font-bold text-slate-950 shadow-[0_8px_30px_rgba(45,212,191,0.35)] transition hover:scale-[1.01]"
        >
          Save Draft Offline Now
        </button>

        <button
          type="button"
          onClick={() => void triggerSync()}
          className="rounded-2xl border border-white/25 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
        >
          Force Sync Pending Drafts
        </button>

        <p className="rounded-xl bg-black/30 p-3 text-sm text-slate-200">{statusMessage}</p>
      </section>
    </main>
  );
}
