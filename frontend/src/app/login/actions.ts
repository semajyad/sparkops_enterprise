"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  try {
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

    console.log("Server action: Login successful");
    revalidatePath("/", "layout");
    redirect("/");
  } catch (err) {
    console.error("Server action: Unexpected error:", err);
    redirect("/login?error=Server error");
  }
}

export async function signup(formData: FormData) {
  try {
    const supabase = await createClient();

    // type-casting here for convenience
    // in practice, you should validate your inputs
    const data = {
      email: formData.get("email") as string,
      password: formData.get("password") as string,
    };

    console.log("Server action: Attempting signup with email:", data.email);

    const { error } = await supabase.auth.signUp(data);

    if (error) {
      console.error("Server action: Signup failed:", error.message);
      redirect("/login?error=Signup failed");
    }

    console.log("Server action: Signup successful");
    revalidatePath("/", "layout");
    redirect("/");
  } catch (err) {
    console.error("Server action: Unexpected error:", err);
    redirect("/login?error=Server error");
  }
}