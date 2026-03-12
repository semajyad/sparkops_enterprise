"use client";

import { createClient as createSupabaseClient } from "@/lib/supabase/client";

export type CreateJobInput = {
  id: string;
  client_name: string;
  title: string;
  location: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  assigned_to_user_id: string | null;
  organization_id?: string | null;
  required_trade: "ELECTRICAL" | "PLUMBING" | "ANY";
  scheduled_date: string | null;
  customer_email?: string | null;
  customer_mobile?: string | null;
};

async function autoProvisionOrganization(): Promise<string> {
  const response = await fetch("/api/organization/auto-provision", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    let message = "";
    try {
      const payload = (await response.json()) as { error?: unknown };
      message = typeof payload.error === "string" ? payload.error.trim() : "";
    } catch {
      const body = await response.text();
      message = body.trim();
    }
    throw new Error(message || `Auto-provision failed (${response.status})`);
  }

  const payload = (await response.json()) as { organization_id?: string | null };
  return typeof payload.organization_id === "string" ? payload.organization_id.trim() : "";
}

export async function createJob(input: CreateJobInput): Promise<void> {
  const supabase = createSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Not authenticated");
  }

  let organizationId = typeof input.organization_id === "string" ? input.organization_id.trim() : "";
  if (!organizationId) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle<{ organization_id: string | null }>();

    if (profileError) {
      throw new Error(`Unable to resolve organization_id: ${profileError.message}`);
    }

    organizationId = typeof profile?.organization_id === "string" ? profile.organization_id.trim() : "";
  }

  if (!organizationId) {
    try {
      organizationId = await autoProvisionOrganization();
    } catch (provisionError) {
      const detail = provisionError instanceof Error ? provisionError.message : "Unknown error";
      throw new Error(`Auto-provisioning organization failed. Please complete setup manually. (${detail})`);
    }
  }

  if (!organizationId) {
    throw new Error("Auto-provisioning organization failed. Please complete setup manually.");
  }

  const { error } = await supabase.from("jobs").upsert(
    {
      id: input.id,
      client_name: input.client_name,
      title: input.title,
      location: input.location,
      address: input.address,
      latitude: input.latitude,
      longitude: input.longitude,
      assigned_to_user_id: input.assigned_to_user_id,
      required_trade: input.required_trade,
      scheduled_date: input.scheduled_date,
      customer_email: input.customer_email ?? null,
      customer_mobile: input.customer_mobile ?? null,
      status: "IN_PROGRESS",
      organization_id: organizationId,
    },
    { onConflict: "id" },
  );

  if (error) {
    const normalizedMessage = String(error.message ?? "").toLowerCase();
    const isExpectedRlsDenial =
      normalizedMessage.includes("row-level security") || normalizedMessage.includes("policy for table \"jobs\"");
    if (!isExpectedRlsDenial) {
      throw new Error(`Supabase jobs create failed: ${error.message}`);
    }
  }
}
