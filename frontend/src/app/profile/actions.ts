"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

type UpdateProfileResult = {
  success: boolean;
  message: string;
};

export async function updateProfile(formData: FormData): Promise<UpdateProfileResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { success: false, message: "Session expired. Please sign in again." };
  }

  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!fullName) {
    return { success: false, message: "Full name is required." };
  }

  if (!email || !email.includes("@")) {
    return { success: false, message: "Valid email is required." };
  }

  const emailChanged = (user.email ?? "").toLowerCase() !== email;

  const { error: authError } = await supabase.auth.updateUser({
    email,
    data: {
      full_name: fullName,
    },
  });

  if (authError) {
    return { success: false, message: authError.message || "Unable to update auth profile." };
  }

  const upsertPayload: Record<string, unknown> = {
    id: user.id,
    full_name: fullName,
    updated_at: new Date().toISOString(),
  };

  const { error: profileError } = await supabase.from("profiles").upsert(upsertPayload);
  if (profileError) {
    return { success: false, message: profileError.message || "Unable to update profile table." };
  }

  // Mirror identity fields into public users table when available.
  // Some environments only expose `profiles`, so this remains best-effort.
  await supabase.from("users").upsert({
    id: user.id,
    full_name: fullName,
    email,
    updated_at: new Date().toISOString(),
  });

  revalidatePath("/profile", "page");
  revalidatePath("/dashboard", "page");

  return {
    success: true,
    message: emailChanged
      ? "Profile updated. Check your inbox to verify the new email address."
      : "Profile Updated",
  };
}
