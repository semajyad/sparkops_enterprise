import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) {
    return null;
  }

  const [scheme, value] = authHeader.split(" ");
  if (!scheme || !value || scheme.toLowerCase() !== "bearer") {
    return null;
  }

  const token = value.trim();
  return token.length > 0 ? token : null;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  const bearerToken = extractBearerToken(request.headers.get("authorization"));
  let resolvedUser = user;
  let resolvedError = error;

  if ((!resolvedUser || resolvedError) && bearerToken) {
    const fallback = await supabase.auth.getUser(bearerToken);
    resolvedUser = fallback.data.user;
    resolvedError = fallback.error;
  }

  if (resolvedError || !resolvedUser) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const fullNameRaw = resolvedUser.user_metadata?.full_name;
  const fullName = typeof fullNameRaw === "string" && fullNameRaw.trim() ? fullNameRaw.trim() : null;

  return NextResponse.json({
    user: {
      id: resolvedUser.id,
      email: resolvedUser.email ?? null,
      full_name: fullName,
    },
  });
}
