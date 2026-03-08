"use client";

import Link from "next/link";
import { Activity, Clock3, Hammer, ReceiptText } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { apiFetch, AuthSessionExpiredError, parseApiJson } from "@/lib/api";
import { clearAuthState, useAuth } from "@/lib/auth";
import { computePulseMetrics, formatJobDate, JobListItem, normalizeJobStatus } from "@/lib/jobs";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

function statusBadgeClass(status: string): string {
  const normalized = normalizeJobStatus(status);
  if (normalized === "DONE") {
    return "border-emerald-400/40 bg-emerald-500/15 text-emerald-200";
  }
  if (normalized === "SYNCING") {
    return "border-amber-400/40 bg-amber-500/15 text-amber-200";
  }
  return "border-slate-500/60 bg-slate-700/40 text-slate-200";
}

export default function DashboardPage(): React.JSX.Element {
  const { user, session } = useAuth();
  const router = useRouter();
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSessionExpired, setIsSessionExpired] = useState(false);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [profileEmail, setProfileEmail] = useState<string | null>(null);

  const displayName = profileName || user?.user_metadata?.full_name || profileEmail || user?.email || "Sparky";
  const pulse = useMemo(() => computePulseMetrics(jobs), [jobs]);
  const recentActivity = jobs.slice(0, 5);

  useEffect(() => {
    async function loadJobs(): Promise<void> {
      if (!session?.access_token) {
        setJobs([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      setIsSessionExpired(false);
      setProfileName(null);
      setProfileEmail(null);

      try {
        const [jobsResponse, sessionIdentityResponse] = await Promise.all([
          apiFetch(`${API_BASE_URL}/api/jobs`, {
            cache: "no-store",
          }),
          fetch("/api/auth/session", {
            cache: "no-store",
          }),
        ]);

        if (sessionIdentityResponse.ok) {
          const identityPayload = (await sessionIdentityResponse.json()) as {
            user?: { full_name?: string | null; email?: string | null } | null;
          };
          const normalizedName = typeof identityPayload.user?.full_name === "string" ? identityPayload.user.full_name.trim() : "";
          const normalizedEmail = typeof identityPayload.user?.email === "string" ? identityPayload.user.email.trim() : "";
          setProfileName(normalizedName || null);
          setProfileEmail(normalizedEmail || null);
        }

        if (!jobsResponse.ok) {
          if (jobsResponse.status === 401) {
            throw new AuthSessionExpiredError("Session expired. Please sign in again.");
          }

          let responseMessage = `Failed to load jobs (${jobsResponse.status})`;
          const contentType = jobsResponse.headers.get("content-type")?.toLowerCase() ?? "";
          if (contentType.includes("application/json")) {
            const payload = (await jobsResponse.json()) as { error?: string; message?: string };
            responseMessage = payload.error ?? payload.message ?? responseMessage;
          } else {
            const body = (await jobsResponse.text()).trim();
            if (body && !body.startsWith("{")) {
              responseMessage = body;
            }
          }

          throw new Error(responseMessage);
        }

        const payload = await parseApiJson<JobListItem[]>(jobsResponse);
        setJobs(Array.isArray(payload) ? payload : []);
      } catch (loadError) {
        if (loadError instanceof AuthSessionExpiredError) {
          setIsSessionExpired(true);
          setJobs([]);
          setError(null);
        } else {
          setError(loadError instanceof Error ? loadError.message : "Unable to load dashboard pulse.");
        }
      } finally {
        setLoading(false);
      }
    }

    void loadJobs();
  }, [session?.access_token]);

  async function handleSessionReauth(): Promise<void> {
    await clearAuthState();
    router.replace("/login?error=Session%20expired.%20Please%20sign%20in%20again.");
  }

  return (
    <main className="min-h-screen bg-slate-950 p-4 pb-24 text-slate-100 sm:p-6 md:p-10">
      <section className="mx-auto w-full max-w-5xl rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-black/50 md:p-8">
        <p className="text-xs uppercase tracking-[0.26em] text-amber-400">Command Center</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Welcome {displayName}</h1>
        <p className="mt-2 text-sm text-slate-300">Your business pulse right now.</p>

        {loading ? (
          <p className="mt-6 rounded-2xl border border-slate-700 bg-slate-950/60 p-4 text-sm text-slate-300">Loading pulse data...</p>
        ) : null}

        {isSessionExpired ? (
          <section className="mt-4 rounded-2xl border border-amber-400/50 bg-amber-500/10 p-5">
            <h2 className="text-lg font-semibold text-amber-200">Session Expired</h2>
            <p className="mt-2 text-sm text-amber-100/90">Your secure session timed out. Please sign in again to continue.</p>
            <button
              type="button"
              onClick={() => void handleSessionReauth()}
              className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-400"
            >
              Re-authenticate
            </button>
          </section>
        ) : null}

        {error ? (
          <p className="mt-4 rounded-2xl border border-rose-500/60 bg-rose-500/10 p-4 text-sm text-rose-100">{error}</p>
        ) : null}

        {!loading && jobs.length === 0 ? (
          <section className="mt-6 rounded-2xl border border-slate-700 bg-slate-950/70 p-6">
            <h2 className="text-xl font-semibold text-white">Welcome {displayName}</h2>
            <p className="mt-2 text-sm text-slate-300">You have no jobs yet. Capture your first voice note to start building today&apos;s pipeline.</p>
            <Link
              href="/capture"
              className="mt-5 inline-flex items-center rounded-xl bg-amber-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-400"
            >
              Start New Job
            </Link>
          </section>
        ) : null}

        {jobs.length > 0 ? (
          <>
            <section className="mt-6 grid gap-4 sm:grid-cols-3">
              <article className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
                <div className="flex items-center gap-2 text-slate-300">
                  <Clock3 className="h-4 w-4 text-amber-400" />
                  <p className="text-xs uppercase tracking-[0.18em]">Pending Jobs</p>
                </div>
                <p className="mt-3 text-3xl font-bold text-amber-300">{pulse.pendingJobs}</p>
              </article>

              <article className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
                <div className="flex items-center gap-2 text-slate-300">
                  <Hammer className="h-4 w-4 text-amber-400" />
                  <p className="text-xs uppercase tracking-[0.18em]">Billable Hours</p>
                </div>
                <p className="mt-3 text-3xl font-bold text-amber-300">{pulse.totalBillableHours.toFixed(1)}</p>
              </article>

              <article className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
                <div className="flex items-center gap-2 text-slate-300">
                  <ReceiptText className="h-4 w-4 text-amber-400" />
                  <p className="text-xs uppercase tracking-[0.18em]">Material Spend</p>
                </div>
                <p className="mt-3 text-3xl font-bold text-amber-300">${pulse.materialSpend.toFixed(2)}</p>
              </article>
            </section>

            <section className="mt-6 rounded-2xl border border-slate-700 bg-slate-950/50 p-4">
              <div className="flex items-center gap-2 text-slate-200">
                <Activity className="h-5 w-5 text-amber-400" />
                <h2 className="text-lg font-semibold">Recent Activity</h2>
              </div>

              <ul className="mt-3 space-y-2 text-sm text-slate-300">
                {recentActivity.map((job) => (
                  <li key={job.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2">
                    <div>
                      <p className="font-medium text-slate-100">{job.client_name || "Unknown Client"}</p>
                      <p className="text-xs text-slate-400">{formatJobDate(job.created_at)}</p>
                    </div>
                    <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${statusBadgeClass(job.status)}`}>
                      {normalizeJobStatus(job.status)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        ) : null}
      </section>
    </main>
  );
}
