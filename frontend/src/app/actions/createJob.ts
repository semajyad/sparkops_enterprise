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
  scheduled_date: string | null;
};

export async function createJob(input: CreateJobInput): Promise<void> {
  const supabase = createSupabaseClient();
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
      scheduled_date: input.scheduled_date,
      status: "SYNCING",
    },
    { onConflict: "id" },
  );

  if (error) {
    throw new Error(`Supabase jobs create failed: ${error.message}`);
  }
}
