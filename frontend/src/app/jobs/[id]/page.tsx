"use client";

import { Download, Loader2, Pencil, Trash2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

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
  "mt-1 min-h-12 w-full rounded-lg border border-gray-300 bg-white px-3 text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500";
const MODAL_LABEL_CLASS = "text-xs font-bold uppercase tracking-[0.12em] text-gray-500";

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

  async function completeJob(): Promise<void> {
    if (!job || isCompleting) {
      return;
    }

    const existingEmail = (job.client_email ?? "").trim();
    const promptedEmail = existingEmail || window.prompt("Client email is required to send certificate:", "") || "";
    const clientEmail = promptedEmail.trim().toLowerCase();
    if (!clientEmail) {
      setLocalError("Client email is required before completing this job.");
      return;
    }

    setIsCompleting(true);
    setLocalError("");

    try {
      const response = await apiFetch(`${API_BASE_URL}/api/jobs/${job.id}/complete`, {
        method: "POST",
        body: JSON.stringify({ client_email: clientEmail }),
      });
      if (!response.ok) {
        let errorMessage = "";
        const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
        if (contentType.includes("application/json")) {
          const payload = (await response.json()) as { error?: string };
          errorMessage = typeof payload.error === "string" ? payload.error : "";
        } else {
          errorMessage = await response.text();
        }

        if (response.status === 400 && errorMessage.toLowerCase().startsWith("missing:")) {
          setComplianceChecklist(parseMissingChecklist(errorMessage));
          setIsComplianceModalOpen(true);
          return;
        }

        throw new Error(errorMessage || `Complete failed (${response.status})`);
      }

      setToast("✅ Certificate Sent to Client!");

      await refresh();
    } catch (completeError) {
      setLocalError(completeError instanceof Error ? completeError.message : "Unable to complete this job.");
    } finally {
      setIsCompleting(false);
    }
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
      });

      await db.jobs.update(job.id, {
        client_name: nextClient,
        date_scheduled: scheduledIso,
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

  return (
    <main className="min-h-screen bg-gray-100 p-4 pb-24 text-gray-900 sm:p-6 md:p-10">
      <section className="mx-auto w-full max-w-5xl rounded-3xl border border-gray-200 bg-white p-6 shadow-sm md:p-8">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-orange-600">Job Details</p>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">{job?.extracted_data?.client ?? "Unknown Client"}</h1>
            {job ? <p className="mt-1 text-sm text-gray-500">{formatJobDate(job.created_at)}</p> : null}
          </div>
          <div className="flex items-center gap-2">
            {job ? (
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${statusBadgeClass(job.status)}`}>
                {normalizeJobStatus(job.status)}
              </span>
            ) : null}
            {canEditJob ? (
              <button
                type="button"
                onClick={openEditModal}
                disabled={!job}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
              >
                <Pencil className="h-4 w-4" />
                Edit
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void deleteJob()}
              disabled={isDeleting}
              className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-50"
            >
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete
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
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-gray-500">
                      <th className="px-2 py-2 font-medium">Type</th>
                      <th className="px-2 py-2 font-medium">Description</th>
                      <th className="px-2 py-2 font-medium">Qty / Hrs</th>
                      <th className="px-2 py-2 font-medium">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((item, index) => {
                      const qty = parseNumeric(item.qty || 0);
                      const lineTotal = parseNumeric(item.line_total || 0);
                      const unitPrice = parseNumeric(item.unit_price || 0);
                      const inferredValue = lineTotal > 0 ? lineTotal : qty * unitPrice;
                      return (
                        <tr key={`${item.description ?? "item"}-${index}`} className="border-b border-gray-200 last:border-0">
                          <td className="px-2 py-2 text-gray-700">{String(item.type ?? "LABOR").toUpperCase()}</td>
                          <td className="px-2 py-2 text-gray-900">{item.description ?? "Unnamed"}</td>
                          <td className="px-2 py-2 text-gray-600">{qty.toFixed(2)}</td>
                          <td className="px-2 py-2 text-gray-600">{inferredValue > 0 ? `$${inferredValue.toFixed(2)}` : "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {lineItems.length === 0 ? (
                <p className="mt-3 rounded-lg border border-gray-200 bg-white p-3 text-xs text-gray-500">No line items were extracted for this job draft yet.</p>
              ) : null}
            </section>

            <div className="mt-6 flex flex-col gap-3 border-t border-gray-200 pt-4 sm:flex-row sm:justify-end">
              {role === "OWNER" && normalizeJobStatus(job.status) === "DONE" ? (
                <button
                  type="button"
                  onClick={() => void pushToXero()}
                  disabled={isPushingToXero}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:border-orange-500 hover:text-orange-600 disabled:opacity-50"
                >
                  {isPushingToXero ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Push to Xero
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
          <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4">
            <section className="my-auto flex max-h-[90vh] w-full max-w-lg flex-col overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
              <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
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

              <form className="grid gap-5 px-5 py-4" onSubmit={(event) => void saveJobEdits(event)}>
                <label className={MODAL_LABEL_CLASS}>
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
                  Job Title / Description
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

                <label className={MODAL_LABEL_CLASS}>
                  Scheduled Date & Time
                  <input
                    type="datetime-local"
                    value={editScheduledDate}
                    onChange={(event) => setEditScheduledDate(event.target.value)}
                    className={MODAL_INPUT_CLASS}
                  />
                </label>

                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="min-h-11 w-full rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-700 disabled:opacity-60"
                >
                  {isSavingEdit ? "Saving..." : "Save Changes"}
                </button>
              </form>
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
