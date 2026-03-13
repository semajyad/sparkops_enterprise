"use client";

import dynamic from "next/dynamic";
import { Navigation } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { apiFetch, parseApiJson } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { getAdminSettingsCache, getTrackingMapCache, setTrackingMapCache } from "@/lib/db";
import { formatJobDate, JobListItem, normalizeJobStatus } from "@/lib/jobs";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import type { Coordinate, MapJob, RouteLine, StaffLocation } from "@/components/TrackingMap";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";
const MapComponent = dynamic(() => import("@/components/TrackingMap").then((m) => m.TrackingMap), {
  ssr: false,
  loading: () => <div className="h-[calc(100vh-64px)] w-full animate-pulse bg-gray-200" />,
});

type UserLocationRow = {
  user_id: string;
  lat: number | string;
  lng: number | string;
  updated_at: string;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
};

const DEFAULT_CURRENT: Coordinate = { lat: -36.8485, lng: 174.7633 };
const STALE_THRESHOLD_MS = 4 * 60 * 60 * 1000;
const BEACON_INTERVAL_MS = 5 * 60 * 1000;
const BEACON_DISTANCE_KM = 0.5;

function parseCoordinate(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

const ADDRESS_NOISE_PATTERN =
  /(council|government|local board|hibiscus and bays|new\s*z(?:ea|a)land|aotearoa|aotaroa)/i;

function toAddressTitleCase(value: string): string {
  if (/^\d{4}$/.test(value)) {
    return value;
  }
  return value
    .toLowerCase()
    .replace(/\b([a-z])/g, (match) => match.toUpperCase());
}

function sanitizeAddressParts(raw: string): string[] {
  const initialParts = raw
    .split(",")
    .map((part) => part.trim().replace(/\s+/g, " "))
    .filter((part) => part.length > 0)
    .filter((part) => !ADDRESS_NOISE_PATTERN.test(part));

  if (initialParts.length === 0) {
    return [];
  }

  const normalizedParts = [...initialParts];
  if (/^\d+[a-zA-Z]?$/.test(normalizedParts[0]) && normalizedParts[1]) {
    normalizedParts.splice(0, 2, `${normalizedParts[0]} ${normalizedParts[1]}`);
  }

  const postcodeIndex = normalizedParts.findIndex((part) => /^\d{4}$/.test(part));
  const trimmedToPostcode = postcodeIndex >= 0 ? normalizedParts.slice(0, postcodeIndex + 1) : normalizedParts;

  return trimmedToPostcode.map(toAddressTitleCase);
}

function normalizeAddressLabel(raw: string): string {
  const parts = sanitizeAddressParts(raw);

  if (parts.length === 0) {
    return raw.trim();
  }

  if (parts.length === 1) {
    return parts[0];
  }

  return `${parts[0]}, ${parts[1]}`;
}

function normalizeNavigationAddress(raw: string): string {
  const parts = sanitizeAddressParts(raw);

  if (parts.length === 0) {
    return raw.trim();
  }

  return parts.slice(0, 4).join(", ");
}

function extractAssigneeIdCandidates(job: JobListItem): string[] {
  const extracted = job.extracted_data ?? {};
  const unsafeJob = job as JobListItem & Record<string, unknown>;
  const possibleValues = [
    extracted.assigned_to_user_id,
    (extracted as Record<string, unknown>).assigned_user_id,
    (extracted as Record<string, unknown>).assignee_id,
    (unsafeJob as Record<string, unknown>).assigned_to_user_id,
    (unsafeJob as Record<string, unknown>).user_id,
  ];

  return possibleValues
    .map((value) => String(value ?? "").trim())
    .filter((value, index, values) => value.length > 0 && values.indexOf(value) === index);
}

function parseCoordsFromLocation(location: string | undefined): Coordinate | null {
  if (!location) {
    return null;
  }

  const parts = location.split(",").map((part) => Number(part.trim()));
  if (parts.length !== 2 || parts.some((value) => !Number.isFinite(value))) {
    return null;
  }

  const [lat, lng] = parts;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return null;
  }

  return { lat, lng };
}

