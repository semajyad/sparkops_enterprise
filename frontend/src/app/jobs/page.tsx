"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { Map, Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { JobsList } from "@/components/JobsList";
import { useAuth } from "@/lib/auth";
import { db, putJobInCache } from "@/lib/db";
import { JobListItem, isMissingJobId } from "@/lib/jobs";
import { backgroundSync, pull, queueJobCreate, toCachedJob } from "@/lib/syncService";

const STALE_CACHE_MS = 5 * 60 * 1000;

export default function JobsPage(): React.JSX.Element {
  const { user } = useAuth();
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
  const [toast, setToast] = useState<string | null>(null);

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
    setIsCreating(true);
    setError(null);

    try {
      const payload = {
        client_name: clientName.trim(),
        title: jobTitle.trim(),
        location: location.trim(),
        address: location.trim(),
        latitude: latitude ?? undefined,
        longitude: longitude ?? undefined,
        scheduled_date: scheduledDate || null,
      };

      const optimisticId = crypto.randomUUID();
      await putJobInCache(
        toCachedJob({
          id: optimisticId,
          client_name: payload.client_name,
          status: "SYNCING",
          date_scheduled: payload.scheduled_date,
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
      setScheduledDate("");
      setIsCreateOpen(false);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create manual job.");
    } finally {
      setIsCreating(false);
    }
  }

  const filteredJobs = useMemo(() => {
    const term = search.trim().toLowerCase();
    const safeJobs = jobs.filter((job) => !isMissingJobId(job.id));
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

        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/tracking"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-600 bg-slate-950/70 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-amber-500/60"
          >
            <Map className="h-4 w-4 text-amber-400" />
            Open Map Hub
          </Link>
        </div>

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
        {staleData ? <p className="mt-4 rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 text-xs text-amber-200">Showing cached jobs while revalidating in background.</p> : null}
        {error ? <p className="mt-4 rounded-xl border border-rose-500/60 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</p> : null}
        {toast ? <p className="mt-4 rounded-xl border border-emerald-500/50 bg-emerald-500/10 p-3 text-sm text-emerald-100">{toast}</p> : null}

        {!isRevalidating && filteredJobs.length === 0 ? (
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
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
              <div className="grid gap-3 overflow-y-auto px-5 py-4">
                <label className="text-sm text-slate-200">
                  Client Name
                  <input
                    type="text"
                    required
                    value={clientName}
                    onChange={(event) => setClientName(event.target.value)}
                    className="mt-1 min-h-11 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                    placeholder="ACME Properties"
                  />
                </label>

                <label className="text-sm text-slate-200">
                  Job Title / Description
                  <input
                    type="text"
                    required
                    value={jobTitle}
                    onChange={(event) => setJobTitle(event.target.value)}
                    className="mt-1 min-h-11 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                    placeholder="Switchboard inspection and repairs"
                  />
                </label>

                <label className="text-sm text-slate-200">
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
                  />
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm text-slate-200">
                    Latitude
                    <input
                      type="text"
                      readOnly
                      value={latitude !== null ? latitude.toFixed(6) : ""}
                      className="mt-1 min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 text-slate-200"
                      placeholder="Auto"
                    />
                  </label>
                  <label className="text-sm text-slate-200">
                    Longitude
                    <input
                      type="text"
                      readOnly
                      value={longitude !== null ? longitude.toFixed(6) : ""}
                      className="mt-1 min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 text-slate-200"
                      placeholder="Auto"
                    />
                  </label>
                </div>

                <label className="text-sm text-slate-200">
                  Scheduled Date
                  <input
                    type="date"
                    value={scheduledDate}
                    onChange={(event) => setScheduledDate(event.target.value)}
                    className="mt-1 min-h-11 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 text-slate-100 focus:border-amber-400 focus:outline-none"
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

