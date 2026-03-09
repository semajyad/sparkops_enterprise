"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const supabase = await createClient();

    // type-casting here for convenience
    // in practice, you should validate your inputs
    const data = {
      email: formData.get("email") as string,
      password: formData.get("password") as string,
    };

    console.log("Server action: Attempting login with email:", data.email);

  const { data: signInData, error } = await supabase.auth.signInWithPassword(data);

  if (error) {
    console.error("Server action: Login failed:", error.message);
    redirect("/login?error=Invalid credentials");
  }

  if (!signInData.session?.access_token || !signInData.session?.refresh_token) {
    console.error("Server action: Login failed to establish session token pair");
    redirect("/login?error=Session%20establishment%20failed");
  }

  const { error: setSessionError } = await supabase.auth.setSession({
    access_token: signInData.session.access_token,
    refresh_token: signInData.session.refresh_token,
  });
  if (setSessionError) {
    console.error("Server action: setSession failed:", setSessionError.message);
    redirect("/login?error=Session%20persistence%20failed");
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    console.warn("Server action: Login user validation fallback:", userError?.message ?? "Unknown user");
  }

  console.log("Server action: Login successful");
  revalidatePath("/", "layout");
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error("Server action: Logout failed:", error.message);
    redirect("/profile?error=Unable to logout");
  }

  revalidatePath("/", "layout");
  revalidatePath("/dashboard", "layout");
  redirect("/login?message=Logged out");
}

export async function signup(formData: FormData) {
  const supabase = await createClient();
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

    // type-casting here for convenience
    // in practice, you should validate your inputs
    const data = {
      email: formData.get("email") as string,
      password: formData.get("password") as string,
      fullName: (formData.get("full_name") as string | null)?.trim() ?? "",
      organization: (formData.get("organization") as string | null)?.trim() ?? "",
      trade: String(formData.get("trade") ?? "ELECTRICAL").trim().toUpperCase(),
    };

    const normalizedTrade = data.trade === "PLUMBING" ? "PLUMBING" : "ELECTRICAL";

    if (!data.organization) {
      redirect("/login?error=Organization%20is%20required&mode=signup");
    }

    console.log("Server action: Attempting signup with email:", data.email);

  const { error } = await supabase.auth.signUp({
    email: data.email,
    password: data.password,
    options: {
      data: {
        full_name: data.fullName,
        organization: data.organization,
        trade: normalizedTrade,
      },
      emailRedirectTo: origin,
    },
  });

  if (error) {
    console.error("Server action: Signup failed:", error.message);
    redirect("/login?error=Signup failed&mode=signup");
  }

  console.log("Server action: Signup successful");
  revalidatePath("/", "layout");
  revalidatePath("/dashboard", "layout");
  redirect("/login?message=Check%20your%20email%20to%20confirm%20your%20account.&mode=login");
}