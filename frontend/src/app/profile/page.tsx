"use client";

import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";

import { signOut } from "@/app/login/actions";
import { inviteUser, listTeamMembers, updateProfile } from "@/app/profile/actions";
import { LadderModeToggle } from "@/components/LadderModeToggle";
import { apiFetch, AuthSessionExpiredError, parseApiJson } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

type AuthMePayload = {
  id: string;
  organization_id: string;
  role: string;
  email?: string | null;
  full_name?: string | null;
};

type TeamMember = {
  id: string;
  email: string;
  full_name: string;
  role: "OWNER" | "EMPLOYEE";
  status: "ACTIVE" | "PENDING";
  invited_at: string | null;
  last_sign_in_at: string | null;
};

export default function ProfilePage(): React.JSX.Element {
  const { user, session, loading: authLoading } = useAuth();
  const [details, setDetails] = useState<AuthMePayload | null>(null);
  const [sessionIdentity, setSessionIdentity] = useState<{ full_name: string | null; email: string | null; organization: string | null } | null>(null);
  const [ladderEnabled, setLadderEnabled] = useState(false);
  const [isSavingLadder, setIsSavingLadder] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [fullNameInput, setFullNameInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [organizationInput, setOrganizationInput] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [isPendingUpdate, startUpdateTransition] = useTransition();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteFullName, setInviteFullName] = useState("");
  const [inviteRole, setInviteRole] = useState<"SPARKY" | "OWNER">("SPARKY");
  const [activeUsers, setActiveUsers] = useState<TeamMember[]>([]);
  const [pendingInvites, setPendingInvites] = useState<TeamMember[]>([]);
  const [teamMessage, setTeamMessage] = useState<string | null>(null);
  const [isTeamLoading, setIsTeamLoading] = useState(false);
  const [isInviting, startInviteTransition] = useTransition();

  useEffect(() => {
    if (authLoading) {
      return;
    }

    async function loadProfile(): Promise<void> {
      setLoading(true);
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
          setLoading(false);
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

  async function onLadderChange(next: boolean): Promise<void> {
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

  const refreshTeamMembers = useCallback(async (): Promise<void> => {
    if (String(details?.role ?? "").toUpperCase() !== "OWNER") {
      setActiveUsers([]);
      setPendingInvites([]);
      return;
    }

    setIsTeamLoading(true);
    const result = await listTeamMembers();
    if (!result.success) {
      setTeamMessage(result.message);
      setActiveUsers([]);
      setPendingInvites([]);
    } else {
      setTeamMessage(null);
      setActiveUsers(result.activeUsers);
      setPendingInvites(result.pendingInvites);
    }
    setIsTeamLoading(false);
  }, [details?.role]);

  useEffect(() => {
    void refreshTeamMembers();
  }, [refreshTeamMembers]);

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

  function onSubmitInvite(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const formData = new FormData();
    formData.set("email", inviteEmail);
    formData.set("full_name", inviteFullName);
    formData.set("role", inviteRole);

    startInviteTransition(() => {
      void inviteUser(formData).then(async (result) => {
        setTeamMessage(result.message);
        if (result.success) {
          setInviteEmail("");
          setInviteFullName("");
          setInviteRole("SPARKY");
          await refreshTeamMembers();
        }
      });
    });
  }

  return (
    <main className="min-h-screen bg-slate-950 p-4 pb-24 text-slate-100 sm:p-6 md:p-10">
      <section className="mx-auto w-full max-w-4xl rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-black/50 md:p-8">
        <p className="text-xs uppercase tracking-[0.26em] text-amber-400">Profile</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{displayName}</h1>

        {loading ? (
          <div className="mt-6 inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-slate-300">
            <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
            Loading profile...
          </div>
        ) : null}

        <div className="mt-6 grid gap-3 rounded-2xl border border-slate-700 bg-slate-950/70 p-4 text-sm text-slate-300 sm:grid-cols-2">
          <p><span className="font-semibold text-slate-100">Email:</span> {displayEmail}</p>
          <p><span className="font-semibold text-slate-100">Role:</span> {details?.role ?? "Unknown"}</p>
          <p><span className="font-semibold text-slate-100">Organization:</span> {displayOrganization}</p>
          <p className="sm:col-span-2"><span className="font-semibold text-slate-100">Organization ID:</span> {details?.organization_id ?? "Unknown"}</p>
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

        {isEditOpen ? (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-4 sm:items-center">
            <section className="flex h-[85vh] w-full max-w-md flex-col rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl shadow-black/70 sm:h-auto sm:max-h-[85vh]">
              <div className="border-b border-slate-700 px-5 py-4">
                <h2 className="text-lg font-semibold text-slate-100">Edit Profile</h2>
              </div>
              <form className="flex h-full flex-col" onSubmit={onSubmitProfileUpdate}>
                <div className="space-y-4 overflow-y-auto px-5 py-4">
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
                <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-slate-700 bg-slate-900/95 px-5 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] backdrop-blur">
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

        {String(details?.role ?? "").toUpperCase() === "OWNER" ? (
          <section className="mt-6 border-t border-slate-800 pt-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-300">Team Management</h2>
            <p className="mt-2 text-sm text-slate-400">Invite Apprentices/Journeymen and monitor who has accepted.</p>

            <form className="mt-4 grid gap-3 rounded-2xl border border-slate-700 bg-slate-950/70 p-4 sm:grid-cols-2" onSubmit={onSubmitInvite}>
              <label className="text-sm text-slate-200 sm:col-span-2">
                Email
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  className="mt-1 min-h-11 w-full rounded-xl border border-slate-600 bg-slate-900 px-3 text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                  placeholder="apprentice@sparkops.co.nz"
                />
              </label>

              <label className="text-sm text-slate-200">
                Full Name
                <input
                  type="text"
                  required
                  value={inviteFullName}
                  onChange={(event) => setInviteFullName(event.target.value)}
                  className="mt-1 min-h-11 w-full rounded-xl border border-slate-600 bg-slate-900 px-3 text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                  placeholder="Sam Sparks"
                />
              </label>

              <label className="text-sm text-slate-200">
                Role
                <select
                  value={inviteRole}
                  onChange={(event) => setInviteRole(event.target.value === "OWNER" ? "OWNER" : "SPARKY")}
                  className="mt-1 min-h-11 w-full rounded-xl border border-slate-600 bg-slate-900 px-3 text-slate-100 focus:border-amber-400 focus:outline-none"
                >
                  <option value="SPARKY">Sparky</option>
                  <option value="OWNER">Owner</option>
                </select>
              </label>

              <button
                type="submit"
                disabled={isInviting}
                className="sm:col-span-2 min-h-11 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 disabled:opacity-60"
              >
                {isInviting ? "Sending Invite..." : "Invite User"}
              </button>
            </form>

            {teamMessage ? <p className="mt-3 rounded-xl border border-slate-700 bg-slate-950/70 p-3 text-sm text-slate-300">{teamMessage}</p> : null}

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <section className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-amber-300">Active Users</h3>
                {isTeamLoading ? <p className="mt-2 text-sm text-slate-400">Loading team...</p> : null}
                {!isTeamLoading && activeUsers.length === 0 ? <p className="mt-2 text-sm text-slate-400">No active users yet.</p> : null}
                <ul className="mt-3 space-y-2">
                  {activeUsers.map((member) => (
                    <li key={member.id} className="rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm">
                      <p className="font-semibold text-slate-100">{member.full_name}</p>
                      <p className="text-slate-400">{member.email}</p>
                      <p className="text-xs uppercase tracking-wide text-amber-200">{member.role}</p>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-amber-300">Pending Invites</h3>
                {isTeamLoading ? <p className="mt-2 text-sm text-slate-400">Loading invites...</p> : null}
                {!isTeamLoading && pendingInvites.length === 0 ? <p className="mt-2 text-sm text-slate-400">No pending invites.</p> : null}
                <ul className="mt-3 space-y-2">
                  {pendingInvites.map((member) => (
                    <li key={member.id} className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">
                      <p className="font-semibold text-amber-100">{member.full_name}</p>
                      <p className="text-amber-200/80">{member.email}</p>
                      <p className="text-xs uppercase tracking-wide text-amber-300">Awaiting acceptance</p>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </section>
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
