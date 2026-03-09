"use client";

import Link from "next/link";

import { formatJobDate, JobListItem, isValidJobUuid, normalizeJobStatus } from "@/lib/jobs";

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

type JobsListProps = {
  jobs: JobListItem[];
};

export function JobsList({ jobs }: JobsListProps): React.JSX.Element {
  const visibleJobs = jobs.filter((job) => isValidJobUuid(job.id));

  return (
    <ul className="mt-4 space-y-3">
      {visibleJobs.map((job) => (
        <li key={job.id}>
          <Link
            href={`/jobs/${job.id}`}
            className="block rounded-2xl border border-slate-700 bg-slate-950/70 p-4 transition hover:border-amber-500/60"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-slate-400">{formatJobDate(job.date_scheduled || job.created_at)}</p>
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
  );
}