function distanceKm(a: Coordinate, b: Coordinate): number {
  const deg2rad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = deg2rad(b.lat - a.lat);
  const dLng = deg2rad(b.lng - a.lng);
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(a.lat)) * Math.cos(deg2rad(b.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function buildInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0);

  if (parts.length === 0) {
    return "SP";
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function buildFallbackAvatarDataUri(name: string): string {
  const initials = buildInitials(name || "SparkOps");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" fill="#ea580c"/><text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle" font-family="Arial, sans-serif" font-size="44" font-weight="700" fill="#ffffff">${initials}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function colorFromSeed(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = seed.charCodeAt(index) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 80% 55%)`;
}

function isStale(updatedAt: string): boolean {
  const timestamp = Date.parse(updatedAt);
  if (Number.isNaN(timestamp)) {
    return true;
  }
  return Date.now() - timestamp > STALE_THRESHOLD_MS;
}

function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTimePill(isoDate: string): string {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    return "--:--";
  }
  return parsed.toLocaleTimeString("en-NZ", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default function TrackingIndexPage(): React.JSX.Element {
  const { mode, role, user } = useAuth();
  const isAdminMode = role === "OWNER" && mode === "ADMIN";
  const [current, setCurrent] = useState<Coordinate>(DEFAULT_CURRENT);
  const [jobs, setJobs] = useState<MapJob[]>([]);
  const [staffLocations, setStaffLocations] = useState<StaffLocation[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [recenterSignal, setRecenterSignal] = useState(0);
  const [isLocatingGps, setIsLocatingGps] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return true;
    }
    return Boolean(navigator.geolocation);
  });
  const lastBeaconRef = useRef<{ coordinate: Coordinate; at: number } | null>(null);
  const hasSnappedToGpsRef = useRef(false);

  async function estimateEtaMinutes(jobId: string): Promise<number | null> {
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/eta/lookup/${jobId}`, { cache: "no-store" });
      if (!response.ok) {
        return null;
      }
      const payload = await parseApiJson<{ eta_minutes?: number }>(response);
      const etaMinutes = Number(payload.eta_minutes ?? NaN);
      if (!Number.isFinite(etaMinutes) || etaMinutes <= 0) {
        return null;
      }
      return Math.round(etaMinutes);
    } catch {
      return null;
    }
  }

  async function triggerNavigationAndSms(job: MapJob): Promise<void> {
    window.open(job.navigateUrl, "_blank");
    if (!job.customerMobile) {
      return;
    }

    const etaMinutes = (await estimateEtaMinutes(job.id)) ?? 20;
    try {
      const adminCache = await getAdminSettingsCache();
      await fetch("/api/sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: job.id,
          customer_mobile: job.customerMobile,
          eta_minutes: etaMinutes,
          organization_name: adminCache?.business_name ?? "TradeOps",
        }),
      });
    } catch {
      // Fire-and-forget — never block navigation for SMS
    }
  }

  const visibleStaffLocations = useMemo(() => {
    if (isAdminMode) {
      return staffLocations;
    }
    return staffLocations.filter((staff) => staff.userId === user?.id);
  }, [isAdminMode, staffLocations, user?.id]);

  const orderedJobs = [...jobs];
  const routeLines: RouteLine[] = !isAdminMode && user?.id
    ? [
        {
          id: `route-${user.id}`,
          points: [
            [
              (visibleStaffLocations[0]?.coordinate ?? current).lat,
              (visibleStaffLocations[0]?.coordinate ?? current).lng,
            ],
            ...orderedJobs.map((job) => [job.coordinate.lat, job.coordinate.lng] as [number, number]),
          ],
          color: colorFromSeed(user.id),
        },
      ]
    : visibleStaffLocations.map((staff) => ({
        id: `route-${staff.userId}`,
        points: [
          [staff.coordinate.lat, staff.coordinate.lng] as [number, number],
          ...orderedJobs.map((job) => [job.coordinate.lat, job.coordinate.lng] as [number, number]),
        ],
        color: colorFromSeed(staff.userId),
      }));

  useEffect(() => {
    let watchId: number | null = null;
    const supabase = createSupabaseClient();

    async function upsertBeacon(nextCoordinate: Coordinate): Promise<void> {
      if (!user?.id) {
        return;
      }

      const now = Date.now();
      const lastBeacon = lastBeaconRef.current;
      const exceededTime = !lastBeacon || now - lastBeacon.at >= BEACON_INTERVAL_MS;
      const exceededDistance = !lastBeacon || distanceKm(lastBeacon.coordinate, nextCoordinate) >= BEACON_DISTANCE_KM;

      if (!exceededTime && !exceededDistance) {
        return;
      }

      const { error } = await supabase.from("user_locations").upsert({
        user_id: user.id,
        lat: nextCoordinate.lat,
        lng: nextCoordinate.lng,
        updated_at: new Date().toISOString(),
      });

      if (!error) {
        lastBeaconRef.current = { coordinate: nextCoordinate, at: now };
      }
    }

    async function loadStaffLocations(): Promise<void> {
      const { data, error } = await supabase
        .from("user_locations")
        .select("user_id,lat,lng,updated_at")
        .order("updated_at", { ascending: false });

      if (error || !Array.isArray(data)) {
        return;
      }

      const uniqueUserIds = Array.from(new Set((data as UserLocationRow[]).map((row) => row.user_id)));
      let profileById = new Map<string, ProfileRow>();
      if (uniqueUserIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id,full_name,avatar_url")
          .in("id", uniqueUserIds);

        if (Array.isArray(profiles)) {
          profileById = new Map((profiles as ProfileRow[]).map((profile) => [profile.id, profile]));
        }
      }

      const mapped = (data as UserLocationRow[])
        .map((row) => {
          const lat = parseCoordinate(row.lat);
          const lng = parseCoordinate(row.lng);
          if (lat === null || lng === null) {
            return null;
          }

          const profile = profileById.get(row.user_id);
          const fallbackName = row.user_id === user?.id ? "You" : `TradeOps ${row.user_id.slice(0, 6)}`;
          const resolvedName = profile?.full_name?.trim() || fallbackName;

          return {
            userId: row.user_id,
            name: resolvedName,
            avatarUrl: profile?.avatar_url ?? null,
            initials: buildInitials(resolvedName),
            coordinate: { lat, lng },
            isStale: isStale(row.updated_at),
          } satisfies StaffLocation;
        })
        .filter((row): row is StaffLocation => Boolean(row));

      setStaffLocations(mapped);
    }

    async function bootstrapFromCache(): Promise<void> {
      try {
        const cached = await getTrackingMapCache();
        if (!cached) {
          return;
        }
        setCurrent(cached.current);
        setJobs(
          cached.jobs.map((job) => ({
            ...job,
            timePill: "--:--",
            avatarUrl: null,
            initials: buildInitials(job.clientName || "Spark"),
            markerState: "pending" as const,
          })),
        );
      } catch {
        // best-effort cache hydration
      }
    }

    async function loadMapJobs(): Promise<void> {
      try {
        const response = await apiFetch(`${API_BASE_URL}/api/jobs`, { cache: "no-store" });
        if (!response.ok) {
          return;
        }

        const payload = await parseApiJson<JobListItem[]>(response);
        const todayKey = toLocalDateKey(new Date());
        const todaysJobs = (Array.isArray(payload) ? payload : [])
          .filter((job) => {
            const scheduled = typeof job.date_scheduled === "string" ? job.date_scheduled : null;
            if (!scheduled) {
              return false;
            }
            const parsed = new Date(scheduled);
            if (Number.isNaN(parsed.getTime())) {
              return false;
            }
            return toLocalDateKey(parsed) === todayKey;
          })
          .sort((a, b) => {
            const aTime = Date.parse(a.date_scheduled ?? "");
            const bTime = Date.parse(b.date_scheduled ?? "");
            return aTime - bTime;
          });

        const assigneeIds = Array.from(
          new Set(
            todaysJobs
              .flatMap((job) => extractAssigneeIdCandidates(job))
              .filter((value) => value.length > 0),
          ),
        );
        let assigneeAvatarById = new Map<string, string | null>();
        if (assigneeIds.length > 0) {
          const { data: assignees } = await supabase
            .from("profiles")
            .select("id,avatar_url")
            .in("id", assigneeIds);

          if (Array.isArray(assignees)) {
            assigneeAvatarById = new Map(
              assignees.map((assignee) => [
                String((assignee as { id?: string }).id ?? ""),
                ((assignee as { avatar_url?: string | null }).avatar_url ?? null),
              ]),
            );
          }
        }

        let hasActiveAssigned = false;
        const mappedJobs = todaysJobs.reduce<MapJob[]>((accumulator, job) => {
            const rawLatitude = parseCoordinate(job.extracted_data?.latitude);
            const rawLongitude = parseCoordinate(job.extracted_data?.longitude);
            const fallbackCoords = parseCoordsFromLocation(job.extracted_data?.location || job.extracted_data?.address);

            const coordinate =
              rawLatitude !== null && rawLongitude !== null
                ? { lat: rawLatitude, lng: rawLongitude }
                : fallbackCoords;

            if (!coordinate) {
              return accumulator;
            }

            const addressOrLocation =
              job.extracted_data?.address ||
              job.extracted_data?.location ||
              `${coordinate.lat},${coordinate.lng}`;
            const navigationAddress = normalizeNavigationAddress(addressOrLocation);
            const formattedAddress = normalizeAddressLabel(addressOrLocation);
            const normalizedStatus = normalizeJobStatus(job.status);
            const markerState: MapJob["markerState"] =
              normalizedStatus === "DONE"
                ? "done"
                : !hasActiveAssigned
                  ? (hasActiveAssigned = true, "active")
                  : "pending";
            const fallbackName = String(job.extracted_data?.assigned_to_name || job.client_name || "Spark").trim();
            const assigneeId = extractAssigneeIdCandidates(job)[0] ?? "";
            const avatarUrl =
              job.avatar_url ??
              job.extracted_data?.avatar_url ??
              (assigneeId ? assigneeAvatarById.get(assigneeId) ?? null : null) ??
              buildFallbackAvatarDataUri(fallbackName || "SparkOps");

            const mapLabel = String(job.extracted_data?.job_title ?? job.client_name ?? "Unknown Job").trim();
            accumulator.push({
              id: job.id,
              clientName: mapLabel || "Unknown Job",
              timeLabel: `Scheduled ${formatJobDate(job.date_scheduled || job.created_at)}`,
              timePill: formatTimePill(job.date_scheduled || job.created_at),
              addressLabel: formattedAddress,
              coordinate,
              navigateUrl: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(navigationAddress)}`,
              avatarUrl,
              initials: buildInitials(fallbackName),
              markerState,
              customerMobile: (job.customer_mobile ?? null) as string | null,
            });
            return accumulator;
          }, []);

        setJobs(mappedJobs);
      } catch {
        setJobs([]);
      }
    }

    void bootstrapFromCache();
    void loadMapJobs();
    void loadStaffLocations();

    const channel = supabase
      .channel("user_locations-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_locations" },
        () => {
          void loadStaffLocations();
        },
      )
      .subscribe();

    if (!navigator.geolocation) {
      return () => {
        void supabase.removeChannel(channel);
      };
    }

    watchId = navigator.geolocation.watchPosition(
      (position) => {
        const nextCurrent = { lat: position.coords.latitude, lng: position.coords.longitude };
        setCurrent(nextCurrent);
        setIsLocatingGps(false);
        if (!hasSnappedToGpsRef.current) {
          hasSnappedToGpsRef.current = true;
          setRecenterSignal((prev) => prev + 1);
        }
        void upsertBeacon(nextCurrent);
      },
      () => {
        setIsLocatingGps(false);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10_000,
      },
    );

    return () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
      void supabase.removeChannel(channel);
    };
  }, [user?.id]);

  useEffect(() => {
    void setTrackingMapCache({ current, jobs });
  }, [current, jobs]);

  function onJobSelect(jobId: string): void {
    setSelectedJobId(jobId);
    const selectedJob = jobs.find((job) => job.id === jobId);
    if (!selectedJob) {
      return;
    }
    void triggerNavigationAndSms(selectedJob);
  }

  const nextJob = useMemo(() => {
    if (!user?.id) return null;
    
    const candidateJobs = jobs.filter((job) => {
      // 3. Status To Do / IN_PROGRESS / DRAFT (Pending) - tracked via markerState in map context
      if (job.markerState === "done") return false;
      return true;
    });

    return candidateJobs.length > 0 ? candidateJobs[0] : null;
  }, [jobs, user?.id]);

  return (
    <main className="relative min-h-screen overflow-hidden text-gray-900">
      <div className="relative h-[calc(100vh-64px)] w-full overflow-hidden">
        <MapComponent
          current={current}
          jobs={jobs}
          staffLocations={visibleStaffLocations}
          routeLines={routeLines}
          selectedJobId={selectedJobId}
          recenterSignal={recenterSignal}
          onJobSelect={onJobSelect}
        />
      </div>

      <section className="pointer-events-none absolute inset-x-0 top-0 z-[100] px-4 pt-4 sm:px-6">
        <div className="flex flex-col items-center gap-3">
          <div className="pointer-events-auto w-fit rounded-full border border-gray-200 bg-white/90 px-4 py-2 text-xs font-semibold uppercase tracking-[0.26em] text-gray-700 shadow-sm backdrop-blur-md">
            Map Hub
          </div>
          {nextJob ? (
            <button
              onClick={async () => {
                await triggerNavigationAndSms(nextJob);
              }}
              className="pointer-events-auto flex items-center gap-2 rounded-full bg-white px-4 py-3 text-sm font-semibold text-gray-900 shadow-lg border border-gray-100 transition hover:bg-gray-50 active:scale-95"
            >
              <Navigation className="h-4 w-4 text-orange-600" />
              <span>Next: {nextJob.clientName || "Job"}</span>
            </button>
          ) : null}
        </div>
      </section>
      {isLocatingGps ? (
        <div className="pointer-events-none absolute right-4 top-20 z-[120] rounded-full border border-orange-200 bg-white/95 px-3 py-1.5 text-xs font-semibold text-orange-700 shadow-sm sm:right-6">
          Locating GPS...
        </div>
      ) : null}
  </main>
);
}
