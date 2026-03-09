"use client";

import Link from "next/link";

import { formatJobDate, JobListItem, isValidJobUuid, normalizeJobStatus } from "@/lib/jobs";

function statusBadgeClass(status: string): string {
  const normalized = normalizeJobStatus(status);
  if (normalized === "DONE") {
    return "border-green-500/50 bg-green-50 text-green-700";
  }
  if (normalized === "SYNCING") {
    return "border-orange-500/50 bg-orange-50 text-orange-700";
  }
  return "border-gray-300 bg-gray-50 text-gray-600";
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
            className={`block rounded-xl border border-gray-200 bg-white shadow-sm transition hover:border-orange-500/60 hover:shadow-md relative overflow-hidden ${
              normalizeJobStatus(job.status) === "DONE" ? "border-l-4 border-l-green-500" : 
              normalizeJobStatus(job.status) === "SYNCING" ? "border-l-4 border-l-orange-500" : 
              "border-l-4 border-l-orange-500"
            }`}
          >
            <div className="flex items-center justify-between gap-3 pl-1">
              <div>
                <p className="text-sm text-gray-500">{formatJobDate(job.date_scheduled || job.created_at)}</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">{job.client_name || "Unknown Client"}</p>
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
