"use client";

import { createContext, useContext, useMemo } from "react";

import { useAuth } from "@/lib/auth";

type UserMode = "ADMIN" | "FIELD";

type UserModeContextValue = {
  mode: UserMode;
  setMode: (next: UserMode) => void;
  isAdminMode: boolean;
};

const UserModeContext = createContext<UserModeContextValue>({
  mode: "FIELD",
  setMode: () => undefined,
  isAdminMode: false,
});

export function UserModeProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { role, mode, setMode } = useAuth();

  const value = useMemo(
    () => ({
      mode,
      setMode,
      isAdminMode: role === "OWNER" && mode === "ADMIN",
    }),
    [mode, role, setMode],
  );

  return <UserModeContext.Provider value={value}>{children}</UserModeContext.Provider>;
}

export function useUserMode(): UserModeContextValue {
  return useContext(UserModeContext);
}
