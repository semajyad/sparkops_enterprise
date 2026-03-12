"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { listTeamMembers } from "@/app/profile/actions";
import { useAuth } from "@/lib/auth";
import { db, getTeamCache, getTrackingMapCache, setTeamCache, type CachedJob, type CachedTeamMember } from "@/lib/db";
import { JobListItem } from "@/lib/jobs";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { backgroundSync } from "@/lib/syncService";

type AppRole = "OWNER" | "EMPLOYEE" | null;

type GlobalDataContextValue = {
  resolvedRole: AppRole;
  organizationId: string | null;
  jobs: JobListItem[];
  teamMembers: CachedTeamMember[];
  lastKnownLocation: { lat: number; lng: number } | null;
  isLoading: boolean;
  hasBootstrapped: boolean;
  refreshCoreData: () => Promise<void>;
};

const GlobalDataContext = createContext<GlobalDataContextValue>({
  resolvedRole: null,
  organizationId: null,
  jobs: [],
  teamMembers: [],
  lastKnownLocation: null,
  isLoading: true,
  hasBootstrapped: false,
  refreshCoreData: async () => undefined,
});

function mapJobs(rows: CachedJob[]): JobListItem[] {
  return rows.map((job) => ({
    id: String(job.id ?? "").trim(),
    status: job.status,
    created_at: job.created_at,
    date_scheduled: job.date_scheduled,
    client_name: job.client_name,
    extracted_data: job.extracted_data,
  }));
}

export function GlobalDataProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { role, user } = useAuth();
  const [cachedRole] = useState<AppRole>(() => {
    if (typeof window === "undefined") {
      return null;
    }
    const cachedRole = window.localStorage.getItem("tradeops_user_role");
    return cachedRole === "OWNER" || cachedRole === "EMPLOYEE" ? cachedRole : null;
  });
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [teamMembers, setTeamMembers] = useState<CachedTeamMember[]>([]);
  const [lastKnownLocation, setLastKnownLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasBootstrapped, setHasBootstrapped] = useState(false);
  const [profileResolvedRole, setProfileResolvedRole] = useState<AppRole>(null);
  const resolvedRole: AppRole = role ?? profileResolvedRole ?? cachedRole;

  const loadCachedData = useCallback(async (): Promise<void> => {
    const [jobRows, cachedTeam, cachedMap] = await Promise.all([
      db.jobs.orderBy("updated_at").reverse().toArray(),
      getTeamCache(),
      getTrackingMapCache(),
    ]);

    setJobs(mapJobs(jobRows));
    setTeamMembers(cachedTeam?.activeUsers ?? []);
    setLastKnownLocation(cachedMap?.current ?? null);
  }, []);

  const refreshCoreData = useCallback(async (): Promise<void> => {
    const userId = user?.id;
    if (!userId) {
      return;
    }

    const supabase = createSupabaseClient();

    await Promise.all([
      backgroundSync().catch(() => undefined),
      (async () => {
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("organization_id, role")
          .eq("id", userId)
          .maybeSingle<{ organization_id: string | null; role: string | null }>();
        if (profileError) {
          throw profileError;
        }
        const nextOrganizationId = typeof profile?.organization_id === "string" ? profile.organization_id.trim() : "";
        setOrganizationId(nextOrganizationId || null);
        const normalizedRole = typeof profile?.role === "string" ? profile.role.trim().toUpperCase() : "";
        if (normalizedRole === "OWNER" || normalizedRole === "EMPLOYEE") {
          setProfileResolvedRole(normalizedRole as AppRole);
        } else {
          setProfileResolvedRole("OWNER");
        }
      })(),
      role === "OWNER"
        ? (async () => {
            const teamResult = await listTeamMembers();
            if (!teamResult.success) {
              return;
            }
            setTeamMembers(teamResult.activeUsers);
            await setTeamCache({
              activeUsers: teamResult.activeUsers,
              pendingInvites: teamResult.pendingInvites,
            });
          })()
        : Promise.resolve(),
    ]);

    const refreshedRows = await db.jobs.orderBy("updated_at").reverse().toArray();
    setJobs(mapJobs(refreshedRows));
  }, [role, user?.id]);

  useEffect(() => {
    if ((role === "OWNER" || role === "EMPLOYEE") && typeof window !== "undefined") {
      window.localStorage.setItem("tradeops_user_role", role);
    }
  }, [role]);

  useEffect(() => {
    let cancelled = false;
    const failsafe = window.setTimeout(() => {
      if (cancelled) {
        return;
      }
      setProfileResolvedRole((currentRole) => currentRole ?? "OWNER");
      setIsLoading(false);
      console.warn("Global state hydration timed out; forcing resolution.");
    }, 2000);

    async function bootstrap(): Promise<void> {
      try {
        await loadCachedData();
        if (cancelled) {
          return;
        }
        setHasBootstrapped(true);
        await refreshCoreData();
      } catch (error) {
        console.error("Failed to hydrate global state:", error);
      } finally {
        window.clearTimeout(failsafe);
        if (!cancelled) {
          setProfileResolvedRole((currentRole) => currentRole ?? "OWNER");
          setIsLoading(false);
        }
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
      window.clearTimeout(failsafe);
    };
  }, [loadCachedData, refreshCoreData]);

  const value = useMemo<GlobalDataContextValue>(
    () => ({
      resolvedRole,
      organizationId,
      jobs,
      teamMembers,
      lastKnownLocation,
      isLoading,
      hasBootstrapped,
      refreshCoreData,
    }),
    [resolvedRole, organizationId, jobs, teamMembers, lastKnownLocation, isLoading, hasBootstrapped, refreshCoreData],
  );

  return <GlobalDataContext.Provider value={value}>{children}</GlobalDataContext.Provider>;
}

export function useGlobalData(): GlobalDataContextValue {
  return useContext(GlobalDataContext);
}
