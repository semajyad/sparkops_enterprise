"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { apiFetch, parseApiJson } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { getTrackingMapCache, setTrackingMapCache } from "@/lib/db";
import { formatJobDate, JobListItem, normalizeJobStatus } from "@/lib/jobs";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import type { Coordinate, MapJob, RouteLine, StaffLocation } from "@/components/TrackingMap";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";
const TrackingMap = dynamic(() => import("@/components/TrackingMap").then((m) => m.TrackingMap), {
  ssr: false,
  loading: () => <div className="h-screen w-screen animate-pulse bg-slate-800/70" />,
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

function normalizeAddressLabel(raw: string): string {
  const parts = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .filter((part) => !/(council|government)/i.test(part));

  if (parts.length === 0) {
    return raw;
  }

  if (parts.length === 1) {
    return parts[0];
  }

  return `${parts[0]}, ${parts[1]}`;
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
  const geolocationUnavailable = typeof window !== "undefined" && !navigator.geolocation;
  const [current, setCurrent] = useState<Coordinate>(DEFAULT_CURRENT);
  const [jobs, setJobs] = useState<MapJob[]>([]);
  const [staffLocations, setStaffLocations] = useState<StaffLocation[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [isDarkTheme, setIsDarkTheme] = useState(false);
  const recenterSignal = 0;
  const [isReady, setIsReady] = useState<boolean>(geolocationUnavailable);
  const lastBeaconRef = useRef<{ coordinate: Coordinate; at: number } | null>(null);

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
    if (typeof window === "undefined") {
      return;
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const updateTheme = () => setIsDarkTheme(media.matches);
    updateTheme();
    media.addEventListener("change", updateTheme);
    return () => media.removeEventListener("change", updateTheme);
  }, []);

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
          const fallbackName = row.user_id === user?.id ? "You" : `Sparky ${row.user_id.slice(0, 6)}`;
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
        setIsReady(true);
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
            const formattedAddress = normalizeAddressLabel(addressOrLocation);
            const normalizedStatus = normalizeJobStatus(job.status);
            const markerState: MapJob["markerState"] =
              normalizedStatus === "DONE"
                ? "done"
                : !hasActiveAssigned
                  ? (hasActiveAssigned = true, "active")
                  : "pending";
            const fallbackName = String(job.extracted_data?.assigned_to_name || job.client_name || "Spark").trim();

            accumulator.push({
              id: job.id,
              clientName: job.client_name || "Unknown Client",
              timeLabel: `Scheduled ${formatJobDate(job.date_scheduled || job.created_at)}`,
              timePill: formatTimePill(job.date_scheduled || job.created_at),
              addressLabel: formattedAddress,
              coordinate,
              navigateUrl: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(formattedAddress)}`,
              avatarUrl: null,
              initials: buildInitials(fallbackName),
              markerState,
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
        setIsReady(true);
        void upsertBeacon(nextCurrent);
      },
      () => {
        setIsReady(true);
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
  }

  return (
    <main className="fixed inset-0 z-0 h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
      {isReady ? (
        <TrackingMap
          current={current}
          jobs={jobs}
          staffLocations={visibleStaffLocations}
          routeLines={routeLines}
          selectedJobId={selectedJobId}
          isDarkTheme={isDarkTheme}
          recenterSignal={recenterSignal}
          onJobSelect={onJobSelect}
        />
      ) : (
        <div className="flex h-screen w-screen items-center justify-center gap-2 text-sm text-slate-100">
          <Loader2 className="h-5 w-5 animate-spin text-amber-400" />
          Initializing map and GPS...
        </div>
      )}

      <section className="pointer-events-none absolute inset-x-0 top-0 z-[100] px-4 pt-4 sm:px-6">
        <div className="pointer-events-auto mx-auto w-fit rounded-full border border-slate-500/60 bg-slate-900/65 px-4 py-2 text-xs font-semibold uppercase tracking-[0.26em] text-slate-100 shadow-lg shadow-black/40 backdrop-blur-md">
          Map Hub
        </div>
      </section>
  </main>
);
}
