"use client";

import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { createJob } from "@/app/actions/createJob";
import { listTeamMembers } from "@/app/profile/actions";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { JobsList } from "@/components/JobsList";
import { useAuth } from "@/lib/auth";
import { putJobInCache, setTeamCache, type CachedTeamMember } from "@/lib/db";
import { toRenderableErrorMessage } from "@/lib/errorSuppression";
import { useGlobalData } from "@/lib/global-data";
import { JobListItem, isMissingJobId } from "@/lib/jobs";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { backgroundSync, queueJobCreate, toCachedJob } from "@/lib/syncService";

const ROGUE_JOB_ID = "rouge-id-if-known";
const CREATE_STEP_TIMEOUT_MS = 12000;
const MODAL_LABEL_CLASS = "block text-xs font-medium text-gray-700 mb-1.5";
const MODAL_INPUT_SMALL_CLASS =
  "mt-0.5 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500";

async function withTimeout<T>(promise: Promise<T>, label: string, timeoutMs = CREATE_STEP_TIMEOUT_MS): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle !== null) {
      clearTimeout(timeoutHandle);
    }
  }
}

export default function JobsPage(): React.JSX.Element {
  const { role, user, organizationDefaultTrade } = useAuth();
  const { jobs: globalJobs, teamMembers: globalTeamMembers, organizationId: currentOrgId, refreshCoreData } = useGlobalData();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"DRAFT" | "DONE" | "SYNCING" | "IN_PROGRESS">("IN_PROGRESS");
  const [timeframe, setTimeframe] = useState<"TODAY" | "YESTERDAY" | "TOMORROW" | "THIS_WEEK" | "NEXT_WEEK" | "LAST_WEEK" | "ALL_TIME">("ALL_TIME");
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
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerMobile, setCustomerMobile] = useState("");
  const [isLoadingTeam, setIsLoadingTeam] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [autoProvisionFailed, setAutoProvisionFailed] = useState(false);
  const [optimisticJobs, setOptimisticJobs] = useState<JobListItem[]>([]);
  const createInFlightRef = useRef(false);

  const isOwner = role === "OWNER";

  useEffect(() => {
    setTeamMembers(globalTeamMembers);
  }, [globalTeamMembers]);

  useEffect(() => {
    setOptimisticJobs((previous) =>
      previous.filter((optimisticJob) => {
        const existsInGlobal = globalJobs.some((globalJob) => String(globalJob.id ?? "").trim() === optimisticJob.id);
        return !existsInGlobal;
      }),
    );
  }, [globalJobs]);

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
    const params = new URLSearchParams(window.location.search);
    if (params.get("deleted") === "1") {
      setToast("Job Deleted");
      const timer = window.setTimeout(() => setToast(null), 2400);
      return () => window.clearTimeout(timer);
    }
    return;
  }, []);

  // Refresh team members when modal opens
  useEffect(() => {
    if (isCreateOpen && isOwner && user?.id) {
      let cancelled = false;
      async function refreshTeam(): Promise<void> {
        setIsLoadingTeam(true);
        const teamResult = await listTeamMembers();
        if (cancelled) {
          setIsLoadingTeam(false);
          return;
        }

        if (teamResult.success) {
          setTeamMembers(teamResult.activeUsers);
          await setTeamCache({
            activeUsers: teamResult.activeUsers,
            pendingInvites: teamResult.pendingInvites,
          });
        }
        setIsLoadingTeam(false);
      }

      void refreshTeam();
      return () => {
        cancelled = true;
      };
    }
  }, [isCreateOpen, isOwner, user?.id]);

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

  useEffect(() => {
    const userId = user?.id;
    if (!userId) {
      return;
    }

    let cancelled = false;
    async function ensureOrganizationProvisioned(): Promise<void> {
      try {
        const supabase = createSupabaseClient();
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("organization_id")
          .eq("id", userId)
          .maybeSingle<{ organization_id: string | null }>();

        if (profileError) {
          throw new Error(profileError.message);
        }

        const organizationId = typeof profile?.organization_id === "string" ? profile.organization_id.trim() : "";
        if (organizationId) {
          if (!cancelled) {
            setAutoProvisionFailed(false);
          }
          return;
        }

        const response = await fetch("/api/organization/auto-provision", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });

        if (!response.ok) {
          const body = await response.text();
          throw new Error(body || `Auto-provision failed (${response.status})`);
        }

        if (!cancelled) {
          setAutoProvisionFailed(false);
        }
      } catch (provisionError) {
        if (cancelled) {
          return;
        }
        const rawMessage = provisionError instanceof Error ? provisionError.message : "";
        if (rawMessage.includes("steal") || rawMessage.includes("Lock broken")) {
          return;
        }
        const provisionMessage = toRenderableErrorMessage(provisionError, "Auto-provisioning organization failed.");
        if (!provisionMessage) {
          return;
        }
        setAutoProvisionFailed(true);
        setError(provisionMessage);
      }
    }

    void ensureOrganizationProvisioned();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;
    setIsRevalidating(true);
    setError(null);
    void refreshCoreData()
      .catch((syncError) => {
        if (!cancelled) {
          setError(toRenderableErrorMessage(syncError, "Unable to refresh jobs."));
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
  }, [refreshCoreData]);

  const jobs: JobListItem[] = useMemo(
    () => {
      const fromGlobal = globalJobs
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
        }));

      const mergedById = new Map<string, JobListItem>();
      for (const optimisticJob of optimisticJobs) {
        mergedById.set(optimisticJob.id, optimisticJob);
      }
      for (const globalJob of fromGlobal) {
        if (!mergedById.has(globalJob.id)) {
          mergedById.set(globalJob.id, globalJob);
        }
      }
      return Array.from(mergedById.values());
    },
    [globalJobs, optimisticJobs]
  );

  async function onCreateManualJob(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (createInFlightRef.current) {
      return;
    }

    createInFlightRef.current = true;
    setIsCreating(true);
    setError(null);

    let optimisticJobId = "";
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
        customer_email: customerEmail.trim() || null,
        customer_mobile: customerMobile.trim() || null,
        organization_id: currentOrgId,
      };
      optimisticJobId = payload.client_generated_id;

      const optimisticJob = {
        id: payload.client_generated_id,
        status: "IN_PROGRESS",
        created_at: new Date().toISOString(),
        date_scheduled: payload.scheduled_date ?? null,
        client_name: payload.client_name,
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
      } satisfies JobListItem;
      setOptimisticJobs((previous) => [optimisticJob, ...previous.filter((job) => job.id !== optimisticJob.id)]);

      const createJobInput = {
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
        customer_email: payload.customer_email,
        customer_mobile: payload.customer_mobile,
        organization_id: payload.organization_id,
      };

      let createJobTimedOut = false;
      try {
        await withTimeout(createJob(createJobInput), "Direct create");
      } catch (directCreateError) {
        const directCreateMessage =
          directCreateError instanceof Error ? directCreateError.message.toLowerCase() : String(directCreateError).toLowerCase();
        if (directCreateMessage.includes("timed out")) {
          createJobTimedOut = true;
        } else {
          throw directCreateError;
        }
      }

      await withTimeout(
        putJobInCache(
        toCachedJob({
          id: payload.client_generated_id,
          client_name: payload.client_name,
          status: "IN_PROGRESS",
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
      ),
        "Local cache update",
      );
      await withTimeout(queueJobCreate(payload), "Queue job create");

      setClientName("");
      setJobTitle("");
      setLocation("");
      setLatitude(null);
      setLongitude(null);
      setAssignedToUserId(user?.id ?? "");
      setScheduledDate("");
      setCustomerEmail("");
      setCustomerMobile("");
      setIsCreateOpen(false);
      if (createJobTimedOut) {
        setToast("Create request queued. Syncing in background.");
      }
      void backgroundSync().catch(() => {});
    } catch (createError) {
      if (optimisticJobId) {
        setOptimisticJobs((previous) => previous.filter((job) => job.id !== optimisticJobId));
      }
      const rawMessage = createError instanceof Error ? createError.message : "";
      if (rawMessage.includes("steal") || rawMessage.includes("Lock broken")) {
        return;
      }
      const message = toRenderableErrorMessage(createError, "Unable to create manual job.");
      if (!message) {
        return;
      }
      setAutoProvisionFailed(message.toLowerCase().includes("auto-provision"));
      setError(message);
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
    result = result.filter((job) => job.status.toUpperCase() === filter);
    
    // Timeframe filtering
    if (timeframe !== "ALL_TIME") {
      const now = new Date();
      now.setHours(0, 0, 0, 0); // Start of today

      result = result.filter((job) => {
        const jobDateStr = job.date_scheduled || job.created_at;
        if (!jobDateStr) return false;
        
        const jobDate = new Date(jobDateStr);
        jobDate.setHours(0, 0, 0, 0); // Normalize to start of day for comparison
        
        const diffDays = Math.round((jobDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        const currentDayOfWeek = now.getDay();
        
        switch (timeframe) {
          case "TODAY":
            return diffDays === 0;
          case "YESTERDAY":
            return diffDays === -1;
          case "TOMORROW":
            return diffDays === 1;
          case "THIS_WEEK":
            // -currentDayOfWeek to get Sunday, +6 to get Saturday
            return diffDays >= -currentDayOfWeek && diffDays <= (6 - currentDayOfWeek);
          case "NEXT_WEEK":
            const nextWeekStart = 7 - currentDayOfWeek;
            return diffDays >= nextWeekStart && diffDays <= nextWeekStart + 6;
          case "LAST_WEEK":
            const lastWeekStart = -currentDayOfWeek - 7;
            return diffDays >= lastWeekStart && diffDays <= lastWeekStart + 6;
          default:
            return true;
        }
      });
    }

    if (!term) {
      return result;
    }

    return result.filter((job) => {
      const dateText = job.created_at.toLowerCase();
      return job.client_name.toLowerCase().includes(term) || dateText.includes(term);
    });
  }, [jobs, search, filter, timeframe]);

  return (
    <main className="min-h-screen p-4 pb-24 text-gray-900 bg-gray-50 sm:p-6 md:p-10">
      <section className="mx-auto w-full max-w-4xl rounded-3xl border border-gray-200 bg-gray-50 p-6 shadow-sm md:p-8">

        <div className="flex flex-col sm:flex-row gap-3">
          <label htmlFor="jobs-search" className="flex flex-1 items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2 text-gray-500">
            <Search className="h-4 w-4 text-orange-600" />
            <input
              id="jobs-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by client or date (e.g. Mar 8)"
              className="w-full bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
            />
          </label>
          <select 
            value={timeframe} 
            onChange={(e) => setTimeframe(e.target.value as "TODAY" | "YESTERDAY" | "TOMORROW" | "THIS_WEEK" | "NEXT_WEEK" | "LAST_WEEK" | "ALL_TIME")}
            className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-orange-500 focus:outline-none"
          >
            <option value="TODAY">Today</option>
            <option value="YESTERDAY">Yesterday</option>
            <option value="TOMORROW">Tomorrow</option>
            <option value="THIS_WEEK">This Week</option>
            <option value="NEXT_WEEK">Next Week</option>
            <option value="LAST_WEEK">Last Week</option>
            <option value="ALL_TIME">All Time</option>
          </select>
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {["IN_PROGRESS", "DRAFT", "DONE"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f as "DRAFT" | "DONE" | "SYNCING" | "IN_PROGRESS")}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition ${
                filter === f
                  ? "bg-orange-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {f === "DRAFT" ? "Drafts" : f === "IN_PROGRESS" ? "To Do" : "Completed"}
            </button>
          ))}
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-500/60 bg-red-50 p-3 text-sm text-red-700">
            <p>{error}</p>
            {autoProvisionFailed ? (
              <Link
                href="/admin/company"
                className="mt-3 inline-flex min-h-10 items-center rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
              >
                Complete Setup
              </Link>
            ) : null}
          </div>
        ) : null}
        {toast ? <p className="mt-4 rounded-xl border border-green-500/50 bg-green-50 p-3 text-sm text-green-700">{toast}</p> : null}

        {!isRevalidating && filteredJobs.length === 0 ? (
          <p className="mt-4 rounded-xl border border-gray-300 bg-white p-4 text-sm text-gray-600">No jobs found</p>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <section className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 pb-3">
              <h2 className="text-base font-semibold text-gray-900">New Job</h2>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full text-gray-600 transition hover:bg-gray-100"
                aria-label="Close create job form"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <form id="new-job-form" className="grid grid-cols-2 gap-4 px-4 py-4" onSubmit={onCreateManualJob}>
                <label className={`${MODAL_LABEL_CLASS} col-span-2`}>
                  Client Name
                  <input
                    type="text"
                    required
                    value={clientName}
                    onChange={(event) => setClientName(event.target.value)}
                    className={MODAL_INPUT_SMALL_CLASS}
                    placeholder="ACME Properties"
                  />
                </label>

                <label className={MODAL_LABEL_CLASS}>
                  Job Title
                  <input
                    type="text"
                    required
                    value={jobTitle}
                    onChange={(event) => setJobTitle(event.target.value)}
                    className={MODAL_INPUT_SMALL_CLASS}
                    placeholder="Switchboard inspection"
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
                    className={MODAL_INPUT_SMALL_CLASS}
                  />
                </label>

                <input type="hidden" name="latitude" value={latitude ?? ""} />
                <input type="hidden" name="longitude" value={longitude ?? ""} />

                <div className="col-span-2 grid grid-cols-2 gap-4">
                  <label className={MODAL_LABEL_CLASS}>
                    Customer Email
                    <input
                      type="email"
                      value={customerEmail}
                      onChange={(event) => setCustomerEmail(event.target.value)}
                      className={MODAL_INPUT_SMALL_CLASS}
                      placeholder="client@email.com"
                    />
                  </label>
                  <label className={MODAL_LABEL_CLASS}>
                    Customer Mobile
                    <input
                      type="tel"
                      value={customerMobile}
                      onChange={(event) => setCustomerMobile(event.target.value)}
                      className={MODAL_INPUT_SMALL_CLASS}
                      placeholder="+64 21 000 0000"
                    />
                  </label>
                </div>

                <div className="col-span-2 grid grid-cols-2 gap-4">
                  {isOwner ? (
                    <label className={MODAL_LABEL_CLASS}>
                      Assign To
                      <select
                        value={assignedToUserId}
                        onChange={(event) => setAssignedToUserId(event.target.value)}
                        className={MODAL_INPUT_SMALL_CLASS}
                        disabled={isLoadingTeam}
                      >
                        <option value={user?.id ?? ""}>Me</option>
                        {teamMembers
                          .filter((member) => member.id !== user?.id)
                          .filter((member) => member.trade === organizationDefaultTrade)
                          .map((member) => (
                            <option key={member.id} value={member.id}>
                              {member.full_name}
                            </option>
                          ))}
                      </select>
                    </label>
                  ) : <div />}
                  <label className={MODAL_LABEL_CLASS}>
                    Scheduled Date
                    <input
                      type="datetime-local"
                      value={scheduledDate}
                      onChange={(event) => setScheduledDate(event.target.value)}
                      className={MODAL_INPUT_SMALL_CLASS}
                    />
                  </label>
                </div>

                <div className="col-span-2 mt-2 border-t border-gray-200 pt-4">
                  <button
                    type="submit"
                    disabled={isCreating}
                    className="w-full rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-700 disabled:opacity-60"
                  >
                    {isCreating ? "Creating..." : "Create Job"}
                  </button>
                </div>
            </form>
          </section>
        </div>
      ) : null}
      </main>
  );
}

