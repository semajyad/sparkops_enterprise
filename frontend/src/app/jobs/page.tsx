"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { listTeamMembers } from "@/app/profile/actions";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { JobsList } from "@/components/JobsList";
import { useAuth } from "@/lib/auth";
import { db, getTeamCache, putJobInCache, setTeamCache, type CachedTeamMember } from "@/lib/db";
import { JobListItem, isMissingJobId } from "@/lib/jobs";
import { backgroundSync, pull, queueJobCreate, toCachedJob } from "@/lib/syncService";

const STALE_CACHE_MS = 5 * 60 * 1000;
const MODAL_INPUT_CLASS = "mt-1 min-h-11 w-full rounded-md border border-gray-300 bg-slate-950 px-3 text-slate-100 shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500";

export default function JobsPage(): React.JSX.Element {
  const { role, user } = useAuth();
  const [search, setSearch] = useState("");
  const [isRevalidating, setIsRevalidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [clientName, setClientName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [location, setLocation] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [scheduledDate, setScheduledDate] = useState("");
  const [teamMembers, setTeamMembers] = useState<CachedTeamMember[]>([]);
  const [assignedToUserId, setAssignedToUserId] = useState<string>("");
  const [toast, setToast] = useState<string | null>(null);
  const createInFlightRef = useRef(false);

  const isOwner = role === "OWNER";

  useEffect(() => {
    console.log(`[AUTH-TRACE] Page: User ${user ? "found" : "missing"} route=/jobs`);
  }, [user]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("deleted") === "1") {
      setToast("Draft Deleted");
      const timer = window.setTimeout(() => setToast(null), 2400);
      return () => window.clearTimeout(timer);
    }
    return;
  }, []);

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    if (!isOwner) {
      setAssignedToUserId(user.id);
      return;
    }

    let cancelled = false;
    async function hydrateTeam(): Promise<void> {
      const cached = await getTeamCache();
      if (cancelled) {
        return;
      }

      if (cached) {
        setTeamMembers(cached.activeUsers);
      }

      const teamResult = await listTeamMembers();
      if (cancelled) {
        return;
      }

      if (teamResult.success) {
        setTeamMembers(teamResult.activeUsers);
        await setTeamCache({
          activeUsers: teamResult.activeUsers,
          pendingInvites: teamResult.pendingInvites,
        });
      }
    }

    void hydrateTeam();
    return () => {
      cancelled = true;
    };
  }, [isOwner, user?.id]);

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    if (!isOwner) {
      setAssignedToUserId(user.id);
      return;
    }

    if (!assignedToUserId) {
      setAssignedToUserId(user.id);
      return;
    }

    const hasSelectedMember = teamMembers.some((member) => member.id === assignedToUserId);
    if (assignedToUserId !== user.id && !hasSelectedMember) {
      setAssignedToUserId(user.id);
    }
  }, [assignedToUserId, isOwner, teamMembers, user?.id]);

  const cachedJobs = useLiveQuery(() => db.jobs.orderBy("updated_at").reverse().toArray(), []);
  const hasResolvedCache = Array.isArray(cachedJobs);
  const cacheIsEmpty = hasResolvedCache && cachedJobs.length === 0;

  useEffect(() => {
    if (!hasResolvedCache) {
      return;
    }

    let cancelled = false;
    setIsRevalidating(!cacheIsEmpty);
    setError(null);

    const syncTask = cacheIsEmpty ? pull() : backgroundSync();
    void syncTask
      .catch((syncError) => {
        if (!cancelled) {
          setError(syncError instanceof Error ? syncError.message : "Unable to refresh jobs.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsRevalidating(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [cacheIsEmpty, hasResolvedCache]);

  const jobs: JobListItem[] = useMemo(
    () =>
      (cachedJobs ?? []).map((job) => ({
        id: String(job.id ?? "").trim(),
        status: job.status,
        created_at: job.created_at,
        date_scheduled: job.date_scheduled,
        client_name: job.client_name,
        extracted_data: job.extracted_data,
      })),
    [cachedJobs]
  );

  const hasLocalData = jobs.length > 0;

  const staleData = useMemo(() => {
    if (jobs.length === 0 || !cachedJobs) {
      return false;
    }
    const cutoff = Date.now() - STALE_CACHE_MS;
    return cachedJobs.every((job) => (job.stale_at ?? 0) < cutoff);
  }, [cachedJobs, jobs.length]);

  async function onCreateManualJob(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (createInFlightRef.current) {
      return;
    }

    createInFlightRef.current = true;
    setIsCreating(true);
    setError(null);

    try {
      const scheduledIso =
        scheduledDate.trim().length > 0
          ? (() => {
              const parsed = new Date(scheduledDate);
              return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
            })()
          : null;

      const payload = {
        client_generated_id: crypto.randomUUID(),
        client_name: clientName.trim(),
        title: jobTitle.trim(),
        location: location.trim(),
        address: location.trim(),
        latitude: latitude ?? undefined,
        longitude: longitude ?? undefined,
        assigned_to_user_id: isOwner ? assignedToUserId || user?.id : user?.id,
        scheduled_date: scheduledIso,
      };

      await putJobInCache(
        toCachedJob({
          id: payload.client_generated_id,
          client_name: payload.client_name,
          status: "SYNCING",
          date_scheduled: payload.scheduled_date ?? null,
          extracted_data: {
            client: payload.client_name,
            job_title: payload.title,
            location: payload.location,
            address: payload.address,
            latitude: payload.latitude,
            longitude: payload.longitude,
            scheduled_date: payload.scheduled_date,
          },
          sync_status: "pending",
        })
      );
      await queueJobCreate(payload);
      await backgroundSync();

      setClientName("");
      setJobTitle("");
      setLocation("");
      setLatitude(null);
      setLongitude(null);
      setAssignedToUserId(user?.id ?? "");
      setScheduledDate("");
      setIsCreateOpen(false);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create manual job.");
    } finally {
      setIsCreating(false);
      createInFlightRef.current = false;
    }
  }

  const filteredJobs = useMemo(() => {
    const term = search.trim().toLowerCase();
    const dedupedById = new Map<string, JobListItem>();
    for (const job of jobs) {
      if (isMissingJobId(job.id)) {
        continue;
      }
      dedupedById.set(job.id, job);
    }
    const safeJobs = Array.from(dedupedById.values());
    if (!term) {
      return safeJobs;
    }

    return safeJobs.filter((job) => {
      const dateText = job.created_at.toLowerCase();
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

        {hasLocalData && isRevalidating ? <p className="mt-4 text-xs text-slate-400">Refreshing in background...</p> : null}
        {!hasResolvedCache ? <p className="mt-4 text-xs text-slate-400">Loading local jobs...</p> : null}
        {staleData ? <p className="mt-4 rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 text-xs text-amber-200">Showing cached jobs while revalidating in background.</p> : null}
        {error ? <p className="mt-4 rounded-xl border border-rose-500/60 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</p> : null}
        {toast ? <p className="mt-4 rounded-xl border border-emerald-500/50 bg-emerald-500/10 p-3 text-sm text-emerald-100">{toast}</p> : null}

        {hasResolvedCache && !isRevalidating && filteredJobs.length === 0 ? (
          <p className="mt-4 rounded-xl border border-slate-700 bg-slate-950/70 p-4 text-sm text-slate-300">No jobs found for your search.</p>
        ) : null}

        <JobsList jobs={filteredJobs} />
      </section>

      <button
        type="button"
        onClick={() => setIsCreateOpen(true)}
        className="fixed bottom-24 right-4 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full bg-amber-500 text-slate-950 shadow-lg shadow-black/50 transition hover:bg-amber-400"
        aria-label="Create new job"
      >
        <Plus className="h-6 w-6" />
      </button>

      {isCreateOpen ? (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4">
          <section className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl shadow-black/70">
            <div className="flex items-center justify-between border-b border-slate-700 px-5 py-4">
              <h2 className="text-xl font-semibold text-slate-100">New Job</h2>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-slate-600 text-slate-300"
                aria-label="Close new job form"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form className="flex h-full flex-col" onSubmit={onCreateManualJob}>
              <div className="grid overflow-y-auto px-5 py-4 pb-24">
                <label className="mb-4 text-sm text-slate-200">
                  Client Name
                  <input
                    type="text"
                    required
                    value={clientName}
                    onChange={(event) => setClientName(event.target.value)}
                    className={MODAL_INPUT_CLASS}
                    placeholder="ACME Properties"
                  />
                </label>

                <label className="mb-4 text-sm text-slate-200">
                  Job Title / Description
                  <input
                    type="text"
                    required
                    value={jobTitle}
                    onChange={(event) => setJobTitle(event.target.value)}
                    className={MODAL_INPUT_CLASS}
                    placeholder="Switchboard inspection and repairs"
                  />
                </label>

                <label className="mb-4 text-sm text-slate-200">
                  Address
                  <AddressAutocomplete
                    id="job-address"
                    value={location}
                    onChange={(next) => {
                      setLocation(next);
                      setLatitude(null);
                      setLongitude(null);
                    }}
                    onSelect={(selection) => {
                      setLocation(selection.label);
                      setLatitude(selection.latitude);
                      setLongitude(selection.longitude);
                    }}
                    placeholder="Start typing an address"
                    className={MODAL_INPUT_CLASS}
                  />
                </label>

                <input type="hidden" name="latitude" value={latitude ?? ""} />
                <input type="hidden" name="longitude" value={longitude ?? ""} />

                {isOwner ? (
                  <label className="mb-4 text-sm text-slate-200">
                    Assign To
                    <select
                      value={assignedToUserId}
                      onChange={(event) => setAssignedToUserId(event.target.value)}
                      className={MODAL_INPUT_CLASS}
                    >
                      <option value={user?.id ?? ""}>Me</option>
                      {teamMembers
                        .filter((member) => member.id !== user?.id)
                        .map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.full_name} ({member.email})
                          </option>
                        ))}
                    </select>
                  </label>
                ) : null}

                <label className="mb-4 text-sm text-slate-200">
                  Scheduled Date & Time
                  <input
                    type="datetime-local"
                    value={scheduledDate}
                    onChange={(event) => setScheduledDate(event.target.value)}
                    className={MODAL_INPUT_CLASS}
                  />
                </label>
              </div>

              <div className="sticky bottom-0 border-t border-slate-700 bg-slate-900/95 px-5 py-3">
                <button
                  type="submit"
                  disabled={isCreating}
                  className="min-h-11 w-full rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 disabled:opacity-60"
                >
                  {isCreating ? "Creating Draft..." : "Create Draft Job"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </main>
  );
}

