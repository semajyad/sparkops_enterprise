import { defineConfig } from "@playwright/test";

const targetEnv = (process.env.PLAYWRIGHT_TARGET ?? "local").toLowerCase();
const defaultBaseUrl =
  targetEnv === "staging"
    ? "https://proactive-strength-staging.up.railway.app"
    : "http://127.0.0.1:3003";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? defaultBaseUrl;
const isLocalRun = baseURL.includes("127.0.0.1") || baseURL.includes("localhost");

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: ["golden_path.spec.ts", "offline_resilience.spec.ts"],
  globalSetup: "./tests/e2e/setup-e2e.ts",
  timeout: 90_000,
  retries: 1,
  webServer: isLocalRun
    ? {
        command: "npx next dev --hostname 127.0.0.1 --port 3003",
        url: "http://127.0.0.1:3003",
        reuseExistingServer: true,
        timeout: 90_000,
      }
    : undefined,
  use: {
    baseURL,
    ignoreHTTPSErrors: true,
    trace: "retain-on-failure",
    navigationTimeout: 90_000,
  },
});
