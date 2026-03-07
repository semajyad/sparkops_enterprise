import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90_000,
  retries: 1,
  use: {
    baseURL: "https://proactive-strength-staging.up.railway.app",
    ignoreHTTPSErrors: true,
    trace: "retain-on-failure",
    navigationTimeout: 90_000,
  },
});
