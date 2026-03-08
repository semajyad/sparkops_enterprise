"use client";

import { createClient } from "@/lib/supabase/client";

type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: {
    message?: string;
  };
};

const TOKEN_REFRESH_LEEWAY_SECONDS = 60;

export class AuthSessionExpiredError extends Error {
  constructor(message = "Session expired") {
    super(message);
    this.name = "AuthSessionExpiredError";
  }
}

async function getLatestAccessToken(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { session: currentSession },
  } = await supabase.auth.getSession();

  if (!currentSession) {
    const { data, error } = await supabase.auth.refreshSession();
    if (error || !data.session?.access_token) {
      return null;
    }
    return data.session.access_token;
  }

  const expiresAt = currentSession.expires_at ?? 0;
  const now = Math.floor(Date.now() / 1000);
  const shouldRefresh = expiresAt - now <= TOKEN_REFRESH_LEEWAY_SECONDS;

  if (shouldRefresh) {
    const { data, error } = await supabase.auth.refreshSession();
    if (error || !data.session?.access_token) {
      await supabase.auth.signOut();
      throw new AuthSessionExpiredError("Session expired. Please sign in again.");
    }
    return data.session.access_token;
  }

  return currentSession.access_token;
}

export async function getBackendHeaders(initHeaders?: HeadersInit): Promise<Headers> {
  const token = await getLatestAccessToken();
  if (!token) {
    throw new AuthSessionExpiredError("No active session. Redirecting to /login.");
  }

  const headers = new Headers(initHeaders ?? {});
  headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return headers;
}

export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = await getBackendHeaders(init.headers ?? {});

  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  if (init.body instanceof FormData) {
    headers.delete("Content-Type");
  } else if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(input, {
    ...init,
    headers,
  });
}

export async function parseApiJson<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    const body = (await response.text()).trim();
    const preview = body.slice(0, 180);
    throw new Error(
      preview.startsWith("<!doctype") || preview.startsWith("<!DOCTYPE")
        ? "Malformed API response: received HTML instead of JSON. Check API base URL and auth redirect behavior."
        : `Malformed API response: expected JSON but got '${contentType || "unknown"}'.`,
    );
  }

  const payload = (await response.json()) as ApiEnvelope<T> | T;
  if (payload && typeof payload === "object" && "success" in payload) {
    const envelope = payload as ApiEnvelope<T>;
    if (!envelope.success) {
      throw new Error(envelope.error?.message ?? "Request failed.");
    }
    return envelope.data as T;
  }

  return payload as T;
}
