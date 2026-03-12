"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";

import { apiFetch, parseApiJson } from "@/lib/api";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

type BillingEntitlements = {
  subscription_status: string;
  licensed_seats: number;
  active_users: number;
  pending_invites: number;
  total_allocated: number;
  can_add_member: boolean;
};

export default function AdminBillingPage(): React.JSX.Element {
  const { loading: authLoading } = useAuth();
  const [entitlements, setEntitlements] = useState<BillingEntitlements | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [seatCount, setSeatCount] = useState(1);

  async function refresh(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/admin/billing/entitlements`, { cache: "no-store" });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || `Unable to load entitlements (${response.status})`);
      }
      const payload = await parseApiJson<BillingEntitlements>(response);
      setEntitlements(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load billing details.");
    } finally {
      setLoading(false);
    }
  }

  async function beginCheckout(mode: "base" | "seats", qty = 1): Promise<void> {
    void qty;
    setLoading(true);
    setError(null);
    try {
      const endpoint = mode === "base" ? "/api/integrations/stripe/checkout/base" : "/api/integrations/stripe/checkout/seats";
      const response = await apiFetch(`${API_BASE_URL}${endpoint}`, {
        method: "POST",
        body: JSON.stringify({
          success_url: `${window.location.origin}/admin/billing?status=success`,
          cancel_url: `${window.location.origin}/admin/billing?status=cancel`,
          quantity: mode === "seats" ? seatCount : 1,
        }),
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || `Unable to start ${mode} checkout (${response.status})`);
      }
      const payload = await parseApiJson<{ url: string }>(response);
      if (!payload.url) {
        throw new Error("Stripe checkout URL missing.");
      }
      window.location.href = payload.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to open checkout.");
    } finally {
      setLoading(false);
    }
  }

  async function openPortal(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/integrations/stripe/portal`, {
        method: "POST",
        body: JSON.stringify({ return_url: `${window.location.origin}/admin/billing` }),
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || `Unable to open billing portal (${response.status})`);
      }
      const payload = await parseApiJson<{ url: string }>(response);
      if (!payload.url) {
        throw new Error("Stripe portal URL missing.");
      }
      window.location.href = payload.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to open billing portal.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!authLoading) {
      void refresh();
    }
  }, [authLoading]);

  const isSubscribed = entitlements?.subscription_status === "ACTIVE";
  const seatPercentage = Math.min(100, Math.round(((entitlements?.total_allocated ?? 0) / (entitlements?.licensed_seats ?? 1)) * 100));

  return (
    <main className="min-h-screen w-full bg-gray-50 p-4 sm:p-6 md:p-8">
      <div className="mx-auto w-full max-w-4xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Billing & Plans</h1>
          <p className="mt-1 text-sm text-gray-600">Base owner subscription plus paid technician seat licenses.</p>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading || authLoading ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="h-[250px] animate-pulse rounded-2xl bg-gray-200 shadow-sm" />
            <div className="h-[250px] animate-pulse rounded-2xl bg-gray-200 shadow-sm" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="flex flex-col justify-between rounded-2xl bg-white p-6 shadow-sm">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Base Plan</h2>
                <div className="mt-3">
                  {isSubscribed ? (
                    <span className="inline-flex items-center rounded-full bg-green-500 px-2.5 py-0.5 text-xs font-semibold text-white">
                      ACTIVE
                    </span>
                  ) : (
                    <span className="inline-flex animate-pulse items-center rounded-full bg-red-500 px-2.5 py-0.5 text-xs font-semibold text-white">
                      {entitlements?.subscription_status === "PAST_DUE" ? "PAST DUE" : "INACTIVE"}
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-6">
                {!isSubscribed ? (
                  <button
                    type="button"
                    onClick={() => void beginCheckout("base")}
                    disabled={loading}
                    className="w-full rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-orange-700 disabled:opacity-60"
                  >
                    Subscribe Base Plan
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void openPortal()}
                    disabled={loading}
                    className="w-full rounded-xl border-2 border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50 disabled:opacity-60"
                  >
                    Manage Subscription
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-col justify-between rounded-2xl bg-white p-6 shadow-sm">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Technician Licenses</h2>
                <div className="mt-4">
                  <div className="mb-2 flex justify-between text-sm font-medium text-gray-700">
                    <span>{entitlements?.total_allocated ?? 0} / {entitlements?.licensed_seats ?? 1} Seats In Use</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                    <div 
                      className="h-full rounded-full bg-orange-600 transition-all duration-500" 
                      style={{ width: `${seatPercentage}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    {entitlements?.active_users ?? 0} active, {entitlements?.pending_invites ?? 0} pending
                  </p>
                </div>
              </div>
              
              <div className="mt-6">
                <div className="mb-3 flex items-center justify-center gap-4">
                  <button
                    type="button"
                    onClick={() => setSeatCount((prev) => Math.max(1, prev - 1))}
                    disabled={loading || seatCount <= 1}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-300 text-lg font-bold text-gray-700 transition hover:border-orange-500 hover:text-orange-600 disabled:opacity-40"
                    aria-label="Decrease seat count"
                  >
                    −
                  </button>
                  <span className="min-w-[2ch] text-center text-xl font-bold text-gray-900">{seatCount}</span>
                  <button
                    type="button"
                    onClick={() => setSeatCount((prev) => prev + 1)}
                    disabled={loading}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-300 text-lg font-bold text-gray-700 transition hover:border-orange-500 hover:text-orange-600 disabled:opacity-40"
                    aria-label="Increase seat count"
                  >
                    +
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => void beginCheckout("seats")}
                  disabled={loading}
                  className="w-full rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-orange-700 disabled:opacity-60"
                >
                  {entitlements?.subscription_status === "INACTIVE"
                    ? `Subscribe Base Plan + ${seatCount} ${seatCount === 1 ? "Seat" : "Seats"}`
                    : `Add ${seatCount} ${seatCount === 1 ? "Seat" : "Seats"}`}
                </button>
                <p className="mt-2 text-center text-xs text-gray-500">
                  Your card will be charged a pro-rated amount for the remainder of this billing cycle.
                </p>
              </div>
            </div>
          </div>
        )}
        {!loading && !authLoading ? (
          <div className="mt-8 text-right">
            <p className="text-2xl font-bold text-gray-900">
              Total Monthly Commitment: ${79 + seatCount * 29}
            </p>
            <p className="mt-1 text-xs text-gray-500">Base plan $79 + {seatCount} technician {seatCount === 1 ? "seat" : "seats"} × $29</p>
          </div>
        ) : null}
      </div>
    </main>
  );
}

