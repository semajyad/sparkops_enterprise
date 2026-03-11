"use client";

import { Loader2, UploadCloud } from "lucide-react";
import { ChangeEvent, DragEvent, useMemo, useState } from "react";

import { useAuth } from "@/lib/auth";
import { apiFetch, parseApiJson } from "@/lib/api";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

type ImportSummary = {
  imported_count: number;
  failed_count: number;
  total_rows: number;
  message: string;
};

export default function SettingsPage() {
  const { session } = useAuth();
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("Upload a JA Russell or Corys CSV to refresh your catalog.");
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const dropzoneClass = useMemo(() => {
    if (isDragging) {
      return "border-orange-400 bg-orange-50";
    }
    return "border-gray-300 bg-white";
  }, [isDragging]);

  async function uploadCsv(file: File): Promise<void> {
    if (!session?.access_token) {
      setStatusMessage("Please log in as an OWNER to import materials.");
      return;
    }

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setStatusMessage("Only CSV files are accepted.");
      return;
    }

    setIsUploading(true);
    setProgress(20);
    setSummary(null);
    setStatusMessage(`Uploading ${file.name}...`);

    const timer = window.setInterval(() => {
      setProgress((current) => (current >= 90 ? current : current + 10));
    }, 220);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await apiFetch(`${API_BASE_URL}/api/materials/import`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || `Upload failed (${response.status})`);
      }

      const payload = await parseApiJson<ImportSummary>(response);
      setProgress(100);
      setStatusMessage(payload.message ?? "Processing started. Materials are being updated in the background.");
      setSummary(payload);
    } catch (error) {
      setProgress(0);
      setStatusMessage(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      window.clearInterval(timer);
      setIsUploading(false);
    }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    void uploadCsv(file);
    event.currentTarget.value = "";
  }

  function onDrop(event: DragEvent<HTMLLabelElement>): void {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) {
      return;
    }
    void uploadCsv(file);
  }

  return (
    <main className="min-h-screen p-4 text-gray-900 sm:p-6 md:p-10">
      <section className="mx-auto w-full max-w-3xl rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <header className="mb-6 space-y-2">
          <p className="text-xs uppercase tracking-[0.24em] text-orange-600">Settings</p>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Material Settings</h1>
          <p className="text-sm text-gray-600">Bulk import wholesaler price lists with columns: sku, name, price.</p>
        </header>

        <label
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          className={`flex cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${dropzoneClass}`}
        >
          {isUploading ? <Loader2 className="h-8 w-8 animate-spin text-orange-600" /> : <UploadCloud className="h-8 w-8 text-orange-600" />}
          <div>
            <p className="text-base font-semibold text-gray-900">Drag & drop CSV here</p>
            <p className="text-sm text-gray-600">or click to choose a file</p>
          </div>
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={onFileChange} />
        </label>

        <div className="mt-6 space-y-2">
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
            <div className="h-full rounded-full bg-orange-600 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-sm text-gray-700">{statusMessage}</p>
          {summary ? (
            <p className="text-sm text-green-700">
              Imported {summary.imported_count} / {summary.total_rows} items · Failed {summary.failed_count}
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
