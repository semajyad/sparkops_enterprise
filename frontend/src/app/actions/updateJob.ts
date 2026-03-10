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
};

export async function updateJob(input: UpdateJobInput): Promise<void> {
  const supabase = createSupabaseClient();
  const { error } = await supabase
    .from("jobs")
    .update({
      client_name: input.client_name,
      title: input.title,
      location: input.location,
      address: input.address,
      latitude: input.latitude,
      longitude: input.longitude,
      scheduled_date: input.scheduled_date,
    })
    .eq("id", input.id);

  if (error) {
    throw new Error(`Supabase jobs update failed: ${error.message}`);
  }
}
