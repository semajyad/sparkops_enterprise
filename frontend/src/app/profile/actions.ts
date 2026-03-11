"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

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
  trade: "ELECTRICAL" | "PLUMBING";
  status: "ACTIVE" | "PENDING";
  invited_at: string | null;
  last_sign_in_at: string | null;
};

type InviteApiRow = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  status: string;
  created_at: string;
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
  organization_id: string | null;
  full_name?: string | null;
  trade?: string | null;
};

async function getOwnerProfileContext(): Promise<
  { success: false; message: string } | { success: true; userId: string; organizationId: string; accessToken: string | null }
> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { success: false, message: "Session expired. Please sign in again." };
  }

  let { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role, organization_id")
    .eq("id", user.id)
    .single<ProfileRow>();

  if (profileError || !profile) {
    // Auto-heal missing profile
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabaseAdmin = getSupabaseAdmin() as any;
      let newOrgId = crypto.randomUUID();
      const metadataOrg = typeof user.user_metadata?.organization === "string" ? user.user_metadata.organization.trim() : "";
      
      const { data: newOrg } = await supabaseAdmin.from("organizations").insert({
        id: newOrgId,
        name: metadataOrg || "My Organization",
      }).select("id").single();
      
      if (newOrg) {
        newOrgId = newOrg.id;
        const { data: newProfile } = await supabaseAdmin.from("profiles").insert({
          id: user.id,
          organization_id: newOrgId,
          role: "OWNER",
        }).select("id, role, organization_id").single();
        
        if (newProfile) {
          profile = newProfile as ProfileRow;
          profileError = null;
        }
      }
    } catch {
      // Ignore and fall through to error
    }

    if (!profile) {
      return { success: false, message: "Unable to resolve your organization profile." };
    }
  }

  const organizationId = typeof profile.organization_id === "string" ? profile.organization_id.trim() : "";
  if (!organizationId) {
    return {
      success: false,
      message: "Organization setup is incomplete. Please finish onboarding in Admin > Company before managing team members.",
    };
  }

  if (String(profile.role ?? "").toUpperCase() !== "OWNER") {
    return { success: false, message: "Owner role is required to manage team members." };
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  return {
    success: true,
    userId: user.id,
    organizationId,
    accessToken: session?.access_token ?? null,
  };
}

async function fetchPendingInvites(accessToken: string | null): Promise<TeamMember[]> {
  if (!accessToken) {
    return [];
  }

  const response = await fetch(`${API_BASE_URL}/api/invites`, {
    method: "GET",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Unable to load pending invites (${response.status}).`);
  }

  const payload = (await response.json()) as InviteApiRow[];
  const rows = Array.isArray(payload) ? payload : [];
  return rows.map((invite) => ({
    id: invite.id,
    email: invite.email,
    full_name: invite.full_name,
    role: String(invite.role).toUpperCase() === "OWNER" ? "OWNER" : "EMPLOYEE",
    trade: "ELECTRICAL",
    status: "PENDING",
    invited_at: invite.created_at,
    last_sign_in_at: null,
  }));
}

export async function listTeamMembers(): Promise<TeamMembersResult> {
  const context = await getOwnerProfileContext();
  if (!context.success) {
    return { success: false, message: context.message, activeUsers: [], pendingInvites: [] };
  }

  const supabaseAdmin = getSupabaseAdmin();
  const [{ data: usersData, error: usersError }, { data: profiles, error: profilesError }, pendingInvites] = await Promise.all([
    supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 500 }),
    supabaseAdmin
      .from("profiles")
      .select("id, role, organization_id, full_name, trade")
      .eq("organization_id", context.organizationId),
    fetchPendingInvites(context.accessToken),
  ]);

  if (usersError) {
    return { success: false, message: usersError.message || "Unable to load organization users.", activeUsers: [], pendingInvites: [] };
  }

  if (profilesError) {
    return { success: false, message: profilesError.message || "Unable to load organization profiles.", activeUsers: [], pendingInvites: [] };
  }

  const profileById = new Map<string, { role: "OWNER" | "EMPLOYEE"; full_name: string | null; trade: "ELECTRICAL" | "PLUMBING" }>();
  for (const profile of (profiles ?? []) as ProfileRow[]) {
    profileById.set(profile.id, {
      role: String(profile.role ?? "").toUpperCase() === "OWNER" ? "OWNER" : "EMPLOYEE",
      full_name: profile.full_name ?? null,
      trade: String(profile.trade ?? "").toUpperCase() === "PLUMBING" ? "PLUMBING" : "ELECTRICAL",
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
      trade: teamProfile.trade,
      status: invitedAt && !lastSignInAt ? "PENDING" : "ACTIVE",
      invited_at: invitedAt,
      last_sign_in_at: lastSignInAt,
    });
  }

  const activeOnly = teamMembers.filter((member) => member.status === "ACTIVE").sort((a, b) => a.email.localeCompare(b.email));
  const sortedInvites = pendingInvites.sort((a, b) => (a.invited_at ?? "").localeCompare(b.invited_at ?? "")).reverse();
  return {
    success: true,
    message: "Team loaded.",
    activeUsers: activeOnly,
    pendingInvites: sortedInvites,
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
  const tradeInput = String(formData.get("trade") ?? "ELECTRICAL").trim().toUpperCase();
  const normalizedTrade: "ELECTRICAL" | "PLUMBING" = tradeInput === "PLUMBING" ? "PLUMBING" : "ELECTRICAL";

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
      trade: normalizedTrade,
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
    trade: normalizedTrade,
    organization_id: context.organizationId,
  };
  const profilesTable = supabaseAdmin.from("profiles") as unknown as {
    upsert: (value: typeof profilePayload) => Promise<{ error: { message?: string } | null }>;
  };
  const { error: profileUpsertError } = await profilesTable.upsert(profilePayload);

  if (profileUpsertError) {
    return { success: false, message: profileUpsertError.message || "Invite sent, but profile sync failed." };
  }

  if (!context.accessToken) {
    return { success: false, message: "Invite sent, but unable to sync pending invite list (missing auth token)." };
  }

  const inviteResponse = await fetch(`${API_BASE_URL}/api/invites`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${context.accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      email,
      full_name: fullName,
      role: normalizedRole === "OWNER" ? "OWNER" : "TRADESMAN",
    }),
  });

  if (!inviteResponse.ok) {
    const body = await inviteResponse.text();
    return { success: false, message: body || `Invite sent, but pending invite record failed (${inviteResponse.status}).` };
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
