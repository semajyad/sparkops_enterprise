"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import { signOut } from "@/app/login/actions";
import { updateProfile } from "@/app/profile/actions";
import { LadderModeToggle } from "@/components/LadderModeToggle";
import { apiFetch, AuthSessionExpiredError, parseApiJson } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { getProfileCache, setProfileCache } from "@/lib/db";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

type AuthMePayload = {
  id: string;
  organization_id: string;
  role: string;
  email?: string | null;
  full_name?: string | null;
};

export default function ProfilePage(): React.JSX.Element {
  const { user, session, loading: authLoading, mode, setMode } = useAuth();
  const [details, setDetails] = useState<AuthMePayload | null>(null);
  const [sessionIdentity, setSessionIdentity] = useState<{ full_name: string | null; email: string | null; organization: string | null } | null>(null);
  const [ladderEnabled, setLadderEnabled] = useState(false);
  const [isSavingLadder, setIsSavingLadder] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [fullNameInput, setFullNameInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [organizationInput, setOrganizationInput] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [isPendingUpdate, startUpdateTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    void getProfileCache()
      .then((cached) => {
        if (!cached || cancelled) {
          return;
        }

        setSessionIdentity({
          full_name: cached.full_name,
          email: cached.email,
          organization: cached.organization,
        });
        setDetails((prev) =>
          prev
            ? {
                ...prev,
                organization_id: cached.organization_id ?? prev.organization_id,
                role: cached.role ?? prev.role,
                email: cached.email ?? prev.email,
                full_name: cached.full_name ?? prev.full_name,
              }
            : {
                id: "",
                organization_id: cached.organization_id ?? "",
                role: cached.role ?? "",
                email: cached.email,
                full_name: cached.full_name,
              },
        );
      })
      .catch(() => {
        // cache hydration is best-effort
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    async function loadProfile(): Promise<void> {
      setMessage(null);

      try {
        const sessionIdentityResponse = await fetch("/api/auth/session", {
          cache: "no-store",
          headers: session?.access_token
            ? {
                Authorization: `Bearer ${session.access_token}`,
              }
            : undefined,
        });
        if (sessionIdentityResponse.ok) {
          const identityPayload = (await sessionIdentityResponse.json()) as {
            user?: { full_name?: string | null; email?: string | null; organization?: string | null } | null;
          };
          setSessionIdentity({
            full_name: typeof identityPayload.user?.full_name === "string" ? identityPayload.user.full_name : null,
            email: typeof identityPayload.user?.email === "string" ? identityPayload.user.email : null,
            organization: typeof identityPayload.user?.organization === "string" ? identityPayload.user.organization : null,
          });
        } else {
          setSessionIdentity(null);
        }

        if (!session?.access_token) {
          setDetails(null);
          return;
        }

        const meResponse = await apiFetch(`${API_BASE_URL}/api/auth/me`, { cache: "no-store" });
        if (meResponse.ok) {
          const mePayload = await parseApiJson<AuthMePayload>(meResponse);
          setDetails(mePayload);
        }

        try {
          const ladderResponse = await apiFetch(`${API_BASE_URL}/api/twilio/ladder-mode`, { cache: "no-store" });
          if (ladderResponse.ok) {
            const ladderPayload = await parseApiJson<{ enabled: boolean }>(ladderResponse);
            setLadderEnabled(Boolean(ladderPayload.enabled));
          }
        } catch (ladderError) {
          console.warn("Profile: ladder-mode fetch failed", ladderError);
        }
      } catch (error) {
        if (error instanceof AuthSessionExpiredError) {
          setMessage("Session expired. Please sign in again.");
        } else {
          setMessage(error instanceof Error ? error.message : "Unable to load profile details.");
        }
      } finally {
        setLoading(false);
      }
    }

    void loadProfile();
  }, [authLoading, session?.access_token]);

  useEffect(() => {
    const cachedPayload = {
      full_name: details?.full_name || sessionIdentity?.full_name || user?.user_metadata?.full_name || null,
      email: details?.email || sessionIdentity?.email || user?.email || null,
      organization:
        sessionIdentity?.organization ||
        (typeof user?.user_metadata?.organization === "string" ? user.user_metadata.organization.trim() : "") ||
        null,
      organization_id: details?.organization_id ?? null,
      role: details?.role ?? null,
    };

    if (!cachedPayload.full_name && !cachedPayload.email && !cachedPayload.organization && !cachedPayload.organization_id && !cachedPayload.role) {
      return;
    }

    void setProfileCache(cachedPayload);
  }, [details?.email, details?.full_name, details?.organization_id, details?.role, sessionIdentity?.email, sessionIdentity?.full_name, sessionIdentity?.organization, user?.email, user?.user_metadata?.full_name, user?.user_metadata?.organization]);

  async function onLadderChange(next: boolean): Promise<void> {
    const previous = ladderEnabled;
    setLadderEnabled(next);
    setIsSavingLadder(true);
    setMessage("Updating Ladder Mode...");
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/twilio/ladder-mode`, {
        method: "POST",
        body: JSON.stringify({ enabled: next }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || `Failed to update Ladder Mode (${response.status})`);
      }

      const payload = await parseApiJson<{ enabled: boolean }>(response);
      setLadderEnabled(Boolean(payload.enabled));
      setMessage(next ? "Ladder Mode activated." : "Ladder Mode disabled.");
    } catch (error) {
      setLadderEnabled(previous);
      setMessage(error instanceof Error ? error.message : "Unable to update Ladder Mode.");
    } finally {
      setIsSavingLadder(false);
    }
  }

  const displayName =
    details?.full_name ||
    sessionIdentity?.full_name ||
    user?.user_metadata?.full_name ||
    details?.email ||
    sessionIdentity?.email ||
    user?.email ||
    "Sparky";
  const displayEmail = details?.email || sessionIdentity?.email || user?.email || "Unknown";
  const metadataOrganization = typeof user?.user_metadata?.organization === "string" ? user.user_metadata.organization.trim() : "";
  const displayOrganization = sessionIdentity?.organization || metadataOrganization || "Unknown";
  const isOwner = String(details?.role ?? "").toUpperCase() === "OWNER";

  useEffect(() => {
    setFullNameInput(displayName === "Sparky" ? "" : displayName);
    setEmailInput(displayEmail === "Unknown" ? "" : displayEmail);
    setOrganizationInput(displayOrganization === "Unknown" ? "" : displayOrganization);
  }, [displayName, displayEmail, displayOrganization]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);


  function onSubmitProfileUpdate(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const formData = new FormData();
    formData.set("full_name", fullNameInput);
    formData.set("email", emailInput);
    formData.set("organization", organizationInput);

    startUpdateTransition(() => {
      void updateProfile(formData).then((result) => {
        setMessage(result.message);
        if (result.success) {
          setToast("Profile Updated");
          setSessionIdentity({
            full_name: fullNameInput.trim() || null,
            email: emailInput.trim() || null,
            organization: organizationInput.trim() || null,
          });
          setDetails((prev) =>
            prev
              ? {
                  ...prev,
                  full_name: fullNameInput.trim() || null,
                  email: emailInput.trim() || null,
                }
              : prev,
          );
          setIsEditOpen(false);
        }
      });
    });
  }

  return (
    <main className="min-h-screen bg-slate-950 p-4 pb-24 text-slate-100 sm:p-6 md:p-10">
      <section className="mx-auto w-full max-w-4xl rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-black/50 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.26em] text-amber-400">Profile</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{displayName}</h1>
            <p className="text-sm text-slate-300">{displayEmail}</p>
          </div>
        </div>

        {loading ? (
          <div className="mt-6 inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-slate-300">
            <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
            Syncing profile in background...
          </div>
        ) : null}

        <div className="mt-6 grid gap-3 rounded-2xl border border-slate-700 bg-slate-950/70 p-4 text-sm text-slate-300 sm:grid-cols-2">
          <p><span className="font-semibold text-slate-100">Role:</span> {details?.role ?? "Unknown"}</p>
          <p><span className="font-semibold text-slate-100">Organization:</span> {displayOrganization}</p>
        </div>

        <div className="mt-4">
          <button
            type="button"
            onClick={() => setIsEditOpen(true)}
            className="inline-flex min-h-11 items-center rounded-xl border border-amber-400/60 bg-amber-500/20 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/30"
          >
            Edit Profile
          </button>
        </div>

        {isOwner ? (
          <section className="mt-6 rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-300">App Settings</h2>
            <p className="mt-1 text-xs text-slate-400">Session Mode</p>
            <div className="mt-3 inline-flex rounded-full bg-slate-700 p-1 shadow-inner shadow-black/35">
              <button
                type="button"
                onClick={() => setMode("FIELD")}
                className={`min-h-11 rounded-full px-4 py-2 text-sm font-semibold transition ${
                  mode === "FIELD"
                    ? "bg-white text-slate-900 shadow-sm shadow-slate-950/40"
                    : "text-slate-200 hover:text-white"
                }`}
              >
                Field
              </button>
              <button
                type="button"
                onClick={() => setMode("ADMIN")}
                className={`min-h-11 rounded-full px-4 py-2 text-sm font-semibold transition ${
                  mode === "ADMIN"
                    ? "bg-white text-slate-900 shadow-sm shadow-slate-950/40"
                    : "text-slate-200 hover:text-white"
                }`}
              >
                Admin
              </button>
            </div>
          </section>
        ) : null}

        {isEditOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
            <section className="flex w-full max-w-md flex-col rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl shadow-black/70 sm:max-h-[85vh]">
              <div className="border-b border-slate-700 px-5 py-4">
                <h2 className="text-lg font-semibold text-slate-100">Edit Profile</h2>
              </div>
              <form className="flex flex-col" onSubmit={onSubmitProfileUpdate}>
                <div className="space-y-4 overflow-y-auto px-5 py-4 sm:max-h-[60vh]">
                  <label className="block text-sm text-slate-200">
                    Full Name
                    <input
                      type="text"
                      required
                      value={fullNameInput}
                      onChange={(event) => setFullNameInput(event.target.value)}
                      className="mt-1 min-h-11 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                    />
                  </label>
                  <label className="block text-sm text-slate-200">
                    Email
                    <input
                      type="email"
                      required
                      value={emailInput}
                      onChange={(event) => setEmailInput(event.target.value)}
                      className="mt-1 min-h-11 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                    />
                  </label>
                  <label className="block text-sm text-slate-200">
                    Organization
                    <input
                      type="text"
                      required
                      value={organizationInput}
                      onChange={(event) => setOrganizationInput(event.target.value)}
                      className="mt-1 min-h-11 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                    />
                  </label>
                </div>
                <div className="flex items-center justify-end gap-2 border-t border-slate-700 bg-slate-900 px-5 py-3">
                  <button
                    type="button"
                    onClick={() => setIsEditOpen(false)}
                    className="min-h-11 rounded-xl border border-slate-600 px-4 py-2 text-sm text-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isPendingUpdate}
                    className="min-h-11 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60"
                  >
                    {isPendingUpdate ? "Saving..." : "Save"}
                  </button>
                </div>
              </form>
            </section>
          </div>
        ) : null}

        <section className="mt-6 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-300">Call Handling</h2>
          <LadderModeToggle enabled={ladderEnabled} disabled={isSavingLadder} onChange={(next) => void onLadderChange(next)} />
        </section>

        <section className="mt-6 border-t border-slate-800 pt-6">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-300">Session</h2>
          <form action={signOut}>
            <button
              type="submit"
              className="mt-3 inline-flex min-h-11 items-center rounded-xl border border-rose-500/60 bg-rose-500/20 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/30"
            >
              Logout
            </button>
          </form>
        </section>

        {message ? <p className="mt-4 rounded-xl border border-slate-700 bg-slate-950/70 p-3 text-sm text-slate-300">{message}</p> : null}
      </section>

      {toast ? (
        <div className="fixed bottom-24 right-4 z-50 rounded-xl border border-emerald-400/60 bg-emerald-500/20 px-4 py-3 text-sm font-semibold text-emerald-100 shadow-lg shadow-black/50">
          {toast}
        </div>
      ) : null}
    </main>
  );
}
