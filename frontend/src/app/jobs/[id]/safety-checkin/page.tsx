"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { apiFetch, parseApiJson } from "@/lib/api";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

type SafetyPlanResponse = {
  id: string;
  job_id: string;
  trade: string;
  acknowledged: boolean;
  plan_json: {
    site_summary?: string;
    hazards?: string[];
    controls?: string[];
    emergency_plan?: string;
    signoff_checklist?: string[];
  };
  pdf_url: string;
};

export default function JobSafetyCheckinPage(): React.JSX.Element {
  const params = useParams<{ id: string }>();
  const jobId = String(params?.id ?? "");

  const [transcript, setTranscript] = useState("");
  const [acknowledge, setAcknowledge] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<SafetyPlanResponse | null>(null);

  async function onGenerate(): Promise<void> {
    if (!jobId || !transcript.trim()) {
      setError("Transcript is required to generate an SSSP.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/jobs/${jobId}/safety-plan`, {
        method: "POST",
        body: JSON.stringify({
          transcript: transcript.trim(),
          acknowledge,
        }),
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || `Failed to generate safety plan (${response.status}).`);
      }
      const payload = await parseApiJson<SafetyPlanResponse>(response);
      setPlan(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to generate safety plan.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Start Job / Safety Check-in</h1>
        <Link href={`/jobs/${jobId}`} className="text-sm font-semibold text-orange-600 hover:text-orange-700">
          Back to Job
        </Link>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <label className="block text-sm font-medium text-gray-700">Voice Note Transcript (10s pre-job summary)</label>
        <textarea
          value={transcript}
          onChange={(event) => setTranscript(event.target.value)}
          rows={5}
          className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-orange-500 focus:outline-none"
          placeholder="I'm at 123 Example St, working on a live switchboard at height near pedestrian access..."
        />

        <label className="mt-3 flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={acknowledge}
            onChange={(event) => setAcknowledge(event.target.checked)}
            className="h-4 w-4"
          />
          Tradie acknowledges pre-start hazards and controls
        </label>

        <button
          type="button"
          onClick={() => void onGenerate()}
          disabled={loading}
          className="mt-4 min-h-11 rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
        >
          {loading ? "Generating SSSP..." : "Generate SSSP"}
        </button>
      </section>

      {error ? <p className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      {plan ? (
        <section className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-lg font-semibold text-gray-900">Generated Safety Plan</h2>
          <p className="mt-1 text-sm text-gray-700">Trade: {plan.trade}</p>
          {plan.plan_json.site_summary ? <p className="mt-2 text-sm text-gray-700">{plan.plan_json.site_summary}</p> : null}

          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Hazards</h3>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-gray-700">
                {(plan.plan_json.hazards ?? []).map((hazard) => (
                  <li key={hazard}>{hazard}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Controls</h3>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-gray-700">
                {(plan.plan_json.controls ?? []).map((control) => (
                  <li key={control}>{control}</li>
                ))}
              </ul>
            </div>
          </div>

          {plan.plan_json.emergency_plan ? (
            <p className="mt-3 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900">
              Emergency Plan: {plan.plan_json.emergency_plan}
            </p>
          ) : null}

          <a
            href={`${API_BASE_URL}${plan.pdf_url}`}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:border-orange-500 hover:text-orange-600"
          >
            Download SSSP PDF
          </a>
        </section>
      ) : null}
    </main>
  );
}
