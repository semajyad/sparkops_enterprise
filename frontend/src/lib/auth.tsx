"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Session, User } from "@supabase/supabase-js";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

type AppRole = "OWNER" | "EMPLOYEE" | null;

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  role: AppRole;
  loading: boolean;
};

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  role: null,
  loading: true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => {
    // Don't create Supabase client during build time
    if (typeof window === "undefined") {
      return null;
    }
    return createClientComponentClient();
  }, []);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) return;
    
    let isMounted = true;

    async function hydrateAuth(): Promise<void> {
      const { data } = await supabase!.auth.getSession();
      if (!isMounted) {
        return;
      }
      setSession(data.session ?? null);
      setLoading(false);
    }

    void hydrateAuth();

    const {
      data: { subscription },
    } = supabase!.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) {
        return;
      }
      setSession(nextSession ?? null);
      if (!nextSession) {
        setRole(null);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    async function loadRole(): Promise<void> {
      if (!session?.access_token) {
        setRole(null);
        return;
      }

      try {
        const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          cache: "no-store",
        });

        if (!response.ok) {
          setRole(null);
          return;
        }

        const payload = (await response.json()) as { role?: string };
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
        user: session?.user ?? null,
        role,
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
