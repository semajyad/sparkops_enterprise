"use client";

import { Download, Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { apiFetch, parseApiJson } from "@/lib/api";
import { formatJobDate, normalizeJobStatus, parseNumeric } from "@/lib/jobs";

type JobDraftResponse = {
  id: string;
  raw_transcript: string;
  extracted_data: {
    client?: string;
    address?: string;
    scope?: string;
    line_items?: Array<{
      qty?: string | number;
      description?: string;
      type?: string;
      unit_price?: string | number;
      line_total?: string | number;
    }>;
  };
  status: string;
  created_at: string;
  invoice_summary?: {
    subtotal?: string;
    markup_amount?: string;
    gst?: string;
    total?: string;
    material_cost_base?: string;
    material_cost_with_markup?: string;
    labor_total?: string;
  };
  compliance_summary?: {
    status?: string;
    notes?: string;
    missing_items?: string[];
    checks?: Array<{ key?: string; label?: string; present?: boolean }>;
  };
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

function statusBadgeClass(status: string): string {
  const normalized = normalizeJobStatus(status);
  if (normalized === "DONE") {
    return "border-emerald-500/50 bg-emerald-500/20 text-emerald-200";
  }
  if (normalized === "SYNCING") {
    return "border-amber-500/50 bg-amber-500/20 text-amber-200";
  }
  return "border-slate-600 bg-slate-700/50 text-slate-200";
}

export default function JobReviewPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [job, setJob] = useState<JobDraftResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function loadJob(): Promise<void> {
      setIsLoading(true);
      setErrorMessage("");
      try {
        const response = await apiFetch(`${API_BASE_URL}/api/jobs/${params.id}`, {
          cache: "no-store",
        });
        if (!response.ok) {
          const body = await response.text();
          throw new Error(body || `Failed to load job (${response.status})`);
        }

        const payload = await parseApiJson<JobDraftResponse>(response);
        setJob(payload);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to load job review.");
      } finally {
        setIsLoading(false);
      }
    }

    void loadJob();
  }, [params.id]);

  async function downloadPdf(): Promise<void> {
    if (!job) {
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
      setErrorMessage(error instanceof Error ? error.message : "Failed to download invoice PDF.");
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
    setErrorMessage("");

    try {
      const response = await apiFetch(`${API_BASE_URL}/api/jobs/${job.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || `Delete failed (${response.status})`);
      }

      await parseApiJson<{ status: string; id: string }>(response);

      router.push("/jobs");
    } catch (deleteError) {
      setErrorMessage(deleteError instanceof Error ? deleteError.message : "Failed to delete this job draft.");
    } finally {
      setIsDeleting(false);
    }
  }

  const lineItems = job?.extracted_data?.line_items ?? [];
  const invoiceSummary = job?.invoice_summary;
  const complianceSummary = job?.compliance_summary;

  return (
    <main className="min-h-screen bg-slate-950 p-4 pb-24 text-slate-100 sm:p-6 md:p-10">
      <section className="mx-auto w-full max-w-5xl rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-black/50 md:p-8">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-amber-400">Evidence Locker</p>
            <h1 className="text-3xl font-bold tracking-tight text-white">{job?.extracted_data?.client ?? "Unknown Client"}</h1>
            {job ? <p className="mt-1 text-sm text-slate-400">{formatJobDate(job.created_at)}</p> : null}
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
              disabled={!job || isDeleting}
              className="inline-flex items-center gap-2 rounded-xl border border-rose-500/60 bg-rose-500/20 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/30 disabled:opacity-50"
            >
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete
            </button>
          </div>
        </header>

        {isLoading ? (
          <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/70 p-4 text-sm">
            <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
            Loading job draft...
          </div>
        ) : job ? (
          <>
            <details className="rounded-xl border border-slate-700 bg-slate-950/70 p-4" open>
              <summary className="cursor-pointer text-sm font-semibold text-white">Raw Transcript</summary>
              <p className="mt-3 whitespace-pre-wrap text-sm text-slate-300">{job.raw_transcript || "No transcript found."}</p>
            </details>

            {invoiceSummary ? (
              <section className="mt-4 rounded-xl border border-slate-700 bg-slate-950/70 p-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Draft Invoice Total</h2>
                <div className="mt-3 grid gap-2 text-sm text-slate-200 sm:grid-cols-2">
                  <p>Subtotal: <span className="font-semibold text-white">${parseNumeric(invoiceSummary.subtotal).toFixed(2)}</span></p>
                  <p>Markup: <span className="font-semibold text-amber-300">${parseNumeric(invoiceSummary.markup_amount).toFixed(2)}</span></p>
                  <p>GST (15%): <span className="font-semibold text-white">${parseNumeric(invoiceSummary.gst).toFixed(2)}</span></p>
                  <p>Total: <span className="font-semibold text-emerald-300">${parseNumeric(invoiceSummary.total).toFixed(2)}</span></p>
                </div>
              </section>
            ) : null}

            {complianceSummary ? (
              <section className="mt-4 rounded-xl border border-slate-700 bg-slate-950/70 p-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Compliance Summary</h2>
                <p className="mt-2 text-sm text-slate-300">{complianceSummary.notes || "No compliance summary available."}</p>
                {Array.isArray(complianceSummary.missing_items) && complianceSummary.missing_items.length > 0 ? (
                  <div className="mt-3 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-xs text-amber-200">
                    Missing safety evidence: {complianceSummary.missing_items.join(", ")}
                  </div>
                ) : (
                  <div className="mt-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-200">
                    Mandatory tests detected for RoI/CoC draft.
                  </div>
                )}
              </section>
            ) : null}

            <section className="mt-4 rounded-xl border border-slate-700 bg-slate-950/70 p-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">AI Breakdown</h2>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-left text-slate-400">
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
                        <tr key={`${item.description ?? "item"}-${index}`} className="border-b border-slate-800 last:border-0">
                          <td className="px-2 py-2 text-slate-200">{String(item.type ?? "LABOR").toUpperCase()}</td>
                          <td className="px-2 py-2 text-slate-100">{item.description ?? "Unnamed"}</td>
                          <td className="px-2 py-2 text-slate-300">{qty.toFixed(2)}</td>
                          <td className="px-2 py-2 text-slate-300">{inferredValue > 0 ? `$${inferredValue.toFixed(2)}` : "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {lineItems.length === 0 ? (
                <p className="mt-3 rounded-lg border border-slate-700 bg-slate-900/70 p-3 text-xs text-slate-400">No line items were extracted for this job draft yet.</p>
              ) : null}
            </section>

            <button
              type="button"
              onClick={() => void downloadPdf()}
              disabled={isDownloading}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 disabled:opacity-50"
            >
              {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Download Invoice PDF
            </button>
          </>
        ) : (
          <p className="rounded-xl border border-rose-500/60 bg-rose-500/10 p-4 text-sm text-rose-100">Job draft not found.</p>
        )}

        {errorMessage ? (
          <p className="mt-4 rounded-xl border border-rose-500/60 bg-rose-500/10 p-3 text-sm text-rose-100">{errorMessage}</p>
        ) : null}
      </section>
    </main>
  );
}
