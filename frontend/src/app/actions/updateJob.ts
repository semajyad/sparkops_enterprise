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

  const { error } = await supabase
    .from("jobs")
    .update(payload)
    .eq("id", input.id);

  if (error) {
    throw new Error(`Supabase jobs update failed: ${error.message}`);
  }
}
