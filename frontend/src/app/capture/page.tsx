"use client";



import { Camera, FileUp, Loader2, Mic, RefreshCw, Square, Timer, Upload } from "lucide-react";
import Image from "next/image";

import { motion, useReducedMotion } from "framer-motion";

import { ChangeEvent, useEffect, useRef, useState } from "react";



import { useSync } from "@/components/SyncProvider";

import { useAuth } from "@/lib/auth";

import { apiFetch } from "@/lib/api";

import { saveJobDraft } from "@/lib/db";

import { syncPendingDrafts } from "@/lib/syncManager";
import { getPrimaryActionState, hasMeaningfulCaptureContent } from "@/app/capture/captureLogic";



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

  const { isOnline, pendingCount, refreshCounts } = useSync();

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
  const [safetyChips, setSafetyChips] = useState<Array<{ type: string; value?: string | null; unit?: string | null; result?: string | null }>>([]);
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [jobHours, setJobHours] = useState<number>(0);
  const [jobMinutes, setJobMinutes] = useState<number>(0);

  const mediaRecorder = useRef<MediaRecorder | null>(null);

  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const recordingStreamRef = useRef<MediaStream | null>(null);

  const reduceMotion = useReducedMotion();
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [timerStartedAt, setTimerStartedAt] = useState<number | null>(null);
  const [timerSeconds, setTimerSeconds] = useState(0);

  const primaryActionState = getPrimaryActionState({
    isOnline,
    pendingCount,
    isSavingDraft,
    isSyncingNow,
    isRecording,
    voiceText,
    audioBlob,
    receiptBase64,
  });



  async function uploadAudioToSave(audioBase64: string): Promise<void> {

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

      throw new Error(body || `Save failed with status ${response.status}`);

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

    return hasMeaningfulCaptureContent(voiceText, audioBlob, receiptBase64);

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

          await uploadAudioToSave(base64);

          setStatusMessage("Audio captured and saved successfully.");

        } catch {

          setStatusMessage("Audio captured, but save upload failed.");

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

  return (

    <main className="min-h-screen bg-gray-50 p-4 text-gray-900 sm:p-6 md:p-10">
      <div className="pb-8">

      <section className="relative mx-auto flex w-full max-w-3xl flex-col gap-5 rounded-3xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6 md:p-8">

        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

          <div>

            <p className="text-xs uppercase tracking-[0.24em] text-orange-600">Capture Console</p>

            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Field Capture</h1>

          </div>

          <span
            className={`absolute right-4 top-4 h-3 w-3 rounded-full ${
              isOnline && pendingCount === 0 ? "bg-green-400" : "bg-orange-400"
            }`}
            aria-label={isOnline && pendingCount === 0 ? "Capture status: healthy" : "Capture status: pending or offline"}
          />

        </header>

        <section className="rounded-2xl border border-gray-200 bg-gray-50 p-5 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-600">Voice First</p>
          <p className="mt-2 text-sm text-gray-600">Tap the mic and speak your job notes naturally.</p>

          <div className="mt-5 flex justify-center">
            {!isRecording ? (
              <motion.button
                type="button"
                onClick={() => void startRecording()}
                className="relative inline-flex h-32 w-32 items-center justify-center rounded-full border border-orange-500/80 bg-orange-50 text-orange-600 shadow-lg"
                animate={reduceMotion ? undefined : { scale: [1, 1.05, 1] }}
                transition={reduceMotion ? undefined : { duration: 2, repeat: Infinity, ease: "easeInOut" }}
                whileTap={reduceMotion ? undefined : { scale: 0.95 }}
              >
                <span className="sr-only">Start recording</span>
                <motion.span
                  className="absolute h-32 w-32 rounded-full"
                  animate={reduceMotion ? undefined : { boxShadow: ["0 0 0 0 rgba(249,115,22,0.45)", "0 0 0 18px rgba(249,115,22,0)"] }}
                  transition={reduceMotion ? undefined : { duration: 2, repeat: Infinity, ease: "easeOut" }}
                />
                <Mic className="h-14 w-14" />
              </motion.button>
            ) : (
              <motion.button
                type="button"
                onClick={stopRecording}
                className="relative inline-flex h-32 w-32 items-center justify-center rounded-full border border-red-500/80 bg-red-50 text-red-600 shadow-lg"
                animate={reduceMotion ? undefined : { scale: [1, 0.93, 1] }}
                transition={reduceMotion ? undefined : { duration: 1.05, repeat: Infinity, ease: "easeInOut" }}
                whileTap={reduceMotion ? undefined : { scale: 0.95 }}
              >
                <span className="sr-only">Stop recording</span>
                <Square className="h-14 w-14" />
              </motion.button>
            )}
          </div>

          <p className="mt-3 text-sm text-gray-600">{isRecording ? "Recording... tap to stop" : "Ready. Tap to start"}</p>

          {audioPreviewUrl ? (
            <div className="mt-4 rounded-lg border border-gray-200 bg-white p-3 text-left">
              <p className="mb-2 text-xs text-gray-600">Playback Preview</p>
              <audio controls src={audioPreviewUrl} className="w-full" />
              <p className="mt-2 text-xs text-gray-500">Captured chunks: {audioChunks.length}</p>
            </div>
          ) : null}

          {safetyChips.length > 0 ? (
            <section className="mt-4 rounded-xl border border-green-500/40 bg-green-50 p-3 text-left">
              <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-green-700">Safety Chips</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {safetyChips.map((chip, index) => (
                  <span key={`${chip.type}-${index}`} className="inline-flex min-h-11 items-center rounded-full border border-green-400/50 bg-white px-3 py-1.5 text-xs text-green-700">
                    {chip.type}: {chip.result || chip.value || "Recorded"}
                    {chip.value && chip.unit ? ` ${chip.unit}` : ""}
                  </span>
                ))}
              </div>
            </section>
          ) : null}
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-4 pb-[max(env(safe-area-inset-bottom),1.75rem)]">
          <p className="text-sm font-semibold text-gray-900">Attach Invoice</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              className="inline-flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 text-gray-700 transition hover:border-orange-500"
            >
              <Camera className="h-4 w-4 text-orange-600" />
              <span className="text-[10px] font-semibold uppercase tracking-wide">Photo</span>
            </button>

            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              className="inline-flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 text-gray-700 transition hover:border-orange-500"
            >
              <Camera className="h-4 w-4 text-orange-600" />
              <span className="text-[10px] font-semibold uppercase tracking-wide">Screenshot</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 text-gray-700 transition hover:border-orange-500"
            >
              <FileUp className="h-4 w-4 text-orange-600" />
              <span className="text-[10px] font-semibold uppercase tracking-wide">File</span>
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
            <div className="mt-3 overflow-hidden rounded-xl border border-gray-200">
              <Image src={receiptPreview} alt="Attachment preview" width={640} height={288} className="h-36 w-full object-cover" />
            </div>
          ) : null}
        </section>

        {/* Job Length Section */}
        <section className="rounded-2xl border border-gray-200 bg-white p-4">
          <p className="text-sm font-semibold text-gray-900">Job Length</p>
          <p className="mt-1 text-xs text-gray-500">Select labour time for invoice calculation</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Hours</label>
              <select
                value={jobHours}
                onChange={(e) => setJobHours(Number(e.target.value))}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-orange-500 focus:outline-none"
              >
                {Array.from({ length: 13 }, (_, i) => (
                  <option key={i} value={i}>{i}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Minutes</label>
              <select
                value={jobMinutes}
                onChange={(e) => setJobMinutes(Number(e.target.value))}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-orange-500 focus:outline-none"
              >
                {Array.from({ length: 60 }, (_, i) => (
                  <option key={i} value={i}>{i}</option>
                ))}
              </select>
            </div>
          </div>
          {(jobHours > 0 || jobMinutes > 0) && (
            <p className="mt-2 text-xs text-orange-600 font-medium">
              Total time: {jobHours}h {jobMinutes}m
            </p>
          )}
        </section>

        <label className="text-sm font-semibold text-gray-900" htmlFor="voiceText">

          Voice Notes (Text)

        </label>

        <textarea

          id="voiceText"

          value={voiceText}

          onChange={(event) => void handleVoiceChange(event)}

          placeholder="Optional: add extra notes after voice capture"

          className="min-h-28 rounded-xl border border-gray-300 bg-white p-4 text-base text-gray-900 placeholder:text-gray-400 focus:border-orange-500 focus:outline-none"

        />

        {/* Save/Action Button */}
        <div className="mt-4">
          <button
            type="button"
            onClick={() =>
              void (hasMeaningfulContent()
                ? saveOfflineDraft()
                : isOnline && pendingCount > 0
                  ? handleForceSync()
                  : Promise.resolve())
            }
            disabled={primaryActionState.disabled}
            className="w-full min-h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-orange-600 px-6 py-4 text-lg font-bold text-white transition hover:bg-orange-700 active:opacity-80 disabled:opacity-50"
          >
            {isSavingDraft || isSyncingNow ? <Loader2 className="h-5 w-5 animate-spin" /> : isOnline ? <RefreshCw className="h-5 w-5" /> : <Upload className="h-5 w-5" />}
            {primaryActionState.label}
          </button>

          {isOnline && pendingCount > 0 && !hasMeaningfulContent() ? (
            <button
              type="button"
              onClick={() => void handleForceSync()}
              disabled={isSyncingNow || isRecording}
              className="mt-2 w-full inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-gray-300 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-700 transition hover:border-orange-500 hover:text-orange-600 active:opacity-80 disabled:opacity-50"
            >
              {isSyncingNow ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Force Sync Pending Drafts
            </button>
          ) : null}

          {statusMessage ? <p className="mt-2 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">{statusMessage}</p> : null}
        </div>

      </section>
      </div>

    </main>

  );

}

