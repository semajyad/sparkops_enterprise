"use client";

import { Download, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

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
    }>;
  };
  status: string;
  created_at: string;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

export default function JobReviewPage({ params }: { params: { id: string } }) {
  const [job, setJob] = useState<JobDraftResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function loadJob(): Promise<void> {
      setIsLoading(true);
      setErrorMessage("");
      try {
        const response = await fetch(`${API_BASE_URL}/api/jobs/${params.id}`, { cache: "no-store" });
        if (!response.ok) {
          const body = await response.text();
          throw new Error(body || `Failed to load job (${response.status})`);
        }

        const payload = (await response.json()) as JobDraftResponse;
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
      const response = await fetch(`${API_BASE_URL}/api/jobs/${job.id}/pdf`);
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

  return (
    <main className="min-h-screen bg-slate-900 p-4 text-slate-100 sm:p-6 md:p-10">
      <section className="mx-auto w-full max-w-3xl rounded-2xl border border-slate-700 bg-slate-800 p-6 shadow-2xl shadow-slate-950/50">
        <header className="mb-6">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-300">Job Review</p>
          <h1 className="text-3xl font-bold tracking-tight text-white">Voice-to-Cash Draft</h1>
        </header>

        {isLoading ? (
          <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/70 p-4 text-sm">
            <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
            Loading job draft...
          </div>
        ) : job ? (
          <>
            <div className="space-y-2 rounded-xl border border-slate-700 bg-slate-900/70 p-4 text-sm">
              <p><span className="font-semibold text-white">Client:</span> {job.extracted_data?.client ?? "Unknown"}</p>
              <p><span className="font-semibold text-white">Address:</span> {job.extracted_data?.address ?? "Unknown"}</p>
              <p><span className="font-semibold text-white">Scope:</span> {job.extracted_data?.scope ?? "Not provided"}</p>
            </div>

            <div className="mt-4 rounded-xl border border-slate-700 bg-slate-900/70 p-4">
              <p className="mb-2 text-sm font-semibold text-white">Line Items</p>
              <ul className="space-y-2 text-sm text-slate-200">
                {(job.extracted_data?.line_items ?? []).map((item, index) => (
                  <li key={`${item.description ?? "item"}-${index}`} className="rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-2">
                    {item.qty ?? "1"} × {item.description ?? "Unnamed"} <span className="text-slate-400">({item.type ?? "LABOR"})</span>
                  </li>
                ))}
              </ul>
            </div>

            <button
              type="button"
              onClick={() => void downloadPdf()}
              disabled={isDownloading}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
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
