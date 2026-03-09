"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Session, User } from "@supabase/supabase-js";
import { apiFetch, parseApiJson } from "@/lib/api";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

type AppRole = "OWNER" | "EMPLOYEE" | null;
type AppMode = "ADMIN" | "FIELD";

const MODE_STORAGE_KEY = "sparkops_owner_mode";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  role: AppRole;
  mode: AppMode;
  setMode: (next: AppMode) => void;
  loading: boolean;
};

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  role: null,
  mode: "FIELD",
  setMode: () => undefined,
  loading: true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
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
  const [role, setRole] = useState<AppRole>(null);
  const [mode, setModeState] = useState<AppMode>(() => {
    if (typeof window === "undefined") {
      return "FIELD";
    }
    const storedMode = window.localStorage.getItem(MODE_STORAGE_KEY);
    return storedMode === "FIELD" || storedMode === "ADMIN" ? storedMode : "FIELD";
  });
  const [loading, setLoading] = useState(true);
  const effectiveMode: AppMode = role === "OWNER" ? mode : "FIELD";

  const setMode = useCallback(
    (next: AppMode): void => {
      if (role !== "OWNER") {
        return;
      }
      setModeState(next);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(MODE_STORAGE_KEY, next);
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
      if (!session?.access_token) {
        setRole(null);
        return;
      }

      try {
        const response = await apiFetch(`${API_BASE_URL}/api/v1/auth/handshake`, {
          cache: "no-store",
        });

        if (!response.ok) {
          setRole(null);
          return;
        }

        const payload = await parseApiJson<{ role?: string }>(response);
        const normalized = (payload.role ?? "").toUpperCase();
        if (normalized === "OWNER" || normalized === "EMPLOYEE") {
          setRole(normalized);
        } else {
          setRole(null);
        }
      } catch {
        setRole(null);
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
        mode: effectiveMode,
        setMode,
        loading,
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
