"use client";



import { Camera, FileUp, Loader2, Mic, RefreshCw, Square, Timer, Upload } from "lucide-react";
import Image from "next/image";

import { motion, useReducedMotion } from "framer-motion";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";



import { useSync } from "@/components/SyncProvider";

import { useAuth } from "@/lib/auth";

import { apiFetch } from "@/lib/api";

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

  const { session } = useAuth();



  const [voiceText, setVoiceText] = useState("");

  const [audioBlob, setAudioBlob] = useState<string>("");

  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);

  const [isRecording, setIsRecording] = useState(false);

  const [receiptBase64, setReceiptBase64] = useState<string>("");

  const [receiptPreview, setReceiptPreview] = useState<string>("");

  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string>("");

  const [isSavingDraft, setIsSavingDraft] = useState(false);

  const [isSyncingNow, setIsSyncingNow] = useState(false);

  const [statusMessage, setStatusMessage] = useState("");
  const [syncHint, setSyncHint] = useState<string | null>(null);
  const [safetyChips, setSafetyChips] = useState<Array<{ type: string; value?: string | null; unit?: string | null; result?: string | null }>>([]);
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);

  const mediaRecorder = useRef<MediaRecorder | null>(null);

  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const recordingStreamRef = useRef<MediaStream | null>(null);

  const reduceMotion = useReducedMotion();
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [timerStartedAt, setTimerStartedAt] = useState<number | null>(null);
  const [timerSeconds, setTimerSeconds] = useState(0);



  const syncIndicator = useMemo(() => {
    if (isSyncing || isSyncingNow) {
      return {
        colorClass: "bg-amber-400",
        pulseClass: "animate-pulse",
        label: "Sync status: Syncing",
        hint: "Syncing changes to cloud...",
      };
    }

    if (!isOnline) {
      return {
        colorClass: "bg-rose-500",
        pulseClass: "",
        label: "Sync status: Offline",
        hint: "Offline - changes are saved locally.",
      };
    }

    return {
      colorClass: "bg-emerald-400",
      pulseClass: "",
      label: "Sync status: All saved",
      hint: "All changes saved to cloud.",
    };
  }, [isOnline, isSyncing, isSyncingNow]);



  async function uploadAudioToIngest(audioBase64: string): Promise<void> {

    if (!session?.access_token) {

      throw new Error("You must be logged in to upload capture data.");

    }



    const response = await apiFetch(`${API_BASE_URL}/api/ingest`, {

      method: "POST",

      body: JSON.stringify({

        audio_base64: audioBase64,

        gps_lat: gps?.lat,

        gps_lng: gps?.lng,

      }),

    });



    if (!response.ok) {

      const body = await response.text();

      throw new Error(body || `Ingest failed with status ${response.status}`);

    }

    const payload = (await response.json()) as {

      extracted_data?: { safety_tests?: Array<{ type?: string; value?: string; unit?: string; result?: string }> };

    };

    const tests = Array.isArray(payload.extracted_data?.safety_tests) ? payload.extracted_data?.safety_tests : [];

    setSafetyChips(

      tests.map((row) => ({

        type: String(row.type ?? "Safety Test"),

        value: row.value ?? null,

        unit: row.unit ?? null,

        result: row.result ?? null,

      }))

    );

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



  async function handleAttachmentFile(event: ChangeEvent<HTMLInputElement>, kind: "photo" | "file"): Promise<void> {

    const file = event.target.files?.[0];

    if (!file) {

      return;

    }



    const base64 = await fileToBase64(file);

    setReceiptBase64(base64);

    if (kind === "photo") {
      setReceiptPreview(`data:${file.type || "image/jpeg"};base64,${base64}`);
      setStatusMessage("Photo attached and preview ready.");
    } else {
      setReceiptPreview("");
      setStatusMessage(`File attached: ${file.name}`);
    }

  }

  function toggleTimer(): void {
    if (isTimerRunning) {
      setIsTimerRunning(false);
      setStatusMessage(`Timer stopped at ${Math.floor(timerSeconds / 60)}m ${timerSeconds % 60}s.`);
      return;
    }
    setTimerStartedAt(Date.now() - timerSeconds * 1000);
    setIsTimerRunning(true);
    setStatusMessage("Timer started.");
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



  useEffect(() => {

    if (!navigator.geolocation) {

      return;

    }

    const watchId = navigator.geolocation.watchPosition(

      (position) => {

        setGps({ lat: position.coords.latitude, lng: position.coords.longitude });

      },

      () => {

        setGps(null);

      },

      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }

    );

    return () => navigator.geolocation.clearWatch(watchId);

  }, []);

  useEffect(() => {
    if (!isTimerRunning || timerStartedAt === null) {
      return;
    }

    const interval = window.setInterval(() => {
      setTimerSeconds(Math.max(0, Math.floor((Date.now() - timerStartedAt) / 1000)));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isTimerRunning, timerStartedAt]);

  useEffect(() => {
    if (!syncHint) {
      return;
    }
    const timer = window.setTimeout(() => setSyncHint(null), 1800);
    return () => window.clearTimeout(timer);
  }, [syncHint]);




  return (

    <main className="min-h-screen bg-slate-950 p-4 pb-24 text-slate-100 sm:p-6 md:p-10">

      <section className="mx-auto flex w-full max-w-3xl flex-col gap-5 rounded-3xl border border-slate-700/80 bg-slate-900/90 p-5 shadow-2xl shadow-black/40 backdrop-blur sm:p-6 md:p-8">

        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

          <div>

            <p className="text-xs uppercase tracking-[0.24em] text-amber-400">Capture Console</p>

            <h1 className="text-3xl font-bold tracking-tight text-white">Field Capture</h1>

          </div>

          <div className="relative flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSyncHint(syncIndicator.hint)}
              aria-label={syncIndicator.label}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full"
            >
              <span className={`h-2 w-2 rounded-full ${syncIndicator.colorClass} ${syncIndicator.pulseClass}`} aria-hidden="true"></span>
            </button>
            {pendingCount > 0 ? <span className="text-xs text-slate-400">{pendingCount} pending</span> : null}
            {syncHint ? (
              <p className="absolute right-0 top-12 z-20 whitespace-nowrap rounded-lg border border-slate-700 bg-slate-950/95 px-3 py-2 text-xs text-slate-200 shadow-lg shadow-black/50">
                {syncHint}
              </p>
            ) : null}
          </div>

        </header>

        <section className="rounded-2xl border border-slate-700 bg-slate-950/50 p-5 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-300">Voice First</p>
          <p className="mt-2 text-sm text-slate-300">Tap the mic and speak your job notes naturally.</p>

          <div className="mt-5 flex justify-center">
            {!isRecording ? (
              <motion.button
                type="button"
                onClick={() => void startRecording()}
                className="inline-flex h-36 w-36 items-center justify-center rounded-full border border-amber-400/80 bg-amber-500/20 text-amber-100 shadow-2xl shadow-amber-500/25"
                animate={reduceMotion ? undefined : { scale: [1, 1.08, 1] }}
                transition={reduceMotion ? undefined : { duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                whileTap={reduceMotion ? undefined : { scale: 0.95 }}
              >
                <span className="sr-only">Start recording</span>
                <Mic className="h-14 w-14" />
              </motion.button>
            ) : (
              <motion.button
                type="button"
                onClick={stopRecording}
                className="inline-flex h-36 w-36 items-center justify-center rounded-full border border-rose-500/80 bg-rose-500/20 text-rose-100 shadow-2xl shadow-rose-500/25"
                animate={reduceMotion ? undefined : { scale: [1, 0.93, 1] }}
                transition={reduceMotion ? undefined : { duration: 1.05, repeat: Infinity, ease: "easeInOut" }}
                whileTap={reduceMotion ? undefined : { scale: 0.95 }}
              >
                <span className="sr-only">Stop recording</span>
                <Square className="h-14 w-14" />
              </motion.button>
            )}
          </div>

          <p className="mt-3 text-sm text-slate-300">{isRecording ? "Recording... tap to stop" : "Ready. Tap to start"}</p>

          {audioPreviewUrl ? (
            <div className="mt-4 rounded-lg border border-slate-700 bg-slate-900/70 p-3 text-left">
              <p className="mb-2 text-xs text-slate-300">Playback Preview</p>
              <audio controls src={audioPreviewUrl} className="w-full" />
              <p className="mt-2 text-xs text-slate-400">Captured chunks: {audioChunks.length}</p>
            </div>
          ) : null}

          {safetyChips.length > 0 ? (
            <section className="mt-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-left">
              <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200">Safety Chips</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {safetyChips.map((chip, index) => (
                  <span key={`${chip.type}-${index}`} className="inline-flex min-h-11 items-center rounded-full border border-emerald-400/50 bg-slate-950/70 px-3 py-1.5 text-xs text-emerald-100">
                    {chip.type}: {chip.result || chip.value || "Recorded"}
                    {chip.value && chip.unit ? ` ${chip.unit}` : ""}
                  </span>
                ))}
              </div>
            </section>
          ) : null}
        </section>

        <section className="rounded-2xl border border-slate-700 bg-slate-900/50 p-4 pb-[max(env(safe-area-inset-bottom),1.75rem)]">
          <p className="text-sm font-semibold text-slate-200">Quick Attach</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              className="inline-flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl border border-slate-500 bg-slate-800/90 px-3 py-2 text-slate-100 transition hover:border-amber-400"
            >
              <Camera className="h-4 w-4 text-amber-300" />
              <span className="text-[10px] font-semibold uppercase tracking-wide">Photo</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl border border-slate-500 bg-slate-800/90 px-3 py-2 text-slate-100 transition hover:border-amber-400"
            >
              <FileUp className="h-4 w-4 text-amber-300" />
              <span className="text-[10px] font-semibold uppercase tracking-wide">Invoice</span>
            </button>

            <button
              type="button"
              onClick={toggleTimer}
              className={`inline-flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl border px-3 py-2 text-slate-100 transition ${
                isTimerRunning
                  ? "border-emerald-400/70 bg-emerald-500/20"
                  : "border-slate-500 bg-slate-800/90 hover:border-amber-400"
              }`}
            >
              <Timer className="h-4 w-4 text-amber-300" />
              <span className="text-[10px] font-semibold uppercase tracking-wide">Timer</span>
            </button>
          </div>

          <input
            ref={photoInputRef}
            className="hidden"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(event) => void handleAttachmentFile(event, "photo")}
          />

          <input
            ref={fileInputRef}
            className="hidden"
            type="file"
            accept=".pdf,.doc,.docx,image/*"
            onChange={(event) => void handleAttachmentFile(event, "file")}
          />

          {receiptPreview ? (
            <div className="mt-3 overflow-hidden rounded-xl border border-slate-700">
              <Image src={receiptPreview} alt="Attachment preview" width={640} height={288} className="h-36 w-full object-cover" />
            </div>
          ) : null}

          <p className="mt-3 text-xs text-slate-400">Timer: {Math.floor(timerSeconds / 60)}m {timerSeconds % 60}s</p>
        </section>

        <label className="text-sm font-semibold text-slate-200" htmlFor="voiceText">

          Voice Notes (Text)

        </label>

        <textarea

          id="voiceText"

          value={voiceText}

          onChange={(event) => void handleVoiceChange(event)}

          placeholder="Optional: add extra notes after voice capture"

          className="min-h-28 rounded-xl border border-slate-700 bg-slate-900/50 p-4 text-base text-white placeholder:text-slate-400 focus:border-amber-500 focus:outline-none"

        />



        {!isOnline ? (
          <button
            type="button"
            onClick={() => void saveOfflineDraft()}
            disabled={isSavingDraft || isRecording || !hasMeaningfulContent()}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-amber-500 px-6 py-4 text-lg font-bold text-slate-950 transition hover:bg-amber-400 active:opacity-80 disabled:opacity-50"
          >

            {isSavingDraft ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}

            Save Draft Offline Now

          </button>
        ) : null}



        {isOnline && pendingCount > 0 ? (
          <button
            type="button"
            onClick={() => void handleForceSync()}
            disabled={isSyncingNow || isRecording}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-600 bg-slate-800/80 px-4 py-3 text-sm font-semibold text-white transition hover:border-amber-500/60 hover:text-amber-200 active:opacity-80 disabled:opacity-50"
          >

            {isSyncingNow ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}

            Force Sync Pending Drafts

          </button>
        ) : null}



        {statusMessage ? <p className="rounded-xl border border-slate-700 bg-slate-900/70 p-3 text-sm text-slate-200">{statusMessage}</p> : null}

      </section>

    </main>

  );

}

