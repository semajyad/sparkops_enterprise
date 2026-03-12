"use client";

import { Download, Loader2, Mic, Pencil, Square, Trash2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState, useRef, type FormEvent } from "react";

import { updateJob } from "@/app/actions/updateJob";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { apiFetch, parseApiJson } from "@/lib/api";
import { db } from "@/lib/db";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { useJob } from "@/hooks/useJob";
import { formatJobDate, isValidJobUuid, normalizeJobStatus, parseNumeric } from "@/lib/jobs";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

function statusBadgeClass(status: string): string {
  const normalized = normalizeJobStatus(status);
  if (normalized === "DONE") {
    return "border-green-500/40 bg-green-50 text-green-700";
  }

  if (normalized === "SYNCING") {
    return "border-orange-500/40 bg-orange-50 text-orange-700";
  }
  return "border-gray-300 bg-gray-50 text-gray-600";
}

type ComplianceChecklistItem = {
  label: string;
  key: "safety" | "photos" | "voice";
};

const CHECKLIST_CATALOG: ComplianceChecklistItem[] = [
  { key: "safety", label: "Safety Tests" },
  { key: "photos", label: "Photos" },
  { key: "voice", label: "Voice Note" },
];

const MODAL_INPUT_CLASS =
  "mt-0.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500";
const MODAL_LABEL_CLASS = "block text-xs font-medium text-gray-700 mb-0.5";

