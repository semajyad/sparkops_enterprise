"use client";

import { createClient as createSupabaseClient } from "@/lib/supabase/client";

export type UpdateJobInput = {
  id: string;
  client_name: string;
  title: string;
  location: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  scheduled_date: string | null;
  customer_email?: string | null;
  customer_mobile?: string | null;
};

export async function updateJob(input: UpdateJobInput): Promise<void> {
  const supabase = createSupabaseClient();
  const payload: Record<string, unknown> = {
    client_name: input.client_name,
    title: input.title,
    location: input.location,
    address: input.address,
    latitude: input.latitude,
    longitude: input.longitude,
    scheduled_date: input.scheduled_date,
  };
  if (input.customer_email !== undefined) payload.customer_email = input.customer_email;
  if (input.customer_mobile !== undefined) payload.customer_mobile = input.customer_mobile;

  const { data: updatedJobRow, error } = await supabase
    .from("jobs")
    .update(payload)
    .eq("id", input.id)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) {
    throw new Error(`Supabase jobs update failed: ${error.message}`);
  }

  if (!updatedJobRow?.id) {
    throw new Error("Supabase jobs update affected 0 rows.");
  }

  const draftPatch: Record<string, unknown> = {
    client_name: input.client_name,
    date_scheduled: input.scheduled_date,
    extracted_data: {
      client: input.client_name,
      job_title: input.title,
      address: input.address,
      location: input.location,
      latitude: input.latitude,
      longitude: input.longitude,
      scheduled_date: input.scheduled_date,
      customer_email: input.customer_email ?? null,
      customer_mobile: input.customer_mobile ?? null,
    },
  };

  const { error: draftError } = await supabase
    .from("job_drafts")
    .update(draftPatch)
    .eq("id", input.id);

  if (draftError) {
    throw new Error(`Supabase job_drafts update failed: ${draftError.message}`);
  }
}
