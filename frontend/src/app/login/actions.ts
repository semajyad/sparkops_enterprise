"use server";

import { revalidatePath } from "next/cache";
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

  const { error } = await supabase.auth.signInWithPassword(data);

  if (error) {
    console.error("Server action: Login failed:", error.message);
    redirect("/login?error=Invalid credentials");
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

    // type-casting here for convenience
    // in practice, you should validate your inputs
    const data = {
      email: formData.get("email") as string,
      password: formData.get("password") as string,
      fullName: (formData.get("full_name") as string | null)?.trim() ?? "",
    };

    console.log("Server action: Attempting signup with email:", data.email);

  const { error } = await supabase.auth.signUp({
    email: data.email,
    password: data.password,
    options: {
      data: {
        full_name: data.fullName,
      },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/dashboard`,
    },
  });

  if (error) {
    console.error("Server action: Signup failed:", error.message);
    redirect("/login?error=Signup failed&mode=signup");
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) {
    console.error("Server action: Signup user lookup failed:", userError.message);
  }

  if (!user) {
    redirect("/login?message=Account created. Please sign in.&mode=login");
  }

  console.log("Server action: Signup successful");
  revalidatePath("/", "layout");
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard");
}