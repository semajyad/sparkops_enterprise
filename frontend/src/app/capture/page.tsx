"use client";

import { Camera, Loader2, Mic, RefreshCw, Square, Upload } from "lucide-react";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

import { useSync } from "@/components/SyncProvider";
import { saveJobDraft } from "@/lib/db";
import { syncPendingDrafts } from "@/lib/syncManager";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

function fileToBase64(file: Blob): Promise<string> {
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

export default function CapturePage() {
  const { isOnline, isSyncing, pendingCount, refreshCounts } = useSync();

  const [voiceText, setVoiceText] = useState("");
  const [audioBlob, setAudioBlob] = useState<string>("");
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [receiptBase64, setReceiptBase64] = useState<string>("");
  const [receiptPreview, setReceiptPreview] = useState<string>("");
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string>("");
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isSyncingNow, setIsSyncingNow] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Ready for offline capture.");
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);

  const networkLabel = useMemo(() => {
    if (isSyncing) {
      return "Syncing";
    }
    return isOnline ? "Online" : "Offline";
  }, [isOnline, isSyncing]);

  async function uploadAudioToIngest(audioBase64: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        audio_base64: audioBase64,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(body || `Ingest failed with status ${response.status}`);
    }
  }

  useEffect(() => {
    return () => {
      if (audioPreviewUrl) {
        URL.revokeObjectURL(audioPreviewUrl);
      }
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [audioPreviewUrl]);

  function hasMeaningfulContent(): boolean {
    return Boolean(voiceText.trim() || audioBlob || receiptBase64);
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

  async function startRecording(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatusMessage("This browser does not support microphone recording.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingStreamRef.current = stream;
      const recorder = MediaRecorder.isTypeSupported("audio/webm")
        ? new MediaRecorder(stream, { mimeType: "audio/webm" })
        : new MediaRecorder(stream);
      const chunks: Blob[] = [];
      setAudioChunks([]);

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
          setAudioChunks((prev) => [...prev, event.data]);
        }
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        const base64 = await fileToBase64(blob);
        setAudioBlob(base64);

        if (audioPreviewUrl) {
          URL.revokeObjectURL(audioPreviewUrl);
        }
        setAudioPreviewUrl(URL.createObjectURL(blob));

        recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null;

        try {
          await uploadAudioToIngest(base64);
          setStatusMessage("Audio captured and sent to ingest successfully.");
        } catch {
          setStatusMessage("Audio captured, but ingest upload failed.");
        }
      };

      mediaRecorder.current = recorder;
      recorder.start();
      setIsRecording(true);
      setStatusMessage("Recording in progress...");
    } catch {
      setStatusMessage("Microphone access denied or unavailable.");
      setIsRecording(false);
    }
  }

  function stopRecording(): void {
    if (!mediaRecorder.current || mediaRecorder.current.state === "inactive") {
      return;
    }
    mediaRecorder.current.stop();
    setIsRecording(false);
  }

  async function handleReceiptFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const base64 = await fileToBase64(file);
    setReceiptBase64(base64);
    setReceiptPreview(`data:${file.type || "image/jpeg"};base64,${base64}`);
    setStatusMessage("Receipt image captured and preview ready.");
  }

  function handleVoiceChange(event: ChangeEvent<HTMLTextAreaElement>): void {
    const value = event.target.value;
    setVoiceText(value);
  }

  async function saveOfflineDraft(): Promise<void> {
    if (!hasMeaningfulContent()) {
      setStatusMessage("Add voice text, audio, or receipt before saving.");
      return;
    }

    setIsSavingDraft(true);
    try {
      await saveJobDraft({
        voice_text: voiceText.trim() || undefined,
        audio_blob_base64: audioBlob || undefined,
        receipt_image_base64: receiptBase64 || undefined,
        sync_status: "pending",
      });

      setVoiceText("");
      setAudioBlob("");
      setAudioChunks([]);
      setReceiptBase64("");
      setReceiptPreview("");
      if (audioPreviewUrl) {
        URL.revokeObjectURL(audioPreviewUrl);
      }
      setAudioPreviewUrl("");

      setStatusMessage("Draft saved offline and queued for sync.");
      await refreshCounts();
      window.alert("Draft Saved");
    } finally {
      setIsSavingDraft(false);
    }
  }

  async function handleForceSync(): Promise<void> {
    setIsSyncingNow(true);
    setStatusMessage("Syncing pending drafts...");
    try {
      if (!window.navigator.onLine) {
        throw new Error("offline");
      }
      const result = await syncPendingDrafts();
      await refreshCounts();
      setStatusMessage("Pending drafts sync complete.");
      window.alert(`Sync Complete: ${result.synced} drafts uploaded.`);
    } catch {
      setStatusMessage("Sync failed. Please try again.");
      window.alert("Sync Failed: Check network connection.");
    } finally {
      setIsSyncingNow(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-900 p-4 text-slate-100 sm:p-6 md:p-10">
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-5 rounded-2xl border border-slate-700 bg-slate-800 p-5 shadow-2xl shadow-slate-950/50 sm:p-6 md:p-8">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-slate-300">SparkOps Basement Interface</p>
            <h1 className="text-3xl font-bold tracking-tight text-white">Capture Job Data Instantly</h1>
          </div>
          <div className={`rounded-full px-4 py-2 text-sm font-semibold ${statusClass}`}>
            {networkLabel} · {pendingCount} pending
          </div>
        </header>

        <label className="text-sm font-semibold text-slate-200" htmlFor="voiceText">
          Voice Notes (text)
        </label>
        <textarea
          id="voiceText"
          value={voiceText}
          onChange={(event) => void handleVoiceChange(event)}
          placeholder="e.g. Chucked a Hori in the cupboard, swapped breaker, tested circuits"
          className="min-h-32 rounded-xl border border-slate-700 bg-slate-900/70 p-4 text-base text-white placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none"
        />

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-slate-700 bg-slate-800/80 p-4">
            <p className="text-sm font-semibold text-slate-200">Voice Recording</p>

            {isRecording ? (
              <div className="mt-3 flex items-center gap-3 rounded-lg border border-rose-500/50 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
                <span className="inline-flex h-2.5 w-2.5 animate-pulse rounded-full bg-rose-500" />
                Recording...
              </div>
            ) : null}

            <div className="mt-3 flex gap-2">
              {!isRecording ? (
                <button
                  type="button"
                  onClick={() => void startRecording()}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-600 bg-slate-700 px-4 py-3 text-sm font-semibold transition hover:opacity-90 active:opacity-80 disabled:opacity-50"
                >
                  <Mic className="h-4 w-4" />
                  Record Voice
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopRecording}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-rose-500/60 bg-rose-500/20 px-4 py-3 text-sm font-semibold transition hover:opacity-90 active:opacity-80 disabled:opacity-50"
                >
                  <Square className="h-4 w-4" />
                  Stop Recording
                </button>
              )}
            </div>

            {audioPreviewUrl ? (
              <div className="mt-3 rounded-lg border border-slate-700 bg-slate-900/70 p-3">
                <p className="mb-2 text-xs text-slate-300">Playback Preview</p>
                <audio controls src={audioPreviewUrl} className="w-full" />
                <p className="mt-2 text-xs text-slate-400">Captured chunks: {audioChunks.length}</p>
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-800/80 p-4">
            <p className="text-sm font-semibold text-slate-200">Receipt Capture</p>

            {receiptPreview ? (
              <div className="mt-3 overflow-hidden rounded-xl border border-slate-700">
                <img src={receiptPreview} alt="Receipt preview" className="h-36 w-full object-cover" />
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-600 bg-slate-700 px-4 py-3 text-sm font-semibold transition hover:opacity-90 active:opacity-80 disabled:opacity-50"
            >
              {receiptPreview ? <Upload className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
              {receiptPreview ? "Replace Receipt" : "Scan Receipt"}
            </button>
            <input
              ref={imageInputRef}
              className="hidden"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(event) => void handleReceiptFile(event)}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => void saveOfflineDraft()}
          disabled={isSavingDraft || isRecording || !hasMeaningfulContent()}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-4 text-lg font-bold text-white transition hover:bg-emerald-500 active:opacity-80 disabled:opacity-50"
        >
          {isSavingDraft ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
          Save Draft Offline Now
        </button>

        <button
          type="button"
          onClick={() => void handleForceSync()}
          disabled={isSyncingNow || isRecording || pendingCount === 0}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-600 bg-slate-700 px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 active:opacity-80 disabled:opacity-50"
        >
          {isSyncingNow ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Force Sync Pending Drafts
        </button>

        <p className="rounded-xl border border-slate-700 bg-slate-900/70 p-3 text-sm text-slate-200">{statusMessage}</p>
      </section>
    </main>
  );
}
