"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { Activity } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { AuthSessionExpiredError } from "@/lib/api";
import { clearAuthState, useAuth } from "@/lib/auth";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { db } from "@/lib/db";
import { toRenderableErrorMessage } from "@/lib/errorSuppression";
import { formatJobDate, JobListItem, normalizeJobStatus } from "@/lib/jobs";
import { backgroundSync } from "@/lib/syncService";

function isVisibleClientJob(job: JobListItem): boolean {
  const clientName = String(job.client_name ?? "").trim();
  return Boolean(clientName) && clientName !== "Unknown Client" && clientName !== "None";
}

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
  const { user, session, role } = useAuth();
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
  const visibleJobs = useMemo(() => jobs.filter(isVisibleClientJob), [jobs]);
  const pulseCards = useMemo(() => {
    const now = new Date();
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    const scheduledToday = visibleJobs.filter((job) => {
      const candidateDate = job.date_scheduled || job.created_at;
      return String(candidateDate).slice(0, 10) === todayKey;
    });

    const scheduledTodayCount = scheduledToday.length;
    const inProgressCount = scheduledToday.filter((job) => normalizeJobStatus(job.status) === "IN_PROGRESS").length;
    const completedCount = scheduledToday.filter((job) => {
      const status = normalizeJobStatus(job.status);
      return status === "COMPLETED" || status === "DONE";
    }).length;
    const pendingDraftsCount = visibleJobs.filter((job) => normalizeJobStatus(job.status) === "DRAFT").length;

    return [
      { label: "Scheduled Today", value: scheduledTodayCount },
      { label: "In Progress", value: inProgressCount },
      { label: "Completed", value: completedCount },
      { label: "Pending Drafts", value: pendingDraftsCount },
    ];
  }, [visibleJobs]);
  const recentActivity = useMemo(() => {
    return visibleJobs.slice(0, 5);
  }, [visibleJobs]);
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
        void backgroundSync().catch((syncError) => {
          setError(toRenderableErrorMessage(syncError, "Unable to refresh dashboard data."));
        });
        const sessionIdentityResponse = await fetch("/api/auth/session", {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

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
          setError(toRenderableErrorMessage(loadError, "Unable to load dashboard pulse."));
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
    <main className="min-h-screen p-4 pb-24 text-gray-900 sm:p-6 md:p-10">
      <section className="mx-auto w-full max-w-5xl rounded-3xl border border-gray-200 bg-white p-6 shadow-sm md:p-8">
        <p className="text-xs uppercase tracking-[0.26em] text-orange-600">Command Center</p>

        {isInstallAvailable ? (
          <button
            type="button"
            onClick={() => void promptInstall()}
            className="mt-3 inline-flex min-h-11 w-full items-center justify-between gap-3 rounded-2xl border border-orange-300 bg-orange-50 px-4 py-3 text-left text-sm font-semibold text-orange-700 transition hover:bg-orange-100"
          >
            <span>Install TradeOps for standalone app access.</span>
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

        {loading ? (
          <section className="mt-6 grid grid-cols-2 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-[88px] animate-pulse rounded-xl bg-gray-200" />
            ))}
          </section>
        ) : null}

        {!loading ? (
          <>
            <section className="mt-6 grid grid-cols-2 gap-4">
              {(() => {
                const completedTotal = visibleJobs.filter((j) => {
                  const s = normalizeJobStatus(j.status);
                  return s === "COMPLETED" || s === "DONE";
                }).length;
                const timeSaved = (completedTotal * 0.5).toFixed(1);
                const timeSavedLabel = completedTotal === 0 ? "0 Hours" : `${timeSaved} Hours`;
                const todayKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`;
                const jobsToday = visibleJobs.filter((j) => String(j.date_scheduled || j.created_at).slice(0, 10) === todayKey).length;
                return (
                  <>
                    <article className="bg-gray-100 border border-gray-200 rounded-xl p-4 shadow-sm col-span-1">
                      <p className="text-xs uppercase text-gray-500 font-bold tracking-wide">Jobs Today</p>
                      <p className="mt-2 text-4xl font-bold text-gray-900">{jobsToday}</p>
                    </article>
                    <article className="bg-gray-100 border border-gray-200 rounded-xl p-4 shadow-sm col-span-1">
                      <p className="text-xs uppercase text-gray-500 font-bold tracking-wide">Time Saved</p>
                      <p className="mt-2 text-4xl font-bold text-gray-900">{timeSavedLabel}</p>
                      <p className="mt-1 text-[11px] text-orange-500">{completedTotal} jobs × 0.5h</p>
                    </article>
                  </>
                );
              })()}
              {pulseCards.map((metric) => (
                <article key={metric.label} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                  <p className="text-xs uppercase text-gray-500 font-bold">{metric.label}</p>
                  <p className="mt-2 text-4xl font-bold text-gray-900">{metric.value}</p>
                </article>
              ))}
            </section>

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
