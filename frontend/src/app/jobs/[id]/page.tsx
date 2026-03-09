"use client";

import { Download, Loader2, Trash2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

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

function parseMissingChecklist(message: string): ComplianceChecklistItem[] {
  const normalized = message.toLowerCase();
  const matches = CHECKLIST_CATALOG.filter((item) => {
    if (item.key === "safety") return normalized.includes("earth loop") || normalized.includes("polarity") || normalized.includes("safety");
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
      link.download = `sparkops-invoice-${job.id}.pdf`;
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
            <button
              type="button"
              onClick={() => void deleteJob()}
              disabled={isDeleting}
              className="inline-flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-50"
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

            <button
              type="button"
              onClick={() => void downloadPdf()}
              disabled={isDownloading}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-orange-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-700 disabled:opacity-50"
            >
              {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Download Invoice PDF
            </button>

            <button
              type="button"
              onClick={() => void completeJob()}
              disabled={isCompleting || !job}
              className={`mt-3 inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition disabled:opacity-50 ${
                guardrail === "GREEN_SHIELD"
                  ? "bg-green-600 text-white hover:bg-green-700"
                  : guardrail === "RED_SHIELD"
                    ? "bg-red-500 text-white hover:bg-red-600"
                    : "bg-orange-600 text-white hover:bg-orange-700"
              }`}
            >
              {isCompleting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Complete Job
            </button>

            {role === "OWNER" && normalizeJobStatus(job.status) === "DONE" ? (
              <button
                type="button"
                onClick={() => void pushToXero()}
                disabled={isPushingToXero}
                className="mt-3 inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-700 transition hover:border-orange-500 hover:text-orange-600 disabled:opacity-50"
              >
                {isPushingToXero ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Push to Xero
              </button>
            ) : null}

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

        {errorMessage || localError ? (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{localError || errorMessage}</p>
        ) : null}
      </section>
    </main>
  );
}
