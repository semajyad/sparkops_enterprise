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
  required_trade: "ELECTRICAL" | "PLUMBING" | "ANY";
  scheduled_date: string | null;
  customer_email?: string | null;
  customer_mobile?: string | null;
};

export async function createJob(input: CreateJobInput): Promise<void> {
  const supabase = createSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Not authenticated");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single<{ organization_id: string | null }>();

  const organizationId = profile?.organization_id ?? null;

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
      status: "SYNCING",
      ...(organizationId ? { organization_id: organizationId } : {}),
    },
    { onConflict: "id" },
  );

  if (error) {
    throw new Error(`Supabase jobs create failed: ${error.message}`);
  }
}
