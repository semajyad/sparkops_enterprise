"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { createJob } from "@/app/actions/createJob";
import { listTeamMembers } from "@/app/profile/actions";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { JobsList } from "@/components/JobsList";
import { useAuth } from "@/lib/auth";
import { db, getTeamCache, putJobInCache, setTeamCache, type CachedTeamMember } from "@/lib/db";
import { JobListItem, isMissingJobId } from "@/lib/jobs";
import { backgroundSync, pull, queueJobCreate, toCachedJob } from "@/lib/syncService";

const ROGUE_JOB_ID = "rouge-id-if-known";
const MODAL_INPUT_CLASS =
  "mt-1 min-h-12 w-full rounded-lg border border-gray-300 bg-white px-3 text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500";
const MODAL_LABEL_CLASS = "text-xs font-bold uppercase tracking-[0.12em] text-gray-500";

export default function JobsPage(): React.JSX.Element {
  const { role, user, organizationDefaultTrade } = useAuth();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"ALL" | "DRAFT" | "DONE" | "SYNCING">("ALL");
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
    if (isCreateOpen && !location && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          try {
            const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim();
            if (!mapboxToken) return;
            
            const { latitude: lat, longitude: lng } = position.coords;
            const mapboxUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=address,poi&access_token=${mapboxToken}`;
            
            const response = await fetch(mapboxUrl);
            if (!response.ok) return;
            
            const data = await response.json();
            if (data.features && data.features.length > 0) {
              setLocation(data.features[0].place_name);
              setLatitude(lat);
              setLongitude(lng);
            }
          } catch (e) {
            console.warn("Failed to reverse geocode current location", e);
          }
        },
        () => {
          console.warn("Geolocation permission denied or timeout");
        },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    }
  }, [isCreateOpen, location]);

  useEffect(() => {
    console.log(`[AUTH-TRACE] Page: User ${user ? "found" : "missing"} route=/jobs`);
  }, [user]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("deleted") === "1") {
      setToast("Job Deleted");
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
      (cachedJobs ?? [])
        .filter((job) => {
          const extractedAddress =
            typeof job.extracted_data?.address === "string" ? job.extracted_data.address.trim() : "";
          const normalizedId = String(job.id ?? "").trim();
          return extractedAddress !== "Start typing an address" && normalizedId !== ROGUE_JOB_ID;
        })
        .map((job) => ({
          id: String(job.id ?? "").trim(),
          status: job.status,
          created_at: job.created_at,
          date_scheduled: job.date_scheduled,
          client_name: job.client_name,
          extracted_data: job.extracted_data,
        })),
    [cachedJobs]
  );

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
        required_trade: organizationDefaultTrade,
        scheduled_date: scheduledIso,
      };

      await createJob({
        id: payload.client_generated_id,
        client_name: payload.client_name,
        title: payload.title,
        location: payload.location,
        address: payload.address,
        latitude: payload.latitude ?? null,
        longitude: payload.longitude ?? null,
        assigned_to_user_id: payload.assigned_to_user_id ?? null,
        required_trade: payload.required_trade,
        scheduled_date: payload.scheduled_date,
      });

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
            required_trade: payload.required_trade,
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
    for (const job of jobs.filter((candidate) => candidate.client_name && candidate.client_name !== "Unknown Client" && candidate.client_name !== "None")) {
      if (isMissingJobId(job.id)) {
        continue;
      }
      dedupedById.set(job.id, job);
    }
    const safeJobs = Array.from(dedupedById.values());
    
    let result = safeJobs;
    if (filter !== "ALL") {
      result = result.filter((job) => job.status.toUpperCase() === filter);
    }
    
    if (!term) {
      return result;
    }

    return result.filter((job) => {
      const dateText = job.created_at.toLowerCase();
      return job.client_name.toLowerCase().includes(term) || dateText.includes(term);
    });
  }, [jobs, search, filter]);

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="p-4 pb-24 text-gray-900 sm:p-6 md:p-10">
        <section className="mx-auto w-full max-w-4xl rounded-3xl border border-gray-200 bg-white p-6 shadow-sm md:p-8">
        <p className="text-xs uppercase tracking-[0.26em] text-orange-600">Job Manager</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">All Jobs</h1>

        <label htmlFor="jobs-search" className="mt-6 flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2 text-gray-500">
          <Search className="h-4 w-4 text-orange-600" />
          <input
            id="jobs-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by client or date (e.g. Mar 8)"
            className="w-full bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
          />
        </label>

        <div className="mt-4 flex gap-2">
          {["ALL", "DONE"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f as "ALL" | "DRAFT" | "DONE" | "SYNCING")}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                filter === f
                  ? "bg-orange-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {f === "ALL" ? "All Jobs" : "Completed"}
            </button>
          ))}
        </div>

        {!hasResolvedCache ? <p className="mt-4 text-xs text-gray-500">Loading jobs...</p> : null}
        {error ? <p className="mt-4 rounded-xl border border-red-500/60 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        {toast ? <p className="mt-4 rounded-xl border border-green-500/50 bg-green-50 p-3 text-sm text-green-700">{toast}</p> : null}

        {hasResolvedCache && !isRevalidating && filteredJobs.length === 0 ? (
          <p className="mt-4 rounded-xl border border-gray-300 bg-white p-4 text-sm text-gray-600">No jobs found for your search.</p>
        ) : null}

        <JobsList jobs={filteredJobs} />
      </section>

      <button
        type="button"
        onClick={() => setIsCreateOpen(true)}
        className="fixed bottom-24 right-4 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full bg-orange-600 text-white shadow-lg transition hover:bg-orange-700"
        aria-label="Create new job"
      >
        <Plus className="h-6 w-6" />
      </button>

      {isCreateOpen ? (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4">
          <section className="my-auto flex max-h-[90vh] w-full max-w-lg flex-col overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <h2 className="text-xl font-semibold text-gray-900">New Job</h2>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-gray-300 text-gray-600"
                aria-label="Close new job form"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form className="grid gap-5 px-5 py-4" onSubmit={onCreateManualJob}>
                <label className={MODAL_LABEL_CLASS}>
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

                <label className={MODAL_LABEL_CLASS}>
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

                <label className={MODAL_LABEL_CLASS}>
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
                      setLocation(selection.place_name);
                      setLatitude(selection.lat);
                      setLongitude(selection.lng);
                    }}
                    placeholder="Start typing an address"
                    className={MODAL_INPUT_CLASS}
                  />
                </label>

                <input type="hidden" name="latitude" value={latitude ?? ""} />
                <input type="hidden" name="longitude" value={longitude ?? ""} />

                {isOwner ? (
                  <>
                    <label className={MODAL_LABEL_CLASS}>
                      Assign To
                      <select
                        value={assignedToUserId}
                        onChange={(event) => setAssignedToUserId(event.target.value)}
                        className={MODAL_INPUT_CLASS}
                      >
                        <option value={user?.id ?? ""}>Me</option>
                        {teamMembers
                          .filter((member) => member.id !== user?.id)
                          .filter((member) => member.trade === organizationDefaultTrade)
                          .map((member) => (
                            <option key={member.id} value={member.id}>
                              {member.full_name} ({member.email}) · {member.trade}
                            </option>
                          ))}
                      </select>
                    </label>
                  </>
                ) : null}

                <label className={MODAL_LABEL_CLASS}>
                  Scheduled Date & Time
                  <input
                    type="datetime-local"
                    value={scheduledDate}
                    onChange={(event) => setScheduledDate(event.target.value)}
                    className={MODAL_INPUT_CLASS}
                  />
                </label>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="mb-[20px] min-h-11 w-full rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-700 disabled:opacity-60"
                >
                  {isCreating ? "Creating Job..." : "Create Job"}
                </button>
            </form>
          </section>
        </div>
      ) : null}
      </main>
    </div>
  );
}

