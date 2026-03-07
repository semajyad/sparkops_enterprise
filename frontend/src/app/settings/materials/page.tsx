"use client";

import { Loader2, UploadCloud } from "lucide-react";
import { ChangeEvent, DragEvent, useMemo, useState } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

export default function MaterialsSettingsPage() {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("Upload a JA Russell or Corys CSV to refresh your catalog.");

  const dropzoneClass = useMemo(() => {
    if (isDragging) {
      return "border-emerald-400 bg-emerald-500/10";
    }
    return "border-slate-600 bg-slate-800/70";
  }, [isDragging]);

  async function uploadCsv(file: File): Promise<void> {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setStatusMessage("Only CSV files are accepted.");
      return;
    }

    setIsUploading(true);
    setProgress(20);
    setStatusMessage(`Uploading ${file.name}...`);

    const timer = window.setInterval(() => {
      setProgress((current) => (current >= 90 ? current : current + 10));
    }, 220);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`${API_BASE_URL}/api/materials/upload`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || `Upload failed (${response.status})`);
      }

      const payload = (await response.json()) as { message?: string };
      setProgress(100);
      setStatusMessage(payload.message ?? "Processing started. Materials are being updated in the background.");
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
    <main className="min-h-screen bg-slate-900 p-4 text-slate-100 sm:p-6 md:p-10">
      <section className="mx-auto w-full max-w-3xl rounded-2xl border border-slate-700 bg-slate-800 p-6 shadow-2xl shadow-slate-950/50">
        <header className="mb-6 space-y-2">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-300">Settings</p>
          <h1 className="text-3xl font-bold tracking-tight text-white">Materials Upload</h1>
          <p className="text-sm text-slate-300">Upload wholesaler price lists with columns: sku, description, price.</p>
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
          {isUploading ? <Loader2 className="h-8 w-8 animate-spin text-emerald-400" /> : <UploadCloud className="h-8 w-8 text-emerald-400" />}
          <div>
            <p className="text-base font-semibold text-white">Drag & drop CSV here</p>
            <p className="text-sm text-slate-300">or click to choose a file</p>
          </div>
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={onFileChange} />
        </label>

        <div className="mt-6 space-y-2">
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-700">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-sm text-slate-200">{statusMessage}</p>
        </div>
      </section>
    </main>
  );
}
