"use client";

import { useEffect } from "react";

import { isSupabaseLockConflictError } from "@/lib/errorSuppression";

export function GlobalErrorSuppressor(): React.JSX.Element | null {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      if (isSupabaseLockConflictError(event.error ?? event.message)) {
        event.preventDefault();
      }
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (isSupabaseLockConflictError(event.reason)) {
        event.preventDefault();
      }
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  return null;
}