function toDateTimeLocal(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export function canEditJobForRole(role: string | null | undefined): boolean {
  const roleLabel = String(role ?? "").toUpperCase();
  return roleLabel.length > 0 && roleLabel !== "APPRENTICE";
}

function parseMissingChecklist(message: string): ComplianceChecklistItem[] {
  const normalized = message.toLowerCase();
  const matches = CHECKLIST_CATALOG.filter((item) => {
    if (item.key === "safety") {
      return (
        normalized.includes("earth loop") ||
        normalized.includes("polarity") ||
        normalized.includes("gas pressure") ||
        normalized.includes("water flow") ||
        normalized.includes("backflow") ||
        normalized.includes("safety")
      );
    }
    if (item.key === "photos") return normalized.includes("photo");
    if (item.key === "voice") return normalized.includes("voice");
    return false;
  });

  return matches.length > 0 ? matches : CHECKLIST_CATALOG;
}

export default function JobReviewPage(): React.JSX.Element {
  const { role } = useAuth();
  const params = useParams<{ id?: string | string[] }>();
  const routeId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const normalizedRouteId = typeof routeId === "string" ? routeId.trim() : "";
  const router = useRouter();
  const { job, isLoading, errorMessage, refresh } = useJob(normalizedRouteId);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isPushingToXero, setIsPushingToXero] = useState(false);
  const [isXeroModalOpen, setIsXeroModalOpen] = useState(false);
  const [localError, setLocalError] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [isComplianceModalOpen, setIsComplianceModalOpen] = useState(false);
  const [complianceChecklist, setComplianceChecklist] = useState<ComplianceChecklistItem[]>([]);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editClientName, setEditClientName] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editLatitude, setEditLatitude] = useState<number | null>(null);
  const [editLongitude, setEditLongitude] = useState<number | null>(null);
  const [editScheduledDate, setEditScheduledDate] = useState("");
  const [editCustomerEmail, setEditCustomerEmail] = useState("");
  const [editCustomerMobile, setEditCustomerMobile] = useState("");
  const [isEmailGateOpen, setIsEmailGateOpen] = useState(false);
  const [emailGateValue, setEmailGateValue] = useState("");
  const [isSavingEmailGate, setIsSavingEmailGate] = useState(false);
  const [isAppendingVoiceNote, setIsAppendingVoiceNote] = useState(false);
  const [isRecordingNote, setIsRecordingNote] = useState(false);
  const [appendedCount, setAppendedCount] = useState(0);
  const noteMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const noteStreamRef = useRef<MediaStream | null>(null);
  const noteRecognitionRef = useRef<SpeechRecognition | null>(null);
  const [noteInterim, setNoteInterim] = useState("");

  const guardrail = String(job?.compliance_status ?? "UNKNOWN").toUpperCase();
  const guardrailClass =
    guardrail === "GREEN_SHIELD"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
      : guardrail === "RED_SHIELD"
        ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
        : "border-amber-500/40 bg-amber-500/10 text-amber-200";

  async function downloadPdf(): Promise<void> {
    if (!job || !isValidJobUuid(job.id)) {
      return;
    }

    setIsDownloading(true);
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/jobs/${job.id}/pdf`);
      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || `PDF export failed (${response.status})`);
      }

      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `tradeops-invoice-${job.id}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(objectUrl);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Failed to download invoice PDF.");
    } finally {
      setIsDownloading(false);
    }
  }

  async function deleteJob(): Promise<void> {
    if (!job || isDeleting) {
      return;
    }

    if (!window.confirm("Are you sure you want to delete this job?")) {
      return;
    }

    const confirmed = window.confirm("Delete this job draft permanently?");
    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    setLocalError("");
    setToast("Draft Deleted");
    router.push("/jobs?deleted=1");

    try {
      const jobId = job.id;
      if (!isValidJobUuid(jobId)) {
        throw new Error("Invalid job id.");
      }
      const supabase = createClient();

      try {
        await db.drafts.delete(jobId);
      } catch {
        // Draft may already be gone; continue with scorched-earth deletion.
      }

      try {
        await db.jobs.delete(jobId);
        await db.job_details.delete(jobId);
      } catch {
        // Best effort: local cache cleanup must never block remote deletion.
      }

      try {
        await supabase.from("job_drafts").delete().eq("job_id", jobId);
      } catch {
        // Ignore missing draft rows or table mismatch; proceed with job delete.
      }

      await supabase.from("jobs").delete().eq("id", jobId);

      const response = await apiFetch(`${API_BASE_URL}/api/jobs/${jobId}`, {
        method: "DELETE",
      });
      if (!response.ok && response.status !== 404) {
        const body = await response.text();
        console.warn("Backend delete warning:", body || `Delete failed (${response.status})`);
      }

      if (response.status !== 404) {
        await parseApiJson<{ status: string; id: string }>(response);
      }
    } catch (deleteError) {
      console.warn("Delete fallback warning:", deleteError);
    } finally {
      setIsDeleting(false);
    }
  }

  function isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  }

  async function doCompleteJob(clientEmail: string): Promise<void> {
    setIsCompleting(true);
    setLocalError("");
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/jobs/${job!.id}/complete`, {
        method: "POST",
        body: JSON.stringify({ client_email: clientEmail }),
      });
      if (!response.ok) {
        let errMsg = "";
        const ct = response.headers.get("content-type")?.toLowerCase() ?? "";
        if (ct.includes("application/json")) {
          const payload = (await response.json()) as { error?: string };
          errMsg = typeof payload.error === "string" ? payload.error : "";
        } else {
          errMsg = await response.text();
        }
        if (response.status === 400 && errMsg.toLowerCase().startsWith("missing:")) {
          setComplianceChecklist(parseMissingChecklist(errMsg));
          setIsComplianceModalOpen(true);
          return;
        }
        throw new Error(errMsg || `Complete failed (${response.status})`);
      }
      setToast("\u2705 Certificate Sent to Client!");
      await refresh();
    } catch (completeError) {
      setLocalError(completeError instanceof Error ? completeError.message : "Unable to complete this job.");
    } finally {
      setIsCompleting(false);
    }
  }

  async function completeJob(): Promise<void> {
    if (!job || isCompleting) {
      return;
    }

    const existingEmail = (job.customer_email ?? job.client_email ?? "").trim();
    if (existingEmail && isValidEmail(existingEmail)) {
      await doCompleteJob(existingEmail.toLowerCase());
      return;
    }

    setEmailGateValue(existingEmail);
    setIsEmailGateOpen(true);
    setIsCompleting(false);
    setLocalError("");
  }

  async function pushToXero(): Promise<void> {
    if (!job || isPushingToXero) {
      return;
    }

    setIsPushingToXero(true);
    setLocalError("");
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/integrations/xero/push-invoice`, {
        method: "POST",
        body: JSON.stringify({ job_id: job.id }),
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || `Push to Xero failed (${response.status})`);
      }

      await parseApiJson<{ status: string }>(response);
      setToast("Invoice pushed to Xero.");
      setIsXeroModalOpen(false);
    } catch (pushError) {
      setLocalError(pushError instanceof Error ? pushError.message : "Unable to push invoice to Xero.");
    } finally {
      setIsPushingToXero(false);
    }
  }

  const lineItems = job?.extracted_data?.line_items ?? [];
  const invoiceSummary = job?.invoice_summary;
  const complianceSummary = job?.compliance_summary;
  const canEditJob = canEditJobForRole(role);

  function openEditModal(): void {
    if (!job) {
      return;
    }

    setEditClientName(job.extracted_data?.client ?? "");
    setEditTitle(job.extracted_data?.job_title ?? "");
    setEditAddress(job.extracted_data?.address ?? job.extracted_data?.location ?? "");
    setEditLatitude(parseNumeric(job.extracted_data?.latitude ?? 0) || null);
    setEditLongitude(parseNumeric(job.extracted_data?.longitude ?? 0) || null);
    setEditScheduledDate(toDateTimeLocal(job.extracted_data?.scheduled_date ?? null));
    setEditCustomerEmail(job.customer_email ?? job.client_email ?? "");
    setEditCustomerMobile(job.customer_mobile ?? "");
    setIsEditOpen(true);
    setLocalError("");
  }

  async function saveJobEdits(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!job || isSavingEdit) {
      return;
    }

    setIsSavingEdit(true);
    setLocalError("");

    const scheduledIso =
      editScheduledDate.trim().length > 0
        ? (() => {
            const parsed = new Date(editScheduledDate);
            return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
          })()
        : null;

    const nextAddress = editAddress.trim();
    const nextClient = editClientName.trim();
    const nextTitle = editTitle.trim();
    const nextLatitude = editLatitude ?? undefined;
    const nextLongitude = editLongitude ?? undefined;

    const nextCustomerEmail = editCustomerEmail.trim() || null;
    const nextCustomerMobile = editCustomerMobile.trim() || null;

    try {
      await updateJob({
        id: job.id,
        client_name: nextClient,
        title: nextTitle,
        location: nextAddress,
        address: nextAddress,
        latitude: editLatitude,
        longitude: editLongitude,
        scheduled_date: scheduledIso,
        customer_email: nextCustomerEmail,
        customer_mobile: nextCustomerMobile,
      });

      await db.jobs.update(job.id, {
        client_name: nextClient,
        date_scheduled: scheduledIso,
        customer_email: nextCustomerEmail,
        customer_mobile: nextCustomerMobile,
        extracted_data: {
          ...(job.extracted_data ?? {}),
          client: nextClient,
          job_title: nextTitle,
          address: nextAddress,
          location: nextAddress,
          latitude: nextLatitude,
          longitude: nextLongitude,
          scheduled_date: scheduledIso,
        },
      });
      await db.job_details.update(job.id, {
        customer_email: nextCustomerEmail,
        customer_mobile: nextCustomerMobile,
        extracted_data: {
          ...(job.extracted_data ?? {}),
          client: nextClient,
          job_title: nextTitle,
          address: nextAddress,
          location: nextAddress,
          latitude: nextLatitude,
          longitude: nextLongitude,
          scheduled_date: scheduledIso,
        },
      });

      const response = await apiFetch(`${API_BASE_URL}/api/jobs/${job.id}`, {
        method: "PUT",
        body: JSON.stringify({
          client_name: nextClient,
          title: nextTitle,
          location: nextAddress,
          address: nextAddress,
          latitude: editLatitude,
          longitude: editLongitude,
          scheduled_date: scheduledIso,
          customer_email: nextCustomerEmail,
          customer_mobile: nextCustomerMobile,
        }),
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || `Job update failed (${response.status})`);
      }

      await parseApiJson(response);
      setIsEditOpen(false);
      setToast("Job details updated.");
      await refresh();
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Unable to save job edits.");
    } finally {
      setIsSavingEdit(false);
    }
  }

  async function appendVoiceNoteText(text: string): Promise<void> {
    if (!job || !text.trim()) {
      return;
    }
    setIsAppendingVoiceNote(true);
    setLocalError("");
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/jobs/${job.id}/voice-note`, {
        method: "POST",
        body: JSON.stringify({ voice_note: text.trim() }),
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || `Voice note append failed (${response.status})`);
      }
      const payload = await parseApiJson<{
        raw_transcript: string;
        extracted_data: Record<string, unknown>;
      }>(response);
      await db.jobs.update(job.id, { extracted_data: payload.extracted_data });
      await db.job_details.update(job.id, {
        raw_transcript: payload.raw_transcript,
        extracted_data: payload.extracted_data,
      });
      setAppendedCount((c) => c + 1);
      setToast("Voice note appended.");
      await refresh();
    } catch (voiceError) {
      setLocalError(voiceError instanceof Error ? voiceError.message : "Unable to append voice note.");
    } finally {
      setIsAppendingVoiceNote(false);
    }
  }

  async function startNoteRecording(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      setLocalError("Microphone not supported on this device.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      noteStreamRef.current = stream;
      const chunks: Blob[] = [];
      const recorder = MediaRecorder.isTypeSupported("audio/webm")
        ? new MediaRecorder(stream, { mimeType: "audio/webm" })
        : new MediaRecorder(stream);

      if (typeof window !== "undefined") {
        const SpeechRecognitionConstructor = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognitionConstructor) {
          const recognition = new SpeechRecognitionConstructor();
          recognition.continuous = true;
          recognition.interimResults = true;
          let finalText = "";
          recognition.onresult = (event: SpeechRecognitionEvent) => {
            let interim = "";
            for (let i = event.resultIndex; i < event.results.length; ++i) {
              const r = event.results[i];
              if (r?.isFinal) {
                finalText += (r[0]?.transcript ?? "");
              } else if (r) {
                interim += (r[0]?.transcript ?? "");
              }
            }
            setNoteInterim(interim);
            recorder.onstop = async () => {
              recognition.stop();
              setNoteInterim("");
              const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
              stream.getTracks().forEach((t) => t.stop());
              noteStreamRef.current = null;
              if (finalText.trim()) {
                await appendVoiceNoteText(finalText.trim());
              } else if (blob.size > 0) {
                setToast("Recording captured (no speech detected).");
              }
            };
          };
          noteRecognitionRef.current = recognition;
          recognition.start();
        }
      }

      recorder.ondataavailable = (e: BlobEvent) => { if (e.data.size > 0) chunks.push(e.data); };
      if (!recorder.onstop) {
        recorder.onstop = async () => {
          const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
          stream.getTracks().forEach((t) => t.stop());
          noteStreamRef.current = null;
          if (blob.size > 0) {
            setToast("Recording captured (no speech transcribed).");
          }
        };
      }

      noteMediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecordingNote(true);
    } catch {
      setLocalError("Microphone access denied or unavailable.");
    }
  }

  function stopNoteRecording(): void {
    if (noteMediaRecorderRef.current && noteMediaRecorderRef.current.state !== "inactive") {
      noteMediaRecorderRef.current.stop();
    }
    setIsRecordingNote(false);
  }

  async function downloadComplianceDocs(): Promise<void> {
    if (!job || !isValidJobUuid(job.id)) {
      return;
    }
    setIsDownloading(true);
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/jobs/${job.id}/certificate.pdf`);
      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || `Compliance download failed (${response.status})`);
      }
      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `tradeops-certificate-${job.id}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(objectUrl);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Failed to download compliance document.");
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <main className="min-h-screen p-4 pb-24 text-gray-900 sm:p-6 md:p-10">
      <section className="mx-auto w-full max-w-5xl rounded-3xl border border-gray-200 bg-white p-6 shadow-sm md:p-8">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-orange-600">Job Details</p>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">{job?.extracted_data?.client ?? "Unknown Client"}</h1>
            {job ? <p className="mt-1 text-sm text-gray-500">{formatJobDate(job.created_at)}</p> : null}
          </div>
          <div className="flex items-center gap-1">
            {job ? (
              <span className={`mr-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${statusBadgeClass(job.status)}`}>
                {normalizeJobStatus(job.status)}
              </span>
            ) : null}
            {canEditJob ? (
              <button
                type="button"
                onClick={openEditModal}
                disabled={!job}
                className="text-gray-500 p-2 rounded-full hover:bg-gray-100 transition disabled:opacity-50"
                aria-label="Edit Job"
              >
                <Pencil className="h-5 w-5" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void deleteJob()}
              disabled={isDeleting}
              className="text-gray-500 p-2 rounded-full hover:bg-red-50 hover:text-red-600 transition disabled:opacity-50"
              aria-label="Delete Job"
            >
              {isDeleting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Trash2 className="h-5 w-5" />}
            </button>
          </div>
        </header>

        {isLoading ? (
          <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600">
            <Loader2 className="h-4 w-4 animate-spin text-orange-600" />
            Loading job draft...
          </div>
        ) : job ? (
          <>
            <details className="rounded-xl border border-gray-200 bg-white p-4" open>
              <summary className="cursor-pointer text-sm font-semibold text-gray-900">Voice Note</summary>
              <p className="mt-3 whitespace-pre-wrap text-sm text-gray-600">{job.raw_transcript || "No transcript found."}</p>
              {noteInterim ? (
                <p className="mt-2 text-sm italic text-gray-400">{noteInterim}</p>
              ) : null}
              <div className="mt-4 flex items-center gap-3">
                {!isRecordingNote ? (
                  <button
                    type="button"
                    onClick={() => void startNoteRecording()}
                    disabled={isAppendingVoiceNote}
                    className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-orange-500/80 bg-orange-50 text-orange-600 shadow transition hover:bg-orange-100 disabled:opacity-50"
                    aria-label="Record voice note"
                  >
                    <Mic className="h-5 w-5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopNoteRecording}
                    className="inline-flex h-12 w-12 animate-pulse items-center justify-center rounded-full border border-red-500/80 bg-red-50 text-red-600 shadow transition hover:bg-red-100"
                    aria-label="Stop recording"
                  >
                    <Square className="h-5 w-5 fill-current" />
                  </button>
                )}
                <div className="flex flex-col gap-0.5">
                  <p className="text-sm font-medium text-gray-700">
                    {isRecordingNote ? "Recording... tap to stop" : "Tap to add voice note"}
                  </p>
                  {isAppendingVoiceNote ? (
                    <p className="flex items-center gap-1 text-xs text-orange-600">
                      <Loader2 className="h-3 w-3 animate-spin" /> Appending...
                    </p>
                  ) : appendedCount > 0 ? (
                    <p className="text-xs text-green-600">✓ {appendedCount} note{appendedCount > 1 ? "s" : ""} appended</p>
                  ) : null}
                </div>
              </div>
            </details>

            {invoiceSummary ? (
              <section className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Draft Invoice Total</h2>
                <div className="mt-3 grid gap-2 text-sm text-gray-700 sm:grid-cols-2">
                  <p>Subtotal: <span className="font-semibold text-gray-900">${parseNumeric(invoiceSummary.subtotal).toFixed(2)}</span></p>
                  <p>Markup: <span className="font-semibold text-orange-700">${parseNumeric(invoiceSummary.markup_amount).toFixed(2)}</span></p>
                  <p>GST (15%): <span className="font-semibold text-gray-900">${parseNumeric(invoiceSummary.gst).toFixed(2)}</span></p>
                  <p>Total: <span className="font-semibold text-green-700">${parseNumeric(invoiceSummary.total).toFixed(2)}</span></p>
                </div>
              </section>
            ) : null}

            {complianceSummary ? (
              <section className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Compliance Summary</h2>
                <p className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${guardrailClass}`}>
                  {guardrail.replaceAll("_", " ")}
                </p>
                <p className="mt-2 text-sm text-gray-600">{complianceSummary.notes || "No compliance summary available."}</p>
                {Array.isArray(complianceSummary.missing_items) && complianceSummary.missing_items.length > 0 ? (
                  <div className="mt-3 rounded-lg border border-orange-300 bg-orange-50 p-3 text-xs text-orange-700">
                    Missing safety evidence: {complianceSummary.missing_items.join(", ")}
                  </div>
                ) : (
                  <div className="mt-3 rounded-lg border border-green-300 bg-green-50 p-3 text-xs text-green-700">
                    Mandatory tests detected for RoI/CoC draft.
                  </div>
                )}
              </section>
            ) : null}

            <section className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Detected Items</h2>
              <div className="mt-3 space-y-3">
                {Array.isArray((job.extracted_data as Record<string, unknown>)?.detected_items) && ((job.extracted_data as Record<string, unknown>).detected_items as unknown[]).length > 0 ? (
                  ((job.extracted_data as Record<string, unknown>).detected_items as Record<string, unknown>[]).map((item, idx: number) => {
                    const priceRaw = Number(item.total_price);
                    const qtyRaw = Number(item.quantity);
                    const isCurrency = !Number.isNaN(priceRaw);
                    const formattedTotal = isCurrency ? `$${priceRaw.toFixed(2)}` : String(item.total_price || "--");
                    const formattedQty = !Number.isNaN(qtyRaw) ? String(qtyRaw) : String(item.quantity || "1");

                    return (
                      <div key={idx} className="flex flex-col gap-1 rounded-xl border border-gray-100 bg-gray-50 p-3 shadow-sm md:grid md:grid-cols-12 md:items-center md:gap-4 md:bg-white md:p-2 md:shadow-none">
                        {/* Mobile: Top Row / Desktop: Col 1 */}
                        <div className="md:col-span-6 flex flex-col md:flex-row md:items-center gap-1 md:gap-3">
                          <span className="inline-block w-fit rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-700 md:w-16 md:text-center">
                            {String(item.type || "OTHER")}
                          </span>
                          <span className="text-sm font-bold text-gray-900 md:font-medium">{String(item.description || "Unknown Item")}</span>
                        </div>

                        {/* Mobile: Bottom Row / Desktop: Cols 2-3 */}
                        <div className="flex justify-between md:col-span-6 md:grid md:grid-cols-6 md:gap-4 text-xs md:text-sm text-gray-500 md:text-gray-900 mt-1 md:mt-0">
                          <span className="md:col-span-2 text-left">Qty: {formattedQty}</span>
                          <span className="md:col-span-4 text-right font-medium text-gray-900 md:font-normal">{formattedTotal}</span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="py-4 text-center text-sm text-gray-400">No items detected</p>
                )}
              </div>
            </section>

            <div className="mt-6 flex flex-col gap-3 border-t border-gray-200 pt-4 sm:flex-row sm:justify-end">
              {role === "OWNER" && normalizeJobStatus(job.status) === "DONE" ? (
                <button
                  type="button"
                  onClick={() => setIsXeroModalOpen(true)}
                  disabled={isPushingToXero}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:border-orange-500 hover:text-orange-600 disabled:opacity-50"
                >
                  {isPushingToXero ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Push to Xero
                </button>
              ) : null}

              {normalizeJobStatus(job.status) === "DONE" ? (
                <button
                  type="button"
                  onClick={() => void downloadComplianceDocs()}
                  disabled={isDownloading}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
                >
                  {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  Download Compliance Docs
                </button>
              ) : null}

              <button
                type="button"
                onClick={() => void downloadPdf()}
                disabled={isDownloading}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
              >
                {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Download Invoice PDF
              </button>

              <button
                type="button"
                onClick={() => void completeJob()}
                disabled={isCompleting || !job}
                className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-50 ${
                  guardrail === "GREEN_SHIELD" ? "bg-green-600 hover:bg-green-700" : "bg-orange-600 hover:bg-orange-700"
                }`}
              >
                {isCompleting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Complete Job
              </button>
            </div>

            {toast ? <p className="mt-3 rounded-xl border border-green-300 bg-green-50 p-3 text-sm text-green-700">{toast}</p> : null}
          </>
        ) : null}

        {isXeroModalOpen ? (
          <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/60 p-4">
            <section className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white shadow-xl">
              <div className="border-b border-gray-200 px-5 py-4">
                <h2 className="text-xl font-semibold text-gray-900">Push to Xero Preview</h2>
              </div>
              <div className="p-5">
                <p className="text-sm text-gray-600">This will push the following items to your Xero account as a Draft Invoice.</p>

                <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-100 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                        <th className="px-3 py-2">Item</th>
                        <th className="px-3 py-2">Qty</th>
                        <th className="px-3 py-2">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {lineItems.map((item, index) => {
                        const qty = parseNumeric(item.qty || 0);
                        const lineTotal = parseNumeric(item.line_total || 0);
                        const unitPrice = parseNumeric(item.unit_price || 0);
                        const inferredValue = lineTotal > 0 ? lineTotal : qty * unitPrice;
                        return (
                          <tr key={`xero-${index}`} className="bg-white">
                            <td className="px-3 py-2">
                              <span className="font-medium text-gray-900">{item.description ?? "Unnamed"}</span>
                              <span className="ml-2 inline-flex rounded-full border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                                {String(item.type ?? "LABOR").toUpperCase()}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-gray-600">{qty.toFixed(2)}</td>
                            <td className="px-3 py-2 font-medium text-gray-900">{inferredValue > 0 ? `$${inferredValue.toFixed(2)}` : "-"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {lineItems.length === 0 ? (
                  <p className="mt-2 text-xs text-red-600 font-semibold">Warning: No line items found. Empty invoice will be created.</p>
                ) : null}
              </div>
              <div className="flex items-center justify-end gap-3 border-t border-gray-200 bg-gray-50 px-5 py-4 rounded-b-2xl">
                <button
                  type="button"
                  onClick={() => setIsXeroModalOpen(false)}
                  className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void pushToXero()}
                  disabled={isPushingToXero}
                  className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-700 disabled:opacity-50"
                >
                  {isPushingToXero ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Confirm Push to Xero
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {isComplianceModalOpen ? (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
            <section className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-5 shadow-xl">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-600">Job Completion Blocked</p>
              <h2 className="mt-2 text-xl font-semibold text-gray-900">Missing compliance evidence</h2>
              <p className="mt-2 text-sm text-gray-600">Add the missing checklist items from Capture, then complete this job again.</p>

              <ul className="mt-4 space-y-2">
                {complianceChecklist.map((item) => (
                  <li key={item.key}>
                    <button
                      type="button"
                      onClick={() => {
                        setIsComplianceModalOpen(false);
                        router.push("/capture");
                      }}
                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-left text-sm font-semibold text-gray-700 transition hover:border-orange-500/60"
                    >
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>

              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsComplianceModalOpen(false)}
                  className="min-h-11 rounded-xl border border-gray-300 px-4 py-2 text-sm text-gray-700"
                >
                  Close
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {isEditOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <section className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-xl">
              <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 pb-3">
                <h2 className="text-xl font-semibold text-gray-900">Edit Job</h2>
                <button
                  type="button"
                  onClick={() => setIsEditOpen(false)}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-gray-300 text-gray-600"
                  aria-label="Close edit job form"
                >
                  ×
                </button>
              </div>

              <form className="grid grid-cols-2 gap-4 px-4 py-4" onSubmit={(event) => void saveJobEdits(event)}>
                <label className={`${MODAL_LABEL_CLASS} col-span-2`}>
                  Client Name
                  <input
                    type="text"
                    required
                    value={editClientName}
                    onChange={(event) => setEditClientName(event.target.value)}
                    className={MODAL_INPUT_CLASS}
                    placeholder="ACME Properties"
                  />
                </label>

                <label className={MODAL_LABEL_CLASS}>
                  Job Title
                  <input
                    type="text"
                    required
                    value={editTitle}
                    onChange={(event) => setEditTitle(event.target.value)}
                    className={MODAL_INPUT_CLASS}
                    placeholder="Switchboard inspection and repairs"
                  />
                </label>

                <label className={MODAL_LABEL_CLASS}>
                  Address
                  <AddressAutocomplete
                    id="edit-job-address"
                    value={editAddress}
                    onChange={(next) => {
                      setEditAddress(next);
                      setEditLatitude(null);
                      setEditLongitude(null);
                    }}
                    onSelect={(selection) => {
                      setEditAddress(selection.place_name);
                      setEditLatitude(selection.lat);
                      setEditLongitude(selection.lng);
                    }}
                    placeholder="Start typing an address"
                    className={MODAL_INPUT_CLASS}
                  />
                </label>

                <div className="col-span-2 grid grid-cols-2 gap-4">
                  <label className={MODAL_LABEL_CLASS}>
                    Customer Email
                    <input
                      type="email"
                      value={editCustomerEmail}
                      onChange={(event) => setEditCustomerEmail(event.target.value)}
                      className={MODAL_INPUT_CLASS}
                      placeholder="client@email.com"
                    />
                  </label>
                  <label className={MODAL_LABEL_CLASS}>
                    Customer Mobile
                    <input
                      type="tel"
                      value={editCustomerMobile}
                      onChange={(event) => setEditCustomerMobile(event.target.value)}
                      className={MODAL_INPUT_CLASS}
                      placeholder="+64 21 000 0000"
                    />
                  </label>
                </div>

                <label className={`${MODAL_LABEL_CLASS} col-span-2`}>
                  Scheduled Date
                  <input
                    type="datetime-local"
                    value={editScheduledDate}
                    onChange={(event) => setEditScheduledDate(event.target.value)}
                    className={MODAL_INPUT_CLASS}
                  />
                </label>

                <div className="col-span-2 mt-2 border-t border-gray-200 pt-4">
                  <button
                    type="submit"
                    disabled={isSavingEdit}
                    className="w-full rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-700 disabled:opacity-60"
                  >
                    {isSavingEdit ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </form>
            </section>
          </div>
        ) : null}

        {isEmailGateOpen ? (
          <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/60 p-4">
            <section className="w-full max-w-sm rounded-2xl border border-orange-200 bg-white p-5 shadow-xl">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-600">Email Required</p>
              <h2 className="mt-2 text-lg font-semibold text-gray-900">Customer Email is required to send the invoice and compliance documents.</h2>
              <label className="mt-4 block text-sm font-medium text-gray-700">
                Customer Email
                <input
                  type="email"
                  required
                  autoFocus
                  value={emailGateValue}
                  onChange={(event) => setEmailGateValue(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-orange-500 focus:outline-none"
                  placeholder="client@example.com"
                />
              </label>
              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEmailGateOpen(false)}
                  className="rounded-xl border border-gray-300 px-4 py-2 text-sm text-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSavingEmailGate || !emailGateValue.trim()}
                  onClick={async () => {
                    if (!job || !emailGateValue.trim() || !isValidEmail(emailGateValue)) {
                      setLocalError("Please enter a valid email address.");
                      return;
                    }
                    setIsSavingEmailGate(true);
                    try {
                      await updateJob({
                        id: job.id,
                        client_name: job.extracted_data?.client ?? "",
                        title: job.extracted_data?.job_title ?? "",
                        location: job.extracted_data?.address ?? "",
                        address: job.extracted_data?.address ?? "",
                        latitude: parseNumeric(job.extracted_data?.latitude ?? 0) || null,
                        longitude: parseNumeric(job.extracted_data?.longitude ?? 0) || null,
                        scheduled_date: job.extracted_data?.scheduled_date ?? null,
                        customer_email: emailGateValue.trim().toLowerCase(),
                      });
                      await db.jobs.update(job.id, { customer_email: emailGateValue.trim().toLowerCase() });
                      await db.job_details.update(job.id, { customer_email: emailGateValue.trim().toLowerCase() });
                      setIsEmailGateOpen(false);
                      await doCompleteJob(emailGateValue.trim().toLowerCase());
                    } catch (gateError) {
                      setLocalError(gateError instanceof Error ? gateError.message : "Unable to save email.");
                    } finally {
                      setIsSavingEmailGate(false);
                    }
                  }}
                  className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {isSavingEmailGate ? "Saving..." : "Save & Complete"}
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {errorMessage || localError ? (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{localError || errorMessage}</p>
        ) : null}
      </section>
    </main>
  );
}
