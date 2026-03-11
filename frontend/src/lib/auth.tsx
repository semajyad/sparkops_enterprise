"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Session, User } from "@supabase/supabase-js";
import { apiFetch, parseApiJson } from "@/lib/api";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

type AppRole = "OWNER" | "EMPLOYEE" | null;
type AppMode = "ADMIN" | "FIELD";
type AppTrade = "ELECTRICAL" | "PLUMBING";

const MODE_STORAGE_KEY = "tradeops_owner_mode";
const ROLE_STORAGE_KEY = "tradeops_user_role";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  role: AppRole;
  trade: AppTrade;
  organizationDefaultTrade: AppTrade;
  mode: AppMode;
  setMode: (next: AppMode) => void;
  loading: boolean;
};

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  role: null,
  trade: "ELECTRICAL",
  organizationDefaultTrade: "ELECTRICAL",
  mode: "FIELD",
  setMode: () => undefined,
  loading: true,
});

export function AuthProvider({ 
  children,
  initialRole = null,
  initialMode = "FIELD"
}: { 
  children: React.ReactNode;
  initialRole?: AppRole;
  initialMode?: AppMode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = useMemo(() => {
    // Don't create Supabase client during build time
    if (typeof window === "undefined") {
      return null;
    }
    return createClient();
  }, []);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole>(() => {
    if (initialRole === "OWNER" || initialRole === "EMPLOYEE") {
      return initialRole;
    }
    if (typeof window === "undefined") {
      return null;
    }
    const storedRole = window.localStorage.getItem(ROLE_STORAGE_KEY);
    return storedRole === "OWNER" || storedRole === "EMPLOYEE" ? storedRole : null;
  });
  const [trade, setTrade] = useState<AppTrade>("ELECTRICAL");
  const [organizationDefaultTrade, setOrganizationDefaultTrade] = useState<AppTrade>("ELECTRICAL");
  const [mode, setModeState] = useState<AppMode>(() => {
    if (initialMode === "FIELD" || initialMode === "ADMIN") {
      return initialMode;
    }
    if (typeof window === "undefined") {
      return "FIELD";
    }
    const storedMode = window.localStorage.getItem(MODE_STORAGE_KEY);
    return storedMode === "FIELD" || storedMode === "ADMIN" ? storedMode : "FIELD";
  });
  const hasCachedRole = initialRole !== null || (typeof window !== "undefined" && (window.localStorage.getItem(ROLE_STORAGE_KEY) === "OWNER" || window.localStorage.getItem(ROLE_STORAGE_KEY) === "EMPLOYEE"));
  const [loading, setLoading] = useState(!hasCachedRole);
  const [roleLoading, setRoleLoading] = useState(!hasCachedRole);
  const effectiveMode: AppMode = role === "OWNER" ? mode : "FIELD";

  const setMode = useCallback(
    (next: AppMode): void => {
      if (role !== "OWNER") {
        return;
      }
      setModeState(next);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(MODE_STORAGE_KEY, next);
        document.cookie = `${MODE_STORAGE_KEY}=${next}; path=/; max-age=31536000; SameSite=Lax`;
      }
    },
    [role],
  );

  useEffect(() => {
    if (!supabase) return;
    
    let isMounted = true;

    async function hydrateAuth(): Promise<void> {
      const [{ data }, { data: userData }] = await Promise.all([
        supabase!.auth.getSession(),
        supabase!.auth.getUser(),
      ]);
      if (!isMounted) {
        return;
      }
      const sessionUserId = data.session?.user?.id ?? null;
      const verifiedUserId = userData.user?.id ?? null;
      if (sessionUserId && verifiedUserId && sessionUserId !== verifiedUserId) {
        await clearAuthState();
        setSession(null);
        setUser(null);
        setRole(null);
      } else {
        setSession(data.session ?? null);
        setUser(userData.user ?? data.session?.user ?? null);
      }
      setLoading(false);
    }

    void hydrateAuth();

    const {
      data: { subscription },
    } = supabase!.auth.onAuthStateChange((event, nextSession) => {
      if (!isMounted) {
        return;
      }
      setSession(nextSession ?? null);
      setUser(nextSession?.user ?? null);
      if (!nextSession) {
        setRole(null);
        setTrade("ELECTRICAL");
        setOrganizationDefaultTrade("ELECTRICAL");
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(ROLE_STORAGE_KEY);
          document.cookie = `${ROLE_STORAGE_KEY}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
        }
        return;
      }

      void supabase!.auth.getUser().then(({ data: refreshedUserData }) => {
        if (!isMounted) {
          return;
        }
        const refreshed = refreshedUserData.user;
        if (refreshed && refreshed.id === nextSession.user.id) {
          setUser(refreshed);
        }
      });

      if (event === "SIGNED_IN") {
        const onAuthPage = pathname === "/login" || pathname === "/signup" || pathname.startsWith("/auth");
        if (onAuthPage) {
          router.replace("/jobs");
        }
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase, pathname, router]);

  useEffect(() => {
    async function loadRole(): Promise<void> {
      setRoleLoading(true);
      if (!session?.access_token) {
        setRole(null);
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(ROLE_STORAGE_KEY);
        }
        setRoleLoading(false);
        return;
      }

      // Fast path for optimistic UI - set role from localStorage immediately
      let cachedRole: AppRole = null;
      if (typeof window !== "undefined") {
        const storedRole = window.localStorage.getItem(ROLE_STORAGE_KEY);
        if (storedRole === "OWNER" || storedRole === "EMPLOYEE") {
          cachedRole = storedRole as AppRole;
          setRole(cachedRole);
        }
      }

      try {
        const response = await apiFetch(`${API_BASE_URL}/api/v1/auth/handshake`, {
          cache: "no-store",
        });

        if (!response.ok) {
          if (response.status === 401 && typeof window !== "undefined") {
            window.localStorage.removeItem(ROLE_STORAGE_KEY);
            document.cookie = `${ROLE_STORAGE_KEY}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
            window.location.href = "/login";
            return;
          }
          if (!cachedRole) {
            setRole(null);
          }
          return;
        }

        const payload = await parseApiJson<{ role?: string; trade?: string; organization_default_trade?: string }>(response);
        const normalized = (payload.role ?? "").toUpperCase();
        const normalizedTrade = (payload.trade ?? "").toUpperCase();
        const normalizedOrgTrade = (payload.organization_default_trade ?? "").toUpperCase();

        const tradeValue: AppTrade = normalizedTrade === "PLUMBING" ? "PLUMBING" : "ELECTRICAL";
        const orgTradeValue: AppTrade = normalizedOrgTrade === "PLUMBING" ? "PLUMBING" : "ELECTRICAL";
        setTrade(tradeValue);
        setOrganizationDefaultTrade(orgTradeValue);

        if (normalized === "OWNER" || normalized === "EMPLOYEE") {
          setRole(normalized);
          if (typeof window !== "undefined") {
            window.localStorage.setItem(ROLE_STORAGE_KEY, normalized);
            document.cookie = `${ROLE_STORAGE_KEY}=${normalized}; path=/; max-age=31536000; SameSite=Lax`;
          }
        } else {
          if (!cachedRole) {
            setRole(null);
            setTrade("ELECTRICAL");
            setOrganizationDefaultTrade("ELECTRICAL");
            if (typeof window !== "undefined") {
              window.localStorage.removeItem(ROLE_STORAGE_KEY);
              document.cookie = `${ROLE_STORAGE_KEY}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
            }
          }
        }
      } catch {
        if (!cachedRole) {
          setRole(null);
          setTrade("ELECTRICAL");
          setOrganizationDefaultTrade("ELECTRICAL");
          if (typeof window !== "undefined") {
            window.localStorage.removeItem(ROLE_STORAGE_KEY);
            document.cookie = `${ROLE_STORAGE_KEY}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
          }
        }
      } finally {
        setRoleLoading(false);
      }
    }

    void loadRole();
  }, [session]);

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        role,
        trade,
        organizationDefaultTrade,
        mode: effectiveMode,
        setMode,
        loading: loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

export async function clearAuthState(): Promise<void> {
  // Clear Supabase session
  const supabase = createClient();
  await supabase.auth.signOut();
  
  // Clear all localStorage data
  localStorage.clear();
  
  // Clear all cookies
  document.cookie.split(";").forEach((cookie) => {
    const eqPos = cookie.indexOf("=");
    const name = eqPos > -1 ? cookie.slice(0, eqPos) : cookie;
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
  });
}
