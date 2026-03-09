"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { Activity, Clock3, Hammer, ReceiptText } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { AuthSessionExpiredError } from "@/lib/api";
import { clearAuthState, useAuth } from "@/lib/auth";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { db } from "@/lib/db";
import { computePulseMetrics, formatJobDate, JobListItem, normalizeJobStatus } from "@/lib/jobs";
import { backgroundSync } from "@/lib/syncService";

function initialsFromName(name: string): string {
  const tokens = name
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .slice(0, 2);
  if (tokens.length === 0) {
    return "--";
  }
  return tokens.map((token) => token[0]?.toUpperCase() ?? "").join("");
}

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

export default function DashboardPage(): React.JSX.Element {
  const { user, session, role, mode } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSessionExpired, setIsSessionExpired] = useState(false);
  const [profileName, setProfileName] = useState<string | null>(null);
  const metadataName = typeof user?.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() : "";
  const { isInstallAvailable, promptInstall } = usePWAInstall();
  const cachedJobs = useLiveQuery(() => db.jobs.orderBy("updated_at").reverse().toArray(), []);

  const jobs: JobListItem[] = useMemo(
    () =>
      (cachedJobs ?? []).map((job) => ({
        id: job.id,
        status: job.status,
        created_at: job.created_at,
        date_scheduled: job.date_scheduled,
        client_name: job.client_name,
        extracted_data: job.extracted_data,
      })),
    [cachedJobs]
  );

  const displayName = metadataName || profileName;
  const pulse = useMemo(() => computePulseMetrics(jobs), [jobs]);
  const recentActivity = jobs.slice(0, 5);
  const ownerFieldFocus = role === "OWNER" && mode === "FIELD";

  useEffect(() => {
    async function loadJobs(): Promise<void> {
      if (!session?.access_token) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      setIsSessionExpired(false);
      setProfileName(null);

      try {
        const [syncResult, sessionIdentityResponse] = await Promise.all([
          backgroundSync(),
          fetch("/api/auth/session", {
            cache: "no-store",
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          }),
        ]);

        void syncResult;

        if (sessionIdentityResponse.ok) {
          const identityPayload = (await sessionIdentityResponse.json()) as {
            user?: { full_name?: string | null; email?: string | null } | null;
          };
          const normalizedName = typeof identityPayload.user?.full_name === "string" ? identityPayload.user.full_name.trim() : "";
          setProfileName(normalizedName || null);
        }

      } catch (loadError) {
        if (loadError instanceof AuthSessionExpiredError) {
          setIsSessionExpired(true);
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
    <main className="min-h-screen bg-gray-100 p-4 pb-24 text-gray-900 sm:p-6 md:p-10">
      <section className="mx-auto w-full max-w-5xl rounded-3xl border border-gray-200 bg-white p-6 shadow-sm md:p-8">
        <p className="text-xs uppercase tracking-[0.26em] text-orange-600">Command Center</p>

        {isInstallAvailable ? (
          <button
            type="button"
            onClick={() => void promptInstall()}
            className="mt-3 inline-flex min-h-11 w-full items-center justify-between gap-3 rounded-2xl border border-orange-300 bg-orange-50 px-4 py-3 text-left text-sm font-semibold text-orange-700 transition hover:bg-orange-100"
          >
            <span>Install SparkOps for standalone app access.</span>
            <span className="rounded-lg bg-orange-600 px-3 py-1 text-xs font-bold text-white">Install App</span>
          </button>
        ) : null}

        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          {displayName ? `Welcome ${displayName}` : "Welcome"}
        </h1>
        <p className="mt-2 text-sm text-gray-500">Your business pulse right now.</p>

        {!displayName ? (
          <p className="mt-3 rounded-xl border border-orange-300 bg-orange-50 px-4 py-3 text-sm text-orange-700">
            Your profile name is missing. <Link href="/profile" className="font-semibold text-orange-700 underline">Update Profile</Link> to personalize your dashboard.
          </p>
        ) : null}

        {loading ? (
          <p className="mt-6 rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-600">Loading pulse data...</p>
        ) : null}

        {isSessionExpired ? (
          <section className="mt-4 rounded-2xl border border-orange-300 bg-orange-50 p-5">
            <h2 className="text-lg font-semibold text-orange-700">Session Expired</h2>
            <p className="mt-2 text-sm text-orange-700">Your secure session timed out. Please sign in again to continue.</p>
            <button
              type="button"
              onClick={() => void handleSessionReauth()}
              className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-700"
            >
              Re-authenticate
            </button>
          </section>
        ) : null}

        {error ? (
          <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>
        ) : null}

        {!loading && jobs.length === 0 ? (
          <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-6">
            <h2 className="text-xl font-semibold text-gray-900">{displayName ? `Welcome ${displayName}` : "Welcome"}</h2>
            <p className="mt-2 text-sm text-gray-600">You have no jobs yet. Capture your first voice note to start building today&apos;s pipeline.</p>
            <Link
              href="/capture"
              className="mt-5 inline-flex items-center rounded-xl bg-orange-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-700"
            >
              Start New Job
            </Link>
          </section>
        ) : null}

        {jobs.length > 0 ? (
          <>
            {!ownerFieldFocus ? (
              <section className="mt-6 grid gap-4 sm:grid-cols-3">
                <article className="rounded-2xl border border-gray-200 bg-white p-4">
                  <div className="flex items-center gap-2 text-gray-500">
                    <Clock3 className="h-4 w-4 text-orange-600" />
                    <p className="text-xs uppercase tracking-[0.18em]">Pending Jobs</p>
                  </div>
                  <p className="mt-3 text-3xl font-bold text-orange-600">{pulse.pendingJobs}</p>
                </article>

                <article className="rounded-2xl border border-gray-200 bg-white p-4">
                  <div className="flex items-center gap-2 text-gray-500">
                    <Hammer className="h-4 w-4 text-orange-600" />
                    <p className="text-xs uppercase tracking-[0.18em]">Billable Hours</p>
                  </div>
                  <p className="mt-3 text-3xl font-bold text-orange-600">{pulse.totalBillableHours.toFixed(1)}</p>
                </article>

                <article className="rounded-2xl border border-gray-200 bg-white p-4">
                  <div className="flex items-center gap-2 text-gray-500">
                    <ReceiptText className="h-4 w-4 text-orange-600" />
                    <p className="text-xs uppercase tracking-[0.18em]">Material Spend</p>
                  </div>
                  <p className="mt-3 text-3xl font-bold text-orange-600">${pulse.materialSpend.toFixed(2)}</p>
                </article>
              </section>
            ) : null}

            <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-4">
              <div className="flex items-center gap-2 text-gray-700">
                <Activity className="h-5 w-5 text-orange-600" />
                <h2 className="text-lg font-semibold">Recent Activity</h2>
              </div>

              <ul className="mt-3 space-y-2 text-sm text-gray-600">
                {recentActivity.map((job) => (
                  <li key={job.id}>
                    <Link href={`/jobs/${job.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2 transition hover:border-orange-500/60">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900">{job.client_name || "Unknown Client"}</p>
                        <p className="text-xs text-gray-500">{formatJobDate(job.date_scheduled || job.created_at)}</p>
                        {role === "OWNER" && typeof job.extracted_data?.assigned_to_name === "string" && job.extracted_data.assigned_to_name.trim() ? (
                          <div className="mt-1 inline-flex items-center gap-1.5 text-[11px] text-gray-600">
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-gray-300 bg-gray-100 text-[10px] font-semibold text-orange-600">
                              {initialsFromName(job.extracted_data.assigned_to_name)}
                            </span>
                            <span className="truncate">{job.extracted_data.assigned_to_name}</span>
                          </div>
                        ) : null}
                      </div>
                      <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${statusBadgeClass(job.status)}`}>
                        {normalizeJobStatus(job.status)}
                      </span>
                    </Link>
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
