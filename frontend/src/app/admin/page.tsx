"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { apiFetch, parseApiJson } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  deleteVehicleFromCache,
  getAdminSettingsCache,
  listVehiclesFromCache,
  setAdminSettingsCache,
  upsertVehicleInCache,
  type CachedVehicle,
} from "@/lib/db";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

type AdminSettings = {
  logo_url: string | null;
  business_name: string | null;
  gst_number: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
};

type VehicleRecord = {
  id: string;
  name: string;
  plate: string;
  notes: string | null;
  updated_at: string;
};

type AdminSection = "branding" | "details" | "fleet";

const EMPTY_SETTINGS: AdminSettings = {
  logo_url: null,
  business_name: null,
  gst_number: null,
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
  const { loading: authLoading, role } = useAuth();
  const [activeSection, setActiveSection] = useState<AdminSection>("branding");
  const [settings, setSettings] = useState<AdminSettings>(EMPTY_SETTINGS);
  const [vehicles, setVehicles] = useState<VehicleRecord[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isSavingVehicle, setIsSavingVehicle] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [vehicleName, setVehicleName] = useState("");
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [vehicleNotes, setVehicleNotes] = useState("");

  const isOwner = role === "OWNER";

  const sectionTitle = useMemo(() => {
    if (activeSection === "branding") return "Branding";
    if (activeSection === "details") return "Business Details";
    return "Fleet Management";
  }, [activeSection]);

  const hydrateFromDexie = useCallback(async (): Promise<void> => {
    const [cachedSettings, cachedVehicles] = await Promise.all([getAdminSettingsCache(), listVehiclesFromCache()]);

    if (cachedSettings) {
      setSettings({
        logo_url: cachedSettings.logo_url,
        business_name: cachedSettings.business_name,
        gst_number: cachedSettings.gst_number,
        bank_account_name: cachedSettings.bank_account_name,
        bank_account_number: cachedSettings.bank_account_number,
      });
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
    setError(null);
    try {
      const [settingsResponse, vehiclesResponse] = await Promise.all([
        apiFetch(`${API_BASE_URL}/api/admin/settings`, { cache: "no-store" }),
        apiFetch(`${API_BASE_URL}/api/admin/vehicles`, { cache: "no-store" }),
      ]);

      if (settingsResponse.ok) {
        const settingsPayload = await parseApiJson<AdminSettings & { organization_id: string; updated_at: string }>(settingsResponse);
        const nextSettings: AdminSettings = {
          logo_url: settingsPayload.logo_url,
          business_name: settingsPayload.business_name,
          gst_number: settingsPayload.gst_number,
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
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Unable to refresh admin data.");
    } finally {
      setIsSyncing(false);
    }
  }, [isOwner]);

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
      business_name: toNullable(toInput(settings.business_name)),
      gst_number: toNullable(toInput(settings.gst_number)),
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
        business_name: payload.business_name,
        gst_number: payload.gst_number,
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
      <section className="mx-auto grid w-full max-w-6xl gap-4 md:grid-cols-[240px_1fr]">
        <aside className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
          <p className="text-xs uppercase tracking-[0.26em] text-amber-400">Admin Suite</p>
          <nav className="mt-4 space-y-2">
            {([
              ["branding", "Branding"],
              ["details", "Business Details"],
              ["fleet", "Fleet Management"],
            ] as Array<[AdminSection, string]>).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveSection(key)}
                className={`w-full rounded-xl border px-3 py-2 text-left text-sm font-semibold transition ${
                  activeSection === key
                    ? "border-amber-400/70 bg-amber-500/20 text-amber-100"
                    : "border-slate-700 bg-slate-950/60 text-slate-300 hover:border-amber-500/50"
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
          {isSyncing ? <p className="mt-4 text-xs text-slate-400">Syncing latest org data...</p> : null}
        </aside>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl shadow-black/50">
          <h1 className="text-2xl font-semibold text-white">{sectionTitle}</h1>

          {activeSection === "branding" ? (
            <div className="mt-4 space-y-4">
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
                Business Name
                <input
                  value={toInput(settings.business_name)}
                  onChange={(event) => setSettings((prev) => ({ ...prev, business_name: event.target.value }))}
                  className="mt-1 min-h-11 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                  placeholder="SparkOps Electrical"
                />
              </label>
            </div>
          ) : null}

          {activeSection === "details" ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
                Bank Account Name
                <input
                  value={toInput(settings.bank_account_name)}
                  onChange={(event) => setSettings((prev) => ({ ...prev, bank_account_name: event.target.value }))}
                  className="mt-1 min-h-11 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                  placeholder="SparkOps Ltd"
                />
              </label>
              <label className="block text-sm text-slate-200 sm:col-span-2">
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

          {activeSection !== "fleet" ? (
            <div className="mt-5">
              <button
                type="button"
                onClick={() => void saveSettings()}
                disabled={isSavingSettings}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-amber-500 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 disabled:opacity-60"
              >
                {isSavingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save {activeSection === "branding" ? "Branding" : "Details"}
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
