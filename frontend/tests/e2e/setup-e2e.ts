import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_EMAIL = "sparky.e2e.local@sparkops.test";
const DEFAULT_PASSWORD = "SparkOps!2026";

function isLocalBaseUrl(url: string): boolean {
  return url.includes("127.0.0.1") || url.includes("localhost");
}

function hydrateEnvFromFile(filename: string): void {
  const absolutePath = path.resolve(process.cwd(), filename);
  if (!fs.existsSync(absolutePath)) {
    return;
  }

  const contents = fs.readFileSync(absolutePath, "utf-8");
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

export default async function globalSetup(): Promise<void> {
  hydrateEnvFromFile(".env.local");
  hydrateEnvFromFile(".env.production");
  hydrateEnvFromFile(".env.test");  // Load test-specific environment variables

  const targetEnv = (process.env.PLAYWRIGHT_TARGET ?? "local").toLowerCase();
  const baseUrl =
    process.env.PLAYWRIGHT_BASE_URL ??
    (targetEnv === "staging" ? "https://proactive-strength-staging.up.railway.app" : "http://127.0.0.1:3000");

  const email = process.env.PLAYWRIGHT_TEST_EMAIL ?? DEFAULT_EMAIL;
  const password = process.env.PLAYWRIGHT_TEST_PASSWORD ?? DEFAULT_PASSWORD;
  process.env.PLAYWRIGHT_TEST_EMAIL = email;
  process.env.PLAYWRIGHT_TEST_PASSWORD = password;

  if (!isLocalBaseUrl(baseUrl)) {
    return;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || (!serviceRoleKey && !anonKey)) {
    throw new Error("Local E2E setup requires NEXT_PUBLIC_SUPABASE_URL and a Supabase key (service role or anon). ");
  }

  if (serviceRoleKey) {
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: listed, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 500 });
    if (listError) {
      throw new Error(`Unable to list users for E2E seeding: ${listError.message}`);
    }

    const existing = listed.users.find((user) => (user.email ?? "").toLowerCase() === email.toLowerCase());

    if (existing) {
      const { error: updateError } = await admin.auth.admin.updateUserById(existing.id, {
        password,
        email_confirm: true,
        user_metadata: {
          ...(existing.user_metadata ?? {}),
          full_name: "Sparky E2E",
          organization: "SparkOps Test Org",
        },
      });

      if (updateError) {
        throw new Error(`Unable to update seeded E2E user: ${updateError.message}`);
      }
      return;
    }

    const { error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: "Sparky E2E",
        organization: "SparkOps Test Org",
      },
    });

    if (createError) {
      throw new Error(`Unable to create seeded E2E user: ${createError.message}`);
    }
    return;
  }

  const client = createClient(supabaseUrl, anonKey as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: createError } = await client.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: "Sparky E2E",
        organization: "SparkOps Test Org",
      },
    },
  });

  if (createError && !/already registered|already exists/i.test(createError.message)) {
    throw new Error(`Unable to create seeded E2E user: ${createError.message}`);
  }

  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) {
    throw new Error(`Unable to sign in seeded E2E user with anon key fallback: ${signInError.message}`);
  }
}
