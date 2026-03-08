"use client";

import { Loader2, Mic, Square, Upload } from "lucide-react";
import { ChangeEvent, FormEvent, useMemo, useRef, useState } from "react";

import { apiFetch } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Unable to parse file."));
        return;
      }
      const [, base64 = ""] = result.split(",");
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function DashboardIngestPanel(): React.JSX.Element {
  const supabase = useMemo(() => createClient(), []);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [voiceNotes, setVoiceNotes] = useState("");
  const [audioBase64, setAudioBase64] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleAudioUpload(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const base64 = await blobToBase64(file);
    setAudioBase64(base64);
    setMessage(`Loaded ${file.name}. Ready to ingest.`);
  }

  async function startRecording(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage("Recording is not supported in this browser.");
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const chunks: Blob[] = [];
    const recorder = MediaRecorder.isTypeSupported("audio/webm")
      ? new MediaRecorder(stream, { mimeType: "audio/webm" })
      : new MediaRecorder(stream);

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    recorder.onstop = async () => {
      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      const base64 = await blobToBase64(blob);
      setAudioBase64(base64);
      setMessage("Recording captured. Ready to ingest.");
      stream.getTracks().forEach((track) => track.stop());
      mediaRecorderRef.current = null;
    };

    mediaRecorderRef.current = recorder;
    recorder.start();
    setIsRecording(true);
    setMessage("Recording in progress...");
  }

  function stopRecording(): void {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      return;
    }

    recorder.stop();
    setIsRecording(false);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setMessage(null);

    if (!voiceNotes.trim() && !audioBase64) {
      setMessage("Add voice notes, upload audio, or record audio before ingest.");
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setMessage("No active session found. Please sign in again.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/ingest`, {
        method: "POST",
        body: JSON.stringify({
          voice_notes: voiceNotes.trim() || undefined,
          audio_base64: audioBase64 || undefined,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || `Ingest failed with status ${response.status}`);
      }

      setVoiceNotes("");
      setAudioBase64("");
      setMessage("Ingest queued successfully.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to submit ingest payload.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-900/60 p-5">
      <h2 className="text-lg font-semibold text-white">Data Factory Ingest</h2>
      <p className="mt-1 text-sm text-slate-300">Upload an audio file or record a job note and send it straight to /api/ingest.</p>

      <form className="mt-4 space-y-4" onSubmit={(event) => void onSubmit(event)}>
        <label className="block text-sm text-slate-200" htmlFor="dashboard-voice-notes">
          Voice Notes
          <textarea
            id="dashboard-voice-notes"
            value={voiceNotes}
            onChange={(event) => setVoiceNotes(event.target.value)}
            placeholder="Installed new submain, verified insulation resistance, and labelled DB."
            className="mt-2 min-h-24 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
          />
        </label>

        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200">
          <Upload className="h-4 w-4 text-emerald-300" />
          Upload Audio File
          <input type="file" accept="audio/*" className="hidden" onChange={(event) => void handleAudioUpload(event)} />
        </label>

        <div className="flex gap-2">
          {!isRecording ? (
            <button
              type="button"
              onClick={() => void startRecording()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-emerald-400"
            >
              <Mic className="h-4 w-4" />
              Record Audio
            </button>
          ) : (
            <button
              type="button"
              onClick={stopRecording}
              className="inline-flex items-center gap-2 rounded-xl border border-rose-500/70 bg-rose-500/20 px-4 py-2 text-sm font-semibold text-rose-100"
            >
              <Square className="h-4 w-4" />
              Stop Recording
            </button>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-50"
        >
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Send to Ingest
        </button>
      </form>

      {message ? <p className="mt-3 text-sm text-slate-300">{message}</p> : null}
    </section>
  );
}
