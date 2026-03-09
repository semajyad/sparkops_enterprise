import { defineConfig } from "@playwright/test";

const targetEnv = (process.env.PLAYWRIGHT_TARGET ?? "staging").toLowerCase();
const defaultBaseUrl = targetEnv === "local" ? "http://127.0.0.1:3000" : "https://proactive-strength-staging.up.railway.app";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? defaultBaseUrl;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90_000,
  retries: 1,
  use: {
    baseURL,
    ignoreHTTPSErrors: true,
    trace: "retain-on-failure",
    navigationTimeout: 90_000,
  },
});
