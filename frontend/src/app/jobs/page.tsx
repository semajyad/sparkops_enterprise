"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatJobDate, JobListItem, normalizeJobStatus } from "@/lib/jobs";

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

export default function JobsPage(): React.JSX.Element {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log(`[AUTH-TRACE] Page: User ${user ? "found" : "missing"} route=/jobs`);
  }, [user]);

  useEffect(() => {
    async function loadJobs(): Promise<void> {
      setLoading(true);
      setError(null);

      try {
        const response = await apiFetch(`${API_BASE_URL}/api/jobs`, { cache: "no-store" });
        if (!response.ok) {
          const body = await response.text();
          throw new Error(body || `Unable to load jobs (${response.status})`);
        }

        const payload = (await response.json()) as JobListItem[];
        setJobs(Array.isArray(payload) ? payload : []);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load jobs.");
      } finally {
        setLoading(false);
      }
    }

    void loadJobs();
  }, []);

  const filteredJobs = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) {
      return jobs;
    }

    return jobs.filter((job) => {
      const dateText = formatJobDate(job.created_at).toLowerCase();
      return job.client_name.toLowerCase().includes(term) || dateText.includes(term);
    });
  }, [jobs, search]);

  return (
    <main className="min-h-screen bg-slate-950 p-4 pb-24 text-slate-100 sm:p-6 md:p-10">
      <section className="mx-auto w-full max-w-4xl rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-black/50 md:p-8">
        <p className="text-xs uppercase tracking-[0.26em] text-amber-400">Job Manager</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">All Job Drafts</h1>

        <label htmlFor="jobs-search" className="mt-6 flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-slate-300">
          <Search className="h-4 w-4 text-amber-400" />
          <input
            id="jobs-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by client or date (e.g. Mar 8)"
            className="w-full bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
          />
        </label>

        {loading ? <p className="mt-4 text-sm text-slate-300">Loading jobs...</p> : null}
        {error ? <p className="mt-4 rounded-xl border border-rose-500/60 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</p> : null}

        {!loading && filteredJobs.length === 0 ? (
          <p className="mt-4 rounded-xl border border-slate-700 bg-slate-950/70 p-4 text-sm text-slate-300">No jobs found for your search.</p>
        ) : null}

        <ul className="mt-4 space-y-3">
          {filteredJobs.map((job) => (
            <li key={job.id}>
              <Link
                href={`/jobs/${job.id}`}
                className="block rounded-2xl border border-slate-700 bg-slate-950/70 p-4 transition hover:border-amber-500/60"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-slate-400">{formatJobDate(job.created_at)}</p>
                    <p className="mt-1 text-lg font-semibold text-white">{job.client_name || "Unknown Client"}</p>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${statusBadgeClass(job.status)}`}>
                    {normalizeJobStatus(job.status)}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
