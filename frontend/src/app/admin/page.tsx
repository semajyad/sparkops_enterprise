"use client";

import { Loader2, Plus, Trash2, Upload } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useState, useTransition } from "react";

import { signOut } from "@/app/login/actions";
import { inviteUser, listTeamMembers, updateProfile } from "@/app/profile/actions";
import { LadderModeToggle } from "@/components/LadderModeToggle";
import { apiFetch, parseApiJson } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import {
  deleteVehicleFromCache,
  getAdminSettingsCache,
  getTeamCache,
  listVehiclesFromCache,
  setAdminSettingsCache,
  setTeamCache,
  upsertVehicleInCache,
  type CachedVehicle,
} from "@/lib/db";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

type AdminSettings = {
  logo_url: string | null;
  website_url: string | null;
  business_name: string | null;
  gst_number: string | null;
  default_trade: "ELECTRICAL" | "PLUMBING";
  tax_rate: number | null;
  standard_markup: number | null;
  terms_and_conditions: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
};

type TeamMember = {
  id: string;
  email: string;
  full_name: string;
  role: "OWNER" | "EMPLOYEE";
  trade: "ELECTRICAL" | "PLUMBING";
  status: "ACTIVE" | "PENDING";
  invited_at: string | null;
  last_sign_in_at: string | null;
};

type VehicleRecord = {
  id: string;
  name: string;
  plate: string;
  notes: string | null;
  updated_at: string;
};

type AdminSection = "profile" | "team" | "company" | "fleet";

const OWNER_TAB_STORAGE_KEY = "sparkops_owner_admin_tab";

const EMPTY_SETTINGS: AdminSettings = {
  logo_url: null,
  website_url: null,
  business_name: null,
  gst_number: null,
  default_trade: "ELECTRICAL",
  tax_rate: 15,
  standard_markup: null,
  terms_and_conditions: null,
  bank_account_name: null,
  bank_account_number: null,
};

function toInput(value: string | null): string {
  return value ?? "";
}

function toNullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toCachedVehicleRecord(record: VehicleRecord): CachedVehicle {
  return {
    id: record.id,
    name: record.name,
    plate: record.plate,
    notes: record.notes,
    updated_at: Date.parse(record.updated_at) || Date.now(),
  };
}

function initialsFromName(fullName: string): string {
  const chunks = fullName
    .trim()
    .split(/\s+/)
    .filter((chunk) => chunk.length > 0)
    .slice(0, 2);
  if (chunks.length === 0) {
    return "??";
  }
  return chunks.map((chunk) => chunk[0]?.toUpperCase() ?? "").join("");
}

export default function AdminPage(): React.JSX.Element {
  const { loading: authLoading, role, user } = useAuth();
  const [activeSection, setActiveSection] = useState<AdminSection>("profile");
  const [settings, setSettings] = useState<AdminSettings>(EMPTY_SETTINGS);
  const [activeUsers, setActiveUsers] = useState<TeamMember[]>([]);
  const [pendingInvites, setPendingInvites] = useState<TeamMember[]>([]);
  const [vehicles, setVehicles] = useState<VehicleRecord[]>([]);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isSavingVehicle, setIsSavingVehicle] = useState(false);
  const [isConnectingXero, setIsConnectingXero] = useState(false);
  const [isTeamLoading, setIsTeamLoading] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [teamMessage, setTeamMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteFullName, setInviteFullName] = useState("");
  const [inviteRole, setInviteRole] = useState<"SPARKY" | "OWNER">("SPARKY");
  const [inviteTrade, setInviteTrade] = useState<"ELECTRICAL" | "PLUMBING">("ELECTRICAL");
  const [vehicleName, setVehicleName] = useState("");
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [vehicleNotes, setVehicleNotes] = useState("");
  const [sessionIdentity, setSessionIdentity] = useState<{ full_name: string | null; email: string | null; organization: string | null } | null>(null);
  const [ladderEnabled, setLadderEnabled] = useState(false);
  const [isSavingLadder, setIsSavingLadder] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [fullNameInput, setFullNameInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [organizationInput, setOrganizationInput] = useState("");
  const [isPendingUpdate, startUpdateTransition] = useTransition();

  const isOwner = role === "OWNER";

  const hydrateFromDexie = useCallback(async (): Promise<void> => {
    const [cachedSettings, cachedVehicles, cachedTeam] = await Promise.all([getAdminSettingsCache(), listVehiclesFromCache(), getTeamCache()]);

    if (cachedSettings) {
      setSettings({
        logo_url: cachedSettings.logo_url,
        website_url: cachedSettings.website_url ?? null,
        business_name: cachedSettings.business_name,
        gst_number: cachedSettings.gst_number,
        default_trade: cachedSettings.default_trade,
        tax_rate: cachedSettings.tax_rate,
        standard_markup: cachedSettings.standard_markup,
        terms_and_conditions: cachedSettings.terms_and_conditions,
        bank_account_name: cachedSettings.bank_account_name,
        bank_account_number: cachedSettings.bank_account_number,
      });
    }

    if (cachedTeam) {
      setActiveUsers(cachedTeam.activeUsers);
      setPendingInvites(cachedTeam.pendingInvites);
    }

    if (cachedVehicles.length > 0) {
      const mapped = cachedVehicles.map((vehicle) => ({
        id: vehicle.id,
        name: vehicle.name,
        plate: vehicle.plate,
        notes: vehicle.notes ?? null,
        updated_at: new Date(vehicle.updated_at).toISOString(),
      }));
      setVehicles(mapped);
    }
  }, []);

  const refreshFromServer = useCallback(async (): Promise<void> => {
    if (!isOwner) {
      return;
    }

    setIsTeamLoading(true);
    setError(null);
    try {
      const [settingsResponse, vehiclesResponse, teamResult] = await Promise.all([
        apiFetch(`${API_BASE_URL}/api/admin/settings`, { cache: "no-store" }),
        apiFetch(`${API_BASE_URL}/api/admin/vehicles`, { cache: "no-store" }),
        listTeamMembers(),
      ]);

      if (settingsResponse.ok) {
        const settingsPayload = await parseApiJson<AdminSettings & { organization_id: string; updated_at: string }>(settingsResponse);
        const nextSettings: AdminSettings = {
          logo_url: settingsPayload.logo_url,
          website_url: settingsPayload.website_url,
          business_name: settingsPayload.business_name,
          gst_number: settingsPayload.gst_number,
          default_trade: String((settingsPayload as { default_trade?: string }).default_trade ?? "").toUpperCase() === "PLUMBING" ? "PLUMBING" : "ELECTRICAL",
          tax_rate: typeof settingsPayload.tax_rate === "number" ? settingsPayload.tax_rate * 100 : 15,
          standard_markup: typeof settingsPayload.standard_markup === "number" ? settingsPayload.standard_markup : null,
          terms_and_conditions: settingsPayload.terms_and_conditions,
          bank_account_name: settingsPayload.bank_account_name,
          bank_account_number: settingsPayload.bank_account_number,
        };
        setSettings(nextSettings);
        await setAdminSettingsCache(nextSettings);
      }

      if (vehiclesResponse.ok) {
        const vehiclesPayload = await parseApiJson<VehicleRecord[]>(vehiclesResponse);
        const normalized = Array.isArray(vehiclesPayload) ? vehiclesPayload : [];
        setVehicles(normalized);
        await Promise.all(normalized.map(async (vehicle) => upsertVehicleInCache(toCachedVehicleRecord(vehicle))));
      }

      if (teamResult.success) {
        setActiveUsers(teamResult.activeUsers);
        setPendingInvites(teamResult.pendingInvites);
        await setTeamCache({
          activeUsers: teamResult.activeUsers,
          pendingInvites: teamResult.pendingInvites,
        });
        setTeamMessage(null);
      } else {
        setTeamMessage(teamResult.message);
      }
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Unable to refresh admin data.");
    } finally {
      setIsTeamLoading(false);
    }
  }, [isOwner]);

  async function onInviteSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setIsInviting(true);
    setIsTeamLoading(true);
    setTeamMessage(null);

    try {
      const formData = new FormData();
      formData.set("email", inviteEmail);
      formData.set("full_name", inviteFullName);
      formData.set("role", inviteRole);
      formData.set("trade", inviteTrade);

      const result = await inviteUser(formData);
      setTeamMessage(result.message);
      if (!result.success) {
        return;
      }

      setInviteEmail("");
      setInviteFullName("");
      setInviteRole("SPARKY");

      const teamResult = await listTeamMembers();
      if (teamResult.success) {
        setActiveUsers(teamResult.activeUsers);
        setPendingInvites(teamResult.pendingInvites);
        await setTeamCache({
          activeUsers: teamResult.activeUsers,
          pendingInvites: teamResult.pendingInvites,
        });
      }
      setToast("User invited.");
    } finally {
      setIsInviting(false);
      setIsTeamLoading(false);
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const storedTab = window.localStorage.getItem(OWNER_TAB_STORAGE_KEY);
    if (storedTab === "profile" || storedTab === "team" || storedTab === "fleet" || storedTab === "company") {
      setActiveSection(storedTab);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(OWNER_TAB_STORAGE_KEY, activeSection);
  }, [activeSection]);

  useEffect(() => {
    void hydrateFromDexie();
  }, [hydrateFromDexie]);

  useEffect(() => {
    void refreshFromServer();
  }, [refreshFromServer]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const metadataFullName = typeof user?.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() : "";
    const metadataEmail = typeof user?.email === "string" ? user.email : "";
    const metadataOrganization = typeof user?.user_metadata?.organization === "string" ? user.user_metadata.organization.trim() : "";
    setSessionIdentity({
      full_name: metadataFullName || null,
      email: metadataEmail || null,
      organization: metadataOrganization || null,
    });
    setFullNameInput(metadataFullName);
    setEmailInput(metadataEmail);
    setOrganizationInput(metadataOrganization);
  }, [user?.email, user?.user_metadata?.full_name, user?.user_metadata?.organization]);

  useEffect(() => {
    async function loadDrivingMode(): Promise<void> {
      if (!isOwner) {
        return;
      }
      try {
        const ladderResponse = await apiFetch(`${API_BASE_URL}/api/twilio/ladder-mode`, { cache: "no-store" });
        if (!ladderResponse.ok) {
          return;
        }
        const ladderPayload = await parseApiJson<{ enabled: boolean }>(ladderResponse);
        setLadderEnabled(Boolean(ladderPayload.enabled));
      } catch {
        // best effort
      }
    }

    void loadDrivingMode();
  }, [isOwner]);

  async function onLadderChange(next: boolean): Promise<void> {
    const previous = ladderEnabled;
    setLadderEnabled(next);
    setIsSavingLadder(true);
    setError(null);
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/twilio/ladder-mode`, {
        method: "POST",
        body: JSON.stringify({ enabled: next }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || `Failed to update Driving Mode (${response.status})`);
      }

      const payload = await parseApiJson<{ enabled: boolean }>(response);
      setLadderEnabled(Boolean(payload.enabled));
      setToast(next ? "Driving Mode enabled." : "Driving Mode disabled.");
    } catch (ladderError) {
      setLadderEnabled(previous);
      setError(ladderError instanceof Error ? ladderError.message : "Unable to update Driving Mode.");
    } finally {
      setIsSavingLadder(false);
    }
  }

  function onSubmitProfileUpdate(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const formData = new FormData();
    formData.set("full_name", fullNameInput);
    formData.set("email", emailInput);
    formData.set("organization", organizationInput);

    startUpdateTransition(() => {
      void updateProfile(formData).then((result) => {
        if (!result.success) {
          setError(result.message);
          return;
        }

        setSessionIdentity({
          full_name: fullNameInput.trim() || null,
          email: emailInput.trim() || null,
          organization: organizationInput.trim() || null,
        });
        setIsEditOpen(false);
        setToast("Profile updated.");
      });
    });
  }

  async function connectXero(): Promise<void> {
    setError(null);
    setIsConnectingXero(true);
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/integrations/xero/connect`, {
        method: "GET",
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || `Unable to start Xero connect (${response.status}).`);
      }

      const payload = await parseApiJson<{ auth_url: string }>(response);
      if (!payload.auth_url) {
        throw new Error("Xero connect response did not include auth_url.");
      }
      window.location.href = payload.auth_url;
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : "Failed to start Xero connect.");
      setIsConnectingXero(false);
    }
  }

  async function saveSettings(): Promise<void> {
    setIsSavingSettings(true);
    setError(null);

    const optimisticSettings: AdminSettings = {
      logo_url: toNullable(toInput(settings.logo_url)),
      website_url: toNullable(toInput(settings.website_url)),
      business_name: toNullable(toInput(settings.business_name)),
      gst_number: toNullable(toInput(settings.gst_number)),
      default_trade: settings.default_trade,
      tax_rate: settings.tax_rate,
      standard_markup: settings.standard_markup,
      terms_and_conditions: toNullable(toInput(settings.terms_and_conditions)),
      bank_account_name: toNullable(toInput(settings.bank_account_name)),
      bank_account_number: toNullable(toInput(settings.bank_account_number)),
    };

    setSettings(optimisticSettings);
    await setAdminSettingsCache(optimisticSettings);

    try {
      const response = await apiFetch(`${API_BASE_URL}/api/admin/settings`, {
        method: "PUT",
        body: JSON.stringify({
          ...optimisticSettings,
          tax_rate: typeof optimisticSettings.tax_rate === "number" ? optimisticSettings.tax_rate / 100 : null,
          standard_markup: optimisticSettings.standard_markup,
        }),
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || `Unable to save settings (${response.status}).`);
      }

      const payload = await parseApiJson<AdminSettings & { organization_id: string; updated_at: string }>(response);
      const canonical: AdminSettings = {
        logo_url: payload.logo_url,
        website_url: payload.website_url,
        business_name: payload.business_name,
        gst_number: payload.gst_number,
        default_trade: String((payload as { default_trade?: string }).default_trade ?? "").toUpperCase() === "PLUMBING" ? "PLUMBING" : "ELECTRICAL",
        tax_rate: typeof payload.tax_rate === "number" ? payload.tax_rate * 100 : 15,
        standard_markup: typeof payload.standard_markup === "number" ? payload.standard_markup : null,
        terms_and_conditions: payload.terms_and_conditions,
        bank_account_name: payload.bank_account_name,
        bank_account_number: payload.bank_account_number,
      };
      setSettings(canonical);
      await setAdminSettingsCache(canonical);
      setToast("Admin settings saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save admin settings.");
    } finally {
      setIsSavingSettings(false);
    }
  }

  async function onLogoFileSelected(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!["image/png", "image/jpeg", "image/jpg"].includes(file.type)) {
      setError("Logo must be a PNG or JPG image.");
      return;
    }

    setError(null);
    setIsUploadingLogo(true);
    try {
      const supabase = createSupabaseClient();
      const fileExtension = file.name.split(".").pop()?.toLowerCase() ?? "png";
      const safeUserId = user?.id ?? "owner";
      const path = `logos/${safeUserId}/${Date.now()}.${fileExtension}`;

      const { error: uploadError } = await supabase.storage.from("organization-assets").upload(path, file, {
        upsert: true,
        contentType: file.type,
      });
      if (uploadError) {
        throw new Error(uploadError.message || "Logo upload failed.");
      }

      const { data } = supabase.storage.from("organization-assets").getPublicUrl(path);
      const logoUrl = data.publicUrl;
      setSettings((prev) => ({ ...prev, logo_url: logoUrl }));
      setToast("Logo uploaded. Save Company to persist.");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Failed to upload logo.");
    } finally {
      setIsUploadingLogo(false);
      event.currentTarget.value = "";
    }
  }

  async function createVehicle(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!vehicleName.trim() || !vehiclePlate.trim()) {
      setError("Vehicle name and plate are required.");
      return;
    }

    setIsSavingVehicle(true);
    setError(null);
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/admin/vehicles`, {
        method: "POST",
        body: JSON.stringify({
          name: vehicleName.trim(),
          plate: vehiclePlate.trim().toUpperCase(),
          notes: toNullable(vehicleNotes),
        }),
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || `Unable to create vehicle (${response.status}).`);
      }

      const payload = await parseApiJson<VehicleRecord>(response);
      setVehicles((prev) => [payload, ...prev]);
      await upsertVehicleInCache(toCachedVehicleRecord(payload));
      setVehicleName("");
      setVehiclePlate("");
      setVehicleNotes("");
      setToast("Vehicle added.");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create vehicle.");
    } finally {
      setIsSavingVehicle(false);
    }
  }

  async function removeVehicle(vehicleId: string): Promise<void> {
    setError(null);
    const previous = vehicles;
    setVehicles((prev) => prev.filter((vehicle) => vehicle.id !== vehicleId));
    await deleteVehicleFromCache(vehicleId);

    try {
      const response = await apiFetch(`${API_BASE_URL}/api/admin/vehicles/${vehicleId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || `Unable to delete vehicle (${response.status}).`);
      }
      setToast("Vehicle removed.");
    } catch (deleteError) {
      setVehicles(previous);
      await Promise.all(previous.map(async (vehicle) => upsertVehicleInCache(toCachedVehicleRecord(vehicle))));
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete vehicle.");
    }
  }

  if (authLoading) {
    return (
      <main className="min-h-screen bg-gray-100 p-6 text-gray-900">
        <p className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
          <Loader2 className="h-4 w-4 animate-spin text-orange-600" />
          Verifying owner session...
        </p>
      </main>
    );
  }

  if (!isOwner) {
    return (
      <main className="min-h-screen bg-gray-100 p-6 text-gray-900">
        <section className="mx-auto max-w-xl rounded-2xl border border-red-200 bg-red-50 p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-red-600">Access Denied</p>
          <h1 className="mt-2 text-2xl font-semibold text-gray-900">Owner role required</h1>
          <p className="mt-2 text-sm text-red-700">Switch to an owner account to use the Unified Owner Suite.</p>
        </section>
      </main>
    );
  }

  const displayName = sessionIdentity?.full_name || user?.email || "Owner";
  const displayEmail = sessionIdentity?.email || user?.email || "Unknown";
  const displayOrganization = sessionIdentity?.organization || "Unknown";

  return (
    <main className="min-h-screen bg-gray-100 p-4 pb-24 text-gray-900 sm:p-6 md:p-10">
      <section className="mx-auto w-full max-w-6xl rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <header className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Admin</h1>
            </div>
          </div>

          <nav className="sticky top-0 z-20 -mb-px mt-4 flex gap-5 overflow-x-auto border-b border-gray-200 bg-white [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {([
              ["profile", "Profile"],
              ["team", "Team"],
              ["fleet", "Fleet"],
              ["company", "Company"],
            ] as Array<[AdminSection, string]>).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveSection(key)}
                className={`min-h-11 border-b-2 px-1 pb-2 pt-1 text-sm font-semibold transition ${
                  activeSection === key
                    ? "border-orange-600 text-orange-600"
                    : "border-transparent text-gray-500 hover:text-orange-600"
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
        </header>

        <section className="mt-5">
          {activeSection === "profile" ? (
            <div className="mt-4 space-y-4">
              <section className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-lg font-semibold text-gray-900">{displayName}</p>
                <p className="text-sm text-gray-500">{displayEmail}</p>
                <p className="mt-2 text-sm text-gray-600">Organization: {displayOrganization}</p>
                <p className="text-sm text-gray-600">Role: OWNER</p>
              </section>

              <section className="grid gap-3 sm:grid-cols-3">
                <article className="rounded-xl border border-gray-200 bg-white p-3">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-gray-500">Mode</p>
                  <p className="mt-1 text-sm font-semibold text-gray-900">Field Operator</p>
                </article>
                <article className="rounded-xl border border-gray-200 bg-white p-3">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-gray-500">Driving</p>
                  <p className="mt-1 text-sm font-semibold text-gray-900">{ladderEnabled ? "Enabled" : "Disabled"}</p>
                </article>
                <article className="rounded-xl border border-gray-200 bg-white p-3">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-gray-500">Account</p>
                  <p className="mt-1 text-sm font-semibold text-gray-900">Ready</p>
                </article>
              </section>

              <div>
                <button
                  type="button"
                  onClick={() => setIsEditOpen(true)}
                  className="inline-flex min-h-11 items-center rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:border-orange-500 hover:text-orange-600"
                >
                  Edit Profile
                </button>
              </div>

              <section className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">Call Handling</h2>
                <LadderModeToggle enabled={ladderEnabled} disabled={isSavingLadder} onChange={(next) => void onLadderChange(next)} />
              </section>

              <section className="border-t border-gray-200 pt-4">
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">Session</h2>
                <form action={signOut}>
                  <button
                    type="submit"
                    className="mt-3 inline-flex min-h-11 items-center rounded-xl border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100"
                  >
                    Logout
                  </button>
                </form>
              </section>
            </div>
          ) : null}

          {activeSection === "team" ? (
            <div className="mt-4 space-y-4">
              <form className="grid gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:grid-cols-2" onSubmit={(event) => void onInviteSubmit(event)}>
                <label className="text-sm text-gray-700 sm:col-span-2">
                  Email
                  <input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    className="mt-1 min-h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-gray-900 placeholder:text-gray-400 focus:border-orange-600 focus:outline-none"
                    placeholder="tech@sparkops.co.nz"
                  />
                </label>
                <label className="text-sm text-gray-700">
                  Full Name
                  <input
                    required
                    value={inviteFullName}
                    onChange={(event) => setInviteFullName(event.target.value)}
                    className="mt-1 min-h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-gray-900 placeholder:text-gray-400 focus:border-orange-600 focus:outline-none"
                    placeholder="Sam Sparks"
                  />
                </label>
                <label className="text-sm text-gray-700">
                  Role
                  <select
                    value={inviteRole}
                    onChange={(event) => setInviteRole(event.target.value === "OWNER" ? "OWNER" : "SPARKY")}
                    className="mt-1 min-h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-gray-900 focus:border-orange-600 focus:outline-none"
                  >
                    <option value="SPARKY">Sparky</option>
                    <option value="OWNER">Owner</option>
                  </select>
                </label>
                <label className="text-sm text-gray-700">
                  Team Member Trade
                  <select
                    value={inviteTrade}
                    onChange={(event) => setInviteTrade(event.target.value === "PLUMBING" ? "PLUMBING" : "ELECTRICAL")}
                    className="mt-1 min-h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-gray-900 focus:border-orange-600 focus:outline-none"
                  >
                    <option value="ELECTRICAL">Electrical</option>
                    <option value="PLUMBING">Plumbing</option>
                  </select>
                </label>
                <button
                  type="submit"
                  disabled={isInviting}
                  className="sm:col-span-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-700 disabled:opacity-60"
                >
                  {isInviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Add User
                </button>
              </form>

              <div className="grid gap-4 md:grid-cols-2">
                <section className="rounded-xl border border-gray-200 bg-white p-4">
                  <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-600">Team</h2>
                  {isTeamLoading ? <p className="mt-3 text-sm text-gray-500">Loading team...</p> : null}
                  {!isTeamLoading && activeUsers.length === 0 ? <p className="mt-3 text-sm text-gray-500">No team members yet.</p> : null}
                  <ul className="mt-3 space-y-2">
                    {activeUsers.map((member) => (
                      <li key={member.id} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gray-300 bg-gray-100 text-xs font-bold text-orange-600">
                          {initialsFromName(member.full_name)}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{member.full_name}</p>
                          <p className="text-xs text-gray-600">{member.email}</p>
                          <p className="text-[11px] uppercase tracking-wide text-orange-600">{member.role}</p>
                          <p className="text-[11px] uppercase tracking-wide text-orange-600">{member.trade}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
                <section className="rounded-xl border border-gray-200 bg-white p-4">
                  <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-600">Pending Invites</h2>
                  {!isTeamLoading && pendingInvites.length === 0 ? <p className="mt-3 text-sm text-gray-500">No pending invites.</p> : null}
                  <ul className="mt-3 space-y-2">
                    {pendingInvites.map((member) => (
                      <li key={member.id} className="flex items-center gap-3 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-orange-200 bg-white text-xs font-bold text-orange-600">
                          {initialsFromName(member.full_name)}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{member.full_name}</p>
                          <p className="text-xs text-gray-600">{member.email}</p>
                          <p className="text-[11px] uppercase tracking-wide text-orange-600">Pending</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
              {teamMessage ? <p className="rounded-xl border border-gray-200 bg-white p-3 text-sm text-gray-600">{teamMessage}</p> : null}
            </div>
          ) : null}

          {activeSection === "company" ? (
            <div className="mt-4 space-y-4">
              <label className="block text-sm text-gray-700">
                Logo Upload
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={(event) => void onLogoFileSelected(event)}
                  className="mt-1 block min-h-11 w-full cursor-pointer rounded-xl border border-gray-300 bg-white px-3 py-2 text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-orange-600 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
                />
                {isUploadingLogo ? (
                  <span className="mt-2 inline-flex items-center gap-2 text-xs text-gray-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-orange-600" />
                    Uploading logo...
                  </span>
                ) : null}
              </label>

              <label className="block text-sm text-gray-700">
                Logo URL
                <input
                  value={toInput(settings.logo_url)}
                  onChange={(event) => setSettings((prev) => ({ ...prev, logo_url: event.target.value }))}
                  className="mt-1 min-h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-gray-900 placeholder:text-gray-400 focus:border-orange-600 focus:outline-none"
                  placeholder="https://cdn.example.com/logo.png"
                />
              </label>

              <label className="block text-sm text-gray-700">
                Website URL
                <input
                  value={toInput(settings.website_url)}
                  onChange={(event) => setSettings((prev) => ({ ...prev, website_url: event.target.value }))}
                  className="mt-1 min-h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-gray-900 placeholder:text-gray-400 focus:border-orange-600 focus:outline-none"
                  placeholder="https://sparkops.co.nz"
                />
              </label>

              {settings.logo_url ? (
                <div className="rounded-xl border border-gray-200 bg-white p-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Logo Preview</p>
                  <Image src={settings.logo_url} alt="Company logo preview" width={56} height={56} unoptimized className="mt-2 h-14 w-14 rounded-lg border border-gray-200 bg-white object-cover" />
                </div>
              ) : null}
              <label className="block text-sm text-gray-700">
                Business Name
                <input
                  value={toInput(settings.business_name)}
                  onChange={(event) => setSettings((prev) => ({ ...prev, business_name: event.target.value }))}
                  className="mt-1 min-h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-gray-900 placeholder:text-gray-400 focus:border-orange-600 focus:outline-none"
                  placeholder="SparkOps Electrical"
                />
              </label>
              <label className="block text-sm text-gray-700">
                GST Number
                <input
                  value={toInput(settings.gst_number)}
                  onChange={(event) => setSettings((prev) => ({ ...prev, gst_number: event.target.value }))}
                  className="mt-1 min-h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-gray-900 placeholder:text-gray-400 focus:border-orange-600 focus:outline-none"
                  placeholder="123-456-789"
                />
              </label>
              <label className="block text-sm text-gray-700">
                Tax Rate (%)
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  value={typeof settings.tax_rate === "number" ? String(settings.tax_rate) : "15"}
                  onChange={(event) => {
                    const parsed = Number(event.target.value);
                    setSettings((prev) => ({
                      ...prev,
                      tax_rate: Number.isFinite(parsed) ? parsed : 15,
                    }));
                  }}
                  className="mt-1 min-h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-gray-900 placeholder:text-gray-400 focus:border-orange-600 focus:outline-none"
                  placeholder="15"
                />
              </label>
              <label className="block text-sm text-gray-700">
                Organization Default Trade
                <select
                  value={settings.default_trade}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      default_trade: event.target.value === "PLUMBING" ? "PLUMBING" : "ELECTRICAL",
                    }))
                  }
                  className="mt-1 min-h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-gray-900 focus:border-orange-600 focus:outline-none"
                >
                  <option value="ELECTRICAL">Electrical</option>
                  <option value="PLUMBING">Plumbing</option>
                </select>
              </label>
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-sm font-semibold text-gray-900">Xero Integration</p>
                <p className="mt-1 text-xs text-gray-500">Connect your Xero org, then push completed jobs from Job Details.</p>
                <button
                  type="button"
                  onClick={() => void connectXero()}
                  disabled={isConnectingXero}
                  className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:border-orange-500 hover:text-orange-600 disabled:opacity-60"
                >
                  {isConnectingXero ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Connect Xero
                </button>
              </div>
              <label className="block text-sm text-gray-700">
                Terms &amp; Conditions
                <textarea
                  value={toInput(settings.terms_and_conditions)}
                  onChange={(event) => setSettings((prev) => ({ ...prev, terms_and_conditions: event.target.value }))}
                  className="mt-1 min-h-28 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder:text-gray-400 focus:border-orange-600 focus:outline-none"
                  placeholder="Payment terms, exclusions, and service conditions"
                />
              </label>
              <label className="block text-sm text-gray-700">
                Bank Account Name
                <input
                  value={toInput(settings.bank_account_name)}
                  onChange={(event) => setSettings((prev) => ({ ...prev, bank_account_name: event.target.value }))}
                  className="mt-1 min-h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-gray-900 placeholder:text-gray-400 focus:border-orange-600 focus:outline-none"
                  placeholder="SparkOps Ltd"
                />
              </label>
              <label className="block text-sm text-gray-700">
                Bank Account Number
                <input
                  value={toInput(settings.bank_account_number)}
                  onChange={(event) => setSettings((prev) => ({ ...prev, bank_account_number: event.target.value }))}
                  className="mt-1 min-h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-gray-900 placeholder:text-gray-400 focus:border-orange-600 focus:outline-none"
                  placeholder="12-3456-1234567-00"
                />
              </label>
            </div>
          ) : null}

          {activeSection === "fleet" ? (
            <div className="mt-4 space-y-4">
              <form className="grid gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:grid-cols-2" onSubmit={(event) => void createVehicle(event)}>
                <label className="text-sm text-gray-700">
                  Vehicle Name
                  <input
                    required
                    value={vehicleName}
                    onChange={(event) => setVehicleName(event.target.value)}
                    className="mt-1 min-h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-gray-900 placeholder:text-gray-400 focus:border-orange-600 focus:outline-none"
                    placeholder="Service Van 01"
                  />
                </label>
                <label className="text-sm text-gray-700">
                  Plate
                  <input
                    required
                    value={vehiclePlate}
                    onChange={(event) => setVehiclePlate(event.target.value.toUpperCase())}
                    className="mt-1 min-h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-gray-900 placeholder:text-gray-400 focus:border-orange-600 focus:outline-none"
                    placeholder="ABC123"
                  />
                </label>
                <label className="text-sm text-gray-700 sm:col-span-2">
                  Notes
                  <input
                    value={vehicleNotes}
                    onChange={(event) => setVehicleNotes(event.target.value)}
                    className="mt-1 min-h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-gray-900 placeholder:text-gray-400 focus:border-orange-600 focus:outline-none"
                    placeholder="Optional details"
                  />
                </label>
                <button
                  type="submit"
                  disabled={isSavingVehicle}
                  className="sm:col-span-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-700 disabled:opacity-60"
                >
                  {isSavingVehicle ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Add Vehicle
                </button>
              </form>

              <ul className="space-y-2">
                {vehicles.map((vehicle) => (
                  <li key={vehicle.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{vehicle.name}</p>
                      <p className="text-xs text-gray-500">{vehicle.plate}{vehicle.notes ? ` · ${vehicle.notes}` : ""}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void removeVehicle(vehicle.id)}
                      className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </button>
                  </li>
                ))}
              </ul>

              {vehicles.length === 0 ? <p className="rounded-xl border border-gray-200 bg-white p-3 text-sm text-gray-600">No vehicles added yet.</p> : null}
            </div>
          ) : null}

          {activeSection === "company" ? (
            <div className="mt-5">
              <button
                type="button"
                onClick={() => void saveSettings()}
                disabled={isSavingSettings || isUploadingLogo}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-orange-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-orange-700 disabled:opacity-60"
              >
                {isSavingSettings || isUploadingLogo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Save Company
              </button>
            </div>
          ) : null}

          {error ? <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        </section>

        {isEditOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
            <section className="flex w-full max-w-md flex-col rounded-2xl border border-gray-200 bg-white shadow-xl sm:max-h-[85vh]">
              <div className="border-b border-gray-200 px-5 py-4">
                <h2 className="text-lg font-semibold text-gray-900">Edit Profile</h2>
              </div>
              <form className="flex flex-col" onSubmit={onSubmitProfileUpdate}>
                <div className="space-y-4 overflow-y-auto px-5 py-4 sm:max-h-[60vh]">
                  <label className="block text-sm text-gray-700">
                    Full Name
                    <input
                      type="text"
                      required
                      value={fullNameInput}
                      onChange={(event) => setFullNameInput(event.target.value)}
                      className="mt-1 min-h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-gray-900 placeholder:text-gray-400 focus:border-orange-600 focus:outline-none"
                    />
                  </label>
                  <label className="block text-sm text-gray-700">
                    Email
                    <input
                      type="email"
                      required
                      value={emailInput}
                      onChange={(event) => setEmailInput(event.target.value)}
                      className="mt-1 min-h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-gray-900 placeholder:text-gray-400 focus:border-orange-600 focus:outline-none"
                    />
                  </label>
                  <label className="block text-sm text-gray-700">
                    Organization
                    <input
                      type="text"
                      required
                      value={organizationInput}
                      onChange={(event) => setOrganizationInput(event.target.value)}
                      className="mt-1 min-h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-gray-900 placeholder:text-gray-400 focus:border-orange-600 focus:outline-none"
                    />
                  </label>
                </div>
                <div className="flex items-center justify-end gap-2 border-t border-gray-200 bg-white px-5 py-3">
                  <button
                    type="button"
                    onClick={() => setIsEditOpen(false)}
                    className="min-h-11 rounded-xl border border-gray-300 px-4 py-2 text-sm text-gray-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isPendingUpdate}
                    className="min-h-11 rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {isPendingUpdate ? "Saving..." : "Save"}
                  </button>
                </div>
              </form>
            </section>
          </div>
        ) : null}
      </section>

      {toast ? (
        <div className="fixed bottom-24 right-4 z-50 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">
          {toast}
        </div>
      ) : null}
    </main>
  );
}
