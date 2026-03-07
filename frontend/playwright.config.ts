import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  use: {
    baseURL: "https://proactive-strength-staging.up.railway.app",
    trace: "retain-on-failure",
  },
});
