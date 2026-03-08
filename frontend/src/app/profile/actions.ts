"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type UpdateProfileResult = {
  success: boolean;
  message: string;
};

type InviteRole = "OWNER" | "SPARKY";

type TeamMember = {
  id: string;
  email: string;
  full_name: string;
  role: "OWNER" | "EMPLOYEE";
  status: "ACTIVE" | "PENDING";
  invited_at: string | null;
  last_sign_in_at: string | null;
};

type TeamMembersResult = {
  success: boolean;
  message: string;
  activeUsers: TeamMember[];
  pendingInvites: TeamMember[];
};

type InviteUserResult = {
  success: boolean;
  message: string;
};

type ProfileRow = {
  id: string;
  role: string;
  organization_id: string;
  full_name?: string | null;
};

async function getOwnerProfileContext(): Promise<{ success: false; message: string } | { success: true; userId: string; organizationId: string }> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { success: false, message: "Session expired. Please sign in again." };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role, organization_id")
    .eq("id", user.id)
    .single<ProfileRow>();

  if (profileError || !profile) {
    return { success: false, message: "Unable to resolve your organization profile." };
  }

  if (String(profile.role ?? "").toUpperCase() !== "OWNER") {
    return { success: false, message: "Owner role is required to manage team members." };
  }

  return {
    success: true,
    userId: user.id,
    organizationId: profile.organization_id,
  };
}

export async function listTeamMembers(): Promise<TeamMembersResult> {
  const context = await getOwnerProfileContext();
  if (!context.success) {
    return { success: false, message: context.message, activeUsers: [], pendingInvites: [] };
  }

  const supabaseAdmin = getSupabaseAdmin();
  const [{ data: usersData, error: usersError }, { data: profiles, error: profilesError }] = await Promise.all([
    supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 500 }),
    supabaseAdmin
      .from("profiles")
      .select("id, role, organization_id, full_name")
      .eq("organization_id", context.organizationId),
  ]);

  if (usersError) {
    return { success: false, message: usersError.message || "Unable to load organization users.", activeUsers: [], pendingInvites: [] };
  }

  if (profilesError) {
    return { success: false, message: profilesError.message || "Unable to load organization profiles.", activeUsers: [], pendingInvites: [] };
  }

  const profileById = new Map<string, { role: "OWNER" | "EMPLOYEE"; full_name: string | null }>();
  for (const profile of (profiles ?? []) as ProfileRow[]) {
    profileById.set(profile.id, {
      role: String(profile.role ?? "").toUpperCase() === "OWNER" ? "OWNER" : "EMPLOYEE",
      full_name: profile.full_name ?? null,
    });
  }

  const teamMembers: TeamMember[] = [];
  for (const authUser of usersData.users ?? []) {
    const teamProfile = profileById.get(authUser.id);
    if (!teamProfile) {
      continue;
    }

    const invitedAt = typeof authUser.invited_at === "string" ? authUser.invited_at : null;
    const lastSignInAt = typeof authUser.last_sign_in_at === "string" ? authUser.last_sign_in_at : null;
    const metadataFullName = typeof authUser.user_metadata?.full_name === "string" ? authUser.user_metadata.full_name : null;
    const fullName = (teamProfile.full_name || metadataFullName || authUser.email || "Unknown").trim();

    teamMembers.push({
      id: authUser.id,
      email: authUser.email ?? "",
      full_name: fullName,
      role: teamProfile.role,
      status: invitedAt && !lastSignInAt ? "PENDING" : "ACTIVE",
      invited_at: invitedAt,
      last_sign_in_at: lastSignInAt,
    });
  }

  const sorted = teamMembers.sort((a, b) => a.email.localeCompare(b.email));
  return {
    success: true,
    message: "Team loaded.",
    activeUsers: sorted.filter((member) => member.status === "ACTIVE"),
    pendingInvites: sorted.filter((member) => member.status === "PENDING"),
  };
}

export async function inviteUser(formData: FormData): Promise<InviteUserResult> {
  const context = await getOwnerProfileContext();
  if (!context.success) {
    return { success: false, message: context.message };
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const roleInput = String(formData.get("role") ?? "SPARKY").trim().toUpperCase() as InviteRole;
  const normalizedRole: "OWNER" | "EMPLOYEE" = roleInput === "OWNER" ? "OWNER" : "EMPLOYEE";

  if (!email || !email.includes("@")) {
    return { success: false, message: "A valid invite email is required." };
  }

  if (!fullName) {
    return { success: false, message: "Full name is required for invites." };
  }

  const supabaseAdmin = getSupabaseAdmin();
  const inviteRedirectTo = `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/login`;

  const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    data: {
      full_name: fullName,
      organization_id: context.organizationId,
      role: normalizedRole,
    },
    redirectTo: inviteRedirectTo,
  });

  if (inviteError || !inviteData.user?.id) {
    return { success: false, message: inviteError?.message || "Unable to send invite." };
  }

  const profilePayload = {
    id: inviteData.user.id,
    email,
    full_name: fullName,
    role: normalizedRole,
    organization_id: context.organizationId,
  };
  const profilesTable = supabaseAdmin.from("profiles") as unknown as {
    upsert: (value: typeof profilePayload) => Promise<{ error: { message?: string } | null }>;
  };
  const { error: profileUpsertError } = await profilesTable.upsert(profilePayload);

  if (profileUpsertError) {
    return { success: false, message: profileUpsertError.message || "Invite sent, but profile sync failed." };
  }

  revalidatePath("/profile", "page");

  return {
    success: true,
    message: `Invite sent to ${email}.`,
  };
}

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
  const organization = String(formData.get("organization") ?? "").trim();

  if (!fullName) {
    return { success: false, message: "Full name is required." };
  }

  if (!email || !email.includes("@")) {
    return { success: false, message: "Valid email is required." };
  }

  if (!organization) {
    return { success: false, message: "Organization is required." };
  }

  const emailChanged = (user.email ?? "").toLowerCase() !== email;

  const { error: authError } = await supabase.auth.updateUser({
    email,
    data: {
      full_name: fullName,
      organization,
    },
  });

  if (authError) {
    return { success: false, message: authError.message || "Unable to update auth profile." };
  }

  // Mirror identity fields into public users table when available.
  // Some environments only expose `profiles`, so this remains best-effort.
  const { error: usersError } = await supabase.from("users").upsert({
    id: user.id,
    full_name: fullName,
    email,
  });
  if (usersError) {
    console.warn("Profile update: users table mirror failed", usersError.message);
  }

  revalidatePath("/profile", "page");
  revalidatePath("/dashboard", "page");

  return {
    success: true,
    message: emailChanged
      ? "Profile updated. Check your inbox to verify the new email address."
      : "Profile Updated",
  };
}
