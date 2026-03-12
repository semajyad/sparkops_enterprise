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
  const [seatCount, setSeatCount] = useState(0);

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

  async function beginCheckout(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/integrations/stripe/checkout/seats`, {
        method: "POST",
        body: JSON.stringify({
          success_url: `${window.location.origin}/admin/billing?status=success`,
          cancel_url: `${window.location.origin}/admin/billing?status=cancel`,
          quantity: seatCount,
        }),
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || `Unable to start checkout (${response.status})`);
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
  const BASE_PLAN_PRICE = 79;
  const SEAT_PRICE = 29;
  const monthlyTotal = BASE_PLAN_PRICE + seatCount * SEAT_PRICE;
  const seatPercentage = Math.min(100, Math.round(((entitlements?.total_allocated ?? 0) / (entitlements?.licensed_seats ?? 1)) * 100));

  return (
    <main className="min-h-screen w-full bg-gray-50 p-4 sm:p-6">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-gray-900">Billing & Plans</h1>
          <p className="mt-1 text-sm text-gray-600">Subscription & seats in one checkout.</p>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading || authLoading ? (
          <div className="h-[360px] animate-pulse rounded-2xl bg-gray-200 shadow-sm" />
        ) : (
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Subscription & Seats</h2>
              {isSubscribed ? (
                <span className="inline-flex items-center rounded-full bg-green-500 px-2.5 py-0.5 text-xs font-semibold text-white">
                  ACTIVE
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-red-500 px-2.5 py-0.5 text-xs font-semibold text-white">
                  {entitlements?.subscription_status === "PAST_DUE" ? "PAST DUE" : "INACTIVE"}
                </span>
              )}
            </div>

            <div className="mt-4 rounded-xl border border-gray-200 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Technician Seats</p>
              <div className="mt-3 flex items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={() => setSeatCount((prev) => Math.max(0, prev - 1))}
                  disabled={loading || seatCount <= 0}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-300 text-lg font-bold text-gray-700 transition hover:border-orange-500 hover:text-orange-600 disabled:opacity-40"
                  aria-label="Decrease seat count"
                >
                  −
                </button>
                <span className="min-w-[2ch] text-center text-2xl font-bold text-gray-900">{seatCount}</span>
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
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-200">
                <div className="h-full rounded-full bg-orange-600 transition-all duration-500" style={{ width: `${seatPercentage}%` }} />
              </div>
              <p className="mt-2 text-center text-xs text-gray-500">
                {entitlements?.active_users ?? 0} active, {entitlements?.pending_invites ?? 0} pending • {entitlements?.total_allocated ?? 0} / {entitlements?.licensed_seats ?? 1} in use
              </p>
            </div>

            <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
              <p className="text-xs text-gray-500">Total Monthly Commitment</p>
              <p className="text-2xl font-bold text-gray-900">${monthlyTotal}</p>
              <p className="text-xs text-gray-500">Base plan ${BASE_PLAN_PRICE} + {seatCount} seat{seatCount === 1 ? "" : "s"} × ${SEAT_PRICE}</p>
            </div>

            <div className="mt-4 border-t border-gray-200 pt-4">
              <button
                type="button"
                onClick={() => void beginCheckout()}
                disabled={loading}
                className="w-full rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-orange-700 disabled:opacity-60"
              >
                {isSubscribed ? "Update Seats" : `Subscribe for $${monthlyTotal}/mo`}
              </button>
              {isSubscribed ? (
                <button
                  type="button"
                  onClick={() => void openPortal()}
                  disabled={loading}
                  className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60"
                >
                  Manage Subscription
                </button>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

