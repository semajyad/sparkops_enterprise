import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function normalizedFullName(rawFullName: unknown, fallbackEmail: string | null | undefined): string {
  if (typeof rawFullName === "string" && rawFullName.trim()) {
    return rawFullName.trim();
  }

  const emailLocalPart = typeof fallbackEmail === "string" ? fallbackEmail.split("@")[0]?.trim() : "";
  if (emailLocalPart) {
    return emailLocalPart;
  }

  return "New User";
}

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabaseAdmin = getSupabaseAdmin() as any;
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("organization_id, role, full_name")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      throw new Error(profileError.message);
    }

    const existingOrganizationId = typeof profile?.organization_id === "string" ? profile.organization_id.trim() : "";
    if (existingOrganizationId) {
      return NextResponse.json({ organization_id: existingOrganizationId }, { status: 200 });
    }

    const fullName = normalizedFullName(user.user_metadata?.full_name, user.email);
    const organizationName = `${fullName}'s Company`;
    const { data: newOrg, error: orgError } = await supabaseAdmin
      .from("organizations")
      .insert({
        id: crypto.randomUUID(),
        name: organizationName,
      })
      .select("id")
      .single();

    const newOrganizationId = typeof newOrg?.id === "string" ? newOrg.id : "";
    if (orgError || !newOrganizationId) {
      throw new Error(orgError?.message || "Failed to create organization.");
    }

    const role = String(profile?.role ?? "OWNER").toUpperCase() === "EMPLOYEE" ? "EMPLOYEE" : "OWNER";
    const { error: upsertProfileError } = await supabaseAdmin.from("profiles").upsert(
      {
        id: user.id,
        organization_id: newOrganizationId,
        role,
        full_name: fullName,
      },
      { onConflict: "id" }
    );

    if (upsertProfileError) {
      throw new Error(upsertProfileError.message);
    }

    return NextResponse.json({ organization_id: newOrganizationId }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: `Auto-provisioning failed: ${message}` }, { status: 500 });
  }
}
