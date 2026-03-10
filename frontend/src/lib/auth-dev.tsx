"use client";

import { createContext, useContext, useEffect, useState } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

type AppRole = "OWNER" | "EMPLOYEE" | null;

type DevSession = {
  access_token: string;
};

type DevUser = {
  id: string;
};

type AuthContextValue = {
  session: DevSession | null;
  user: DevUser | null;
  role: AppRole;
  loading: boolean;
  login: (_email: string, _password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  role: null,
  loading: true,
  login: async () => undefined,
  logout: () => undefined,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<DevSession | null>(null);
  const [role, setRole] = useState<AppRole>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // For development: auto-login with mock token
    const mockToken = localStorage.getItem("tradeops_mock_token");
    
    if (mockToken) {
      // Validate token with backend
      fetch(`${API_BASE_URL}/api/auth/me`, {
        headers: {
          Authorization: `Bearer ${mockToken}`,
        },
        cache: "no-store",
      })
      .then(response => {
        if (response.ok) {
          setSession({ access_token: mockToken });
          setRole("OWNER");
        } else {
          localStorage.removeItem("tradeops_mock_token");
        }
        setLoading(false);
      })
      .catch(() => {
        localStorage.removeItem("tradeops_mock_token");
        setLoading(false);
      });
    } else {
      Promise.resolve().then(() => setLoading(false));
    }
  }, []);

  const login = async (_email: string, _password: string) => {
    void _email;
    void _password;
    // For development: accept any email/password and create mock session
    const mockToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiMDAwMDAwMDAtMDAwMC0wMDAwLTAwMDAtMDAwMDAwMDAwMDAxIiwib3JnYW5pemF0aW9uX2lkIjoiMDAwMDAwMDAtMDAwMC0wMDAwLTAwMDAtMDAwMDAwMDAwMDAxIiwicm9sZSI6Ik9XTkVSIiwiZXhwIjoxNzcyOTUxNjUyLCJpYXQiOjE3NzI4NjUyNTIsImlzcyI6InNwYXJrb3BzIn0.2mVcRc8u7I_CF_l3drWnrkbhGA3zPP0ZXwl0ALpx32Y";
    
    localStorage.setItem("tradeops_mock_token", mockToken);
    setSession({ access_token: mockToken });
    setRole("OWNER");
  };

  const logout = () => {
    localStorage.removeItem("tradeops_mock_token");
    setSession(null);
    setRole(null);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session ? { id: "mock-user-id" } : null,
        role,
        loading,
        // Add login/logout for development
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue & { login: (email: string, password: string) => Promise<void>; logout: () => void } {
  return useContext(AuthContext);
}