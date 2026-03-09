"use client";

import { Loader2, Plus, Trash2, Upload } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";

import { inviteUser, listTeamMembers } from "@/app/profile/actions";
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
  terms_and_conditions: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
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

type VehicleRecord = {
  id: string;
  name: string;
  plate: string;
  notes: string | null;
  updated_at: string;
};

type AdminSection = "team" | "company" | "fleet";

const EMPTY_SETTINGS: AdminSettings = {
  logo_url: null,
  website_url: null,
  business_name: null,
  gst_number: null,
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

export default function AdminPage(): React.JSX.Element {
  const { loading: authLoading, role, mode, setMode, user } = useAuth();
  const [activeSection, setActiveSection] = useState<AdminSection>("team");
  const [settings, setSettings] = useState<AdminSettings>(EMPTY_SETTINGS);
  const [activeUsers, setActiveUsers] = useState<TeamMember[]>([]);
  const [pendingInvites, setPendingInvites] = useState<TeamMember[]>([]);
  const [vehicles, setVehicles] = useState<VehicleRecord[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isSavingVehicle, setIsSavingVehicle] = useState(false);
  const [isTeamLoading, setIsTeamLoading] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [teamMessage, setTeamMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteFullName, setInviteFullName] = useState("");
  const [inviteRole, setInviteRole] = useState<"SPARKY" | "OWNER">("SPARKY");
  const [vehicleName, setVehicleName] = useState("");
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [vehicleNotes, setVehicleNotes] = useState("");

  const isOwner = role === "OWNER";

  const sectionTitle = useMemo(() => {
    if (activeSection === "team") return "Team Management";
    if (activeSection === "company") return "Company";
    return "Fleet Management";
  }, [activeSection]);

  const hydrateFromDexie = useCallback(async (): Promise<void> => {
    const [cachedSettings, cachedVehicles, cachedTeam] = await Promise.all([getAdminSettingsCache(), listVehiclesFromCache(), getTeamCache()]);

    if (cachedSettings) {
      setSettings({
        logo_url: cachedSettings.logo_url,
        website_url: cachedSettings.website_url ?? null,
        business_name: cachedSettings.business_name,
        gst_number: cachedSettings.gst_number,
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

    setIsSyncing(true);
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
      setIsSyncing(false);
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

  async function saveSettings(): Promise<void> {
    setIsSavingSettings(true);
    setError(null);

    const optimisticSettings: AdminSettings = {
      logo_url: toNullable(toInput(settings.logo_url)),
      website_url: toNullable(toInput(settings.website_url)),
      business_name: toNullable(toInput(settings.business_name)),
      gst_number: toNullable(toInput(settings.gst_number)),
      terms_and_conditions: toNullable(toInput(settings.terms_and_conditions)),
      bank_account_name: toNullable(toInput(settings.bank_account_name)),
      bank_account_number: toNullable(toInput(settings.bank_account_number)),
    };

    setSettings(optimisticSettings);
    await setAdminSettingsCache(optimisticSettings);

    try {
      const response = await apiFetch(`${API_BASE_URL}/api/admin/settings`, {
        method: "PUT",
        body: JSON.stringify(optimisticSettings),
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
      <main className="min-h-screen bg-slate-950 p-6 text-slate-100">
        <p className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-sm">
          <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
          Verifying owner session...
        </p>
      </main>
    );
  }

  if (!isOwner) {
    return (
      <main className="min-h-screen bg-slate-950 p-6 text-slate-100">
        <section className="mx-auto max-w-xl rounded-2xl border border-rose-500/40 bg-rose-500/10 p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-rose-300">Access Denied</p>
          <h1 className="mt-2 text-2xl font-semibold text-white">Owner role required</h1>
          <p className="mt-2 text-sm text-rose-100">Switch to an owner account to use the Admin Suite.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 p-4 pb-24 text-slate-100 sm:p-6 md:p-10">
      <section className="mx-auto w-full max-w-6xl rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl shadow-black/50">
        <header className="sticky top-2 z-10 space-y-4 rounded-2xl border border-slate-700 bg-slate-900/95 p-4 backdrop-blur">
          <div className="flex justify-center">
            <div className="inline-flex rounded-full bg-slate-700 p-1 shadow-inner shadow-black/35">
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
          </div>

          <nav className="flex flex-wrap items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-950/70 p-2">
            {([
              ["team", "Team"],
              ["fleet", "Fleet"],
              ["company", "Company"],
            ] as Array<[AdminSection, string]>).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveSection(key)}
                className={`min-h-11 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  activeSection === key
                    ? "border-amber-400/70 bg-amber-500/20 text-amber-100"
                    : "border-slate-700 bg-slate-950/60 text-slate-300 hover:border-amber-500/50"
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
          {isSyncing ? <p className="text-center text-xs text-slate-400">Syncing latest org data...</p> : null}
        </header>

        <section className="mt-5">
          <h1 className="text-2xl font-semibold text-white">{sectionTitle}</h1>

          {activeSection === "team" ? (
            <div className="mt-4 space-y-4">
              <form className="grid gap-3 rounded-xl border border-slate-700 bg-slate-950/70 p-4 sm:grid-cols-2" onSubmit={(event) => void onInviteSubmit(event)}>
                <label className="text-sm text-slate-200 sm:col-span-2">
                  Email
                  <input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    className="mt-1 min-h-11 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                    placeholder="tech@sparkops.co.nz"
                  />
                </label>
                <label className="text-sm text-slate-200">
                  Full Name
                  <input
                    required
                    value={inviteFullName}
                    onChange={(event) => setInviteFullName(event.target.value)}
                    className="mt-1 min-h-11 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                    placeholder="Sam Sparks"
                  />
                </label>
                <label className="text-sm text-slate-200">
                  Role
                  <select
                    value={inviteRole}
                    onChange={(event) => setInviteRole(event.target.value === "OWNER" ? "OWNER" : "SPARKY")}
                    className="mt-1 min-h-11 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 text-slate-100 focus:border-amber-400 focus:outline-none"
                  >
                    <option value="SPARKY">Sparky</option>
                    <option value="OWNER">Owner</option>
                  </select>
                </label>
                <button
                  type="submit"
                  disabled={isInviting}
                  className="sm:col-span-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 disabled:opacity-60"
                >
                  {isInviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Add User
                </button>
              </form>

              <div className="grid gap-4 md:grid-cols-2">
                <section className="rounded-xl border border-slate-700 bg-slate-950/70 p-4">
                  <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">Active Team</h2>
                  {isTeamLoading ? <p className="mt-3 text-sm text-slate-400">Loading team...</p> : null}
                  {!isTeamLoading && activeUsers.length === 0 ? <p className="mt-3 text-sm text-slate-400">No active users yet.</p> : null}
                  <ul className="mt-3 space-y-2">
                    {activeUsers.map((member) => (
                      <li key={member.id} className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2">
                        <p className="text-sm font-semibold text-slate-100">{member.full_name}</p>
                        <p className="text-xs text-slate-300">{member.email}</p>
                        <p className="text-[11px] uppercase tracking-wide text-amber-200">{member.role}</p>
                      </li>
                    ))}
                  </ul>
                </section>
                <section className="rounded-xl border border-slate-700 bg-slate-950/70 p-4">
                  <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">Pending Invites</h2>
                  {!isTeamLoading && pendingInvites.length === 0 ? <p className="mt-3 text-sm text-slate-400">No pending invites.</p> : null}
                  <ul className="mt-3 space-y-2">
                    {pendingInvites.map((member) => (
                      <li key={member.id} className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                        <p className="text-sm font-semibold text-amber-100">{member.full_name}</p>
                        <p className="text-xs text-amber-100/90">{member.email}</p>
                        <p className="text-[11px] uppercase tracking-wide text-amber-200">Pending</p>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
              {teamMessage ? <p className="rounded-xl border border-slate-700 bg-slate-950/70 p-3 text-sm text-slate-300">{teamMessage}</p> : null}
            </div>
          ) : null}

          {activeSection === "company" ? (
            <div className="mt-4 space-y-4">
              <label className="block text-sm text-slate-200">
                Logo Upload
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={(event) => void onLogoFileSelected(event)}
                  className="mt-1 block min-h-11 w-full cursor-pointer rounded-xl border border-slate-600 bg-slate-950 px-3 py-2 text-slate-200 file:mr-3 file:rounded-lg file:border-0 file:bg-amber-500 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-950"
                />
                {isUploadingLogo ? (
                  <span className="mt-2 inline-flex items-center gap-2 text-xs text-slate-300">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />
                    Uploading logo...
                  </span>
                ) : null}
              </label>

              <label className="block text-sm text-slate-200">
                Logo URL
                <input
                  value={toInput(settings.logo_url)}
                  onChange={(event) => setSettings((prev) => ({ ...prev, logo_url: event.target.value }))}
                  className="mt-1 min-h-11 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                  placeholder="https://cdn.example.com/logo.png"
                />
              </label>

              <label className="block text-sm text-slate-200">
                Website URL
                <input
                  value={toInput(settings.website_url)}
                  onChange={(event) => setSettings((prev) => ({ ...prev, website_url: event.target.value }))}
                  className="mt-1 min-h-11 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                  placeholder="https://sparkops.co.nz"
                />
              </label>

              {settings.logo_url ? (
                <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Logo Preview</p>
                  <Image src={settings.logo_url} alt="Company logo preview" width={56} height={56} unoptimized className="mt-2 h-14 w-14 rounded-lg border border-slate-700 bg-slate-900 object-cover" />
                </div>
              ) : null}
              <label className="block text-sm text-slate-200">
                Business Name
                <input
                  value={toInput(settings.business_name)}
                  onChange={(event) => setSettings((prev) => ({ ...prev, business_name: event.target.value }))}
                  className="mt-1 min-h-11 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                  placeholder="SparkOps Electrical"
                />
              </label>
              <label className="block text-sm text-slate-200">
                GST Number
                <input
                  value={toInput(settings.gst_number)}
                  onChange={(event) => setSettings((prev) => ({ ...prev, gst_number: event.target.value }))}
                  className="mt-1 min-h-11 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                  placeholder="123-456-789"
                />
              </label>
              <label className="block text-sm text-slate-200">
                Terms &amp; Conditions
                <textarea
                  value={toInput(settings.terms_and_conditions)}
                  onChange={(event) => setSettings((prev) => ({ ...prev, terms_and_conditions: event.target.value }))}
                  className="mt-1 min-h-28 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                  placeholder="Payment terms, exclusions, and service conditions"
                />
              </label>
              <label className="block text-sm text-slate-200">
                Bank Account Name
                <input
                  value={toInput(settings.bank_account_name)}
                  onChange={(event) => setSettings((prev) => ({ ...prev, bank_account_name: event.target.value }))}
                  className="mt-1 min-h-11 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                  placeholder="SparkOps Ltd"
                />
              </label>
              <label className="block text-sm text-slate-200">
                Bank Account Number
                <input
                  value={toInput(settings.bank_account_number)}
                  onChange={(event) => setSettings((prev) => ({ ...prev, bank_account_number: event.target.value }))}
                  className="mt-1 min-h-11 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                  placeholder="12-3456-1234567-00"
                />
              </label>
            </div>
          ) : null}

          {activeSection === "fleet" ? (
            <div className="mt-4 space-y-4">
              <form className="grid gap-3 rounded-xl border border-slate-700 bg-slate-950/70 p-4 sm:grid-cols-2" onSubmit={(event) => void createVehicle(event)}>
                <label className="text-sm text-slate-200">
                  Vehicle Name
                  <input
                    required
                    value={vehicleName}
                    onChange={(event) => setVehicleName(event.target.value)}
                    className="mt-1 min-h-11 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                    placeholder="Service Van 01"
                  />
                </label>
                <label className="text-sm text-slate-200">
                  Plate
                  <input
                    required
                    value={vehiclePlate}
                    onChange={(event) => setVehiclePlate(event.target.value.toUpperCase())}
                    className="mt-1 min-h-11 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                    placeholder="ABC123"
                  />
                </label>
                <label className="text-sm text-slate-200 sm:col-span-2">
                  Notes
                  <input
                    value={vehicleNotes}
                    onChange={(event) => setVehicleNotes(event.target.value)}
                    className="mt-1 min-h-11 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                    placeholder="Optional details"
                  />
                </label>
                <button
                  type="submit"
                  disabled={isSavingVehicle}
                  className="sm:col-span-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 disabled:opacity-60"
                >
                  {isSavingVehicle ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Add Vehicle
                </button>
              </form>

              <ul className="space-y-2">
                {vehicles.map((vehicle) => (
                  <li key={vehicle.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-950/70 px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-100">{vehicle.name}</p>
                      <p className="text-xs text-slate-400">{vehicle.plate}{vehicle.notes ? ` · ${vehicle.notes}` : ""}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void removeVehicle(vehicle.id)}
                      className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-rose-500/50 bg-rose-500/20 px-3 py-2 text-xs font-semibold text-rose-100 transition hover:bg-rose-500/30"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </button>
                  </li>
                ))}
              </ul>

              {vehicles.length === 0 ? <p className="rounded-xl border border-slate-700 bg-slate-950/70 p-3 text-sm text-slate-300">No vehicles added yet.</p> : null}
            </div>
          ) : null}

          {activeSection === "company" ? (
            <div className="mt-5">
              <button
                type="button"
                onClick={() => void saveSettings()}
                disabled={isSavingSettings || isUploadingLogo}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-amber-500 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 disabled:opacity-60"
              >
                {isSavingSettings || isUploadingLogo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Save Company
              </button>
            </div>
          ) : null}

          {error ? <p className="mt-4 rounded-xl border border-rose-500/50 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</p> : null}
        </section>
      </section>

      {toast ? (
        <div className="fixed bottom-24 right-4 z-50 rounded-xl border border-emerald-500/50 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-100">
          {toast}
        </div>
      ) : null}
    </main>
  );
}
