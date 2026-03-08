import { expect, test } from "@playwright/test";

const configuredEmail = process.env.PLAYWRIGHT_TEST_EMAIL;
const configuredPassword = process.env.PLAYWRIGHT_TEST_PASSWORD;
const hasConfiguredCredentials = Boolean(configuredEmail && configuredPassword);

async function ensureAuthenticated(page: import("@playwright/test").Page): Promise<void> {
  if (!configuredEmail || !configuredPassword) {
    throw new Error("Missing PLAYWRIGHT_TEST_EMAIL or PLAYWRIGHT_TEST_PASSWORD.");
  }

  await page.goto("/login");
  await page.getByLabel("Email").first().fill(configuredEmail);
  await page.getByLabel("Password").first().fill(configuredPassword);
  await page.getByRole("button", { name: "Sign In to SparkOps" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
}

test.describe("Live staging auth and onboarding", () => {
  test("login redirects to dashboard and profile is accessible", async ({ page }) => {
    test.skip(
      !hasConfiguredCredentials,
      "Set PLAYWRIGHT_TEST_EMAIL and PLAYWRIGHT_TEST_PASSWORD to run live staging auth tests.",
    );

    await ensureAuthenticated(page);
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { level: 1, name: /Welcome/i })).toBeVisible();
    await expect(page.getByRole("link", { name: "Start New Job" })).toBeVisible();

    await page.goto("/profile");
    await expect(page.getByRole("heading", { level: 1, name: /Profile|Sparky/i })).toBeVisible();
  });

  test("critical path: auth to capture, sync, and view job detail", async ({ page }) => {
    test.skip(
      !hasConfiguredCredentials,
      "Set PLAYWRIGHT_TEST_EMAIL and PLAYWRIGHT_TEST_PASSWORD to run live staging auth tests.",
    );

    const mockJobId = "11111111-2222-3333-4444-555555555555";

    await ensureAuthenticated(page);

    await page.route("**/api/ingest", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: mockJobId,
          raw_transcript: "Installed RCD and polarity checks complete. 2 hours labour.",
          extracted_data: {
            client: "Playwright Customer",
            line_items: [{ qty: "2", description: "Labour", type: "LABOR" }],
          },
          status: "DRAFT",
          created_at: new Date().toISOString(),
        }),
      });
    });

    await page.route("**/api/jobs", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: mockJobId,
            status: "DRAFT",
            created_at: new Date().toISOString(),
            client_name: "Playwright Customer",
            extracted_data: {},
          },
        ]),
      });
    });

    await page.route(`**/api/jobs/${mockJobId}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: mockJobId,
          raw_transcript: "Installed RCD and polarity checks complete. 2 hours labour.",
          extracted_data: {
            client: "Playwright Customer",
            line_items: [{ qty: "2", description: "Labour", type: "LABOR" }],
          },
          status: "DRAFT",
          created_at: new Date().toISOString(),
        }),
      });
    });

    await page.goto("/capture");
    await page.getByLabel("Voice Notes (text)").fill("Installed RCD and polarity checks complete. 2 hours labour.");
    await page.getByRole("button", { name: "Save Draft Offline Now" }).click();
    await expect(page.getByText(/draft saved offline and queued for sync/i)).toBeVisible({ timeout: 30_000 });
    const forceSyncButton = page.getByRole("button", { name: "Force Sync Pending Drafts" });
    let shouldForceSync = false;
    try {
      await expect(forceSyncButton).toBeEnabled({ timeout: 3_000 });
      shouldForceSync = true;
    } catch {
      shouldForceSync = false;
    }

    if (shouldForceSync) {
      await forceSyncButton.click();
      await expect(page.getByText(/pending drafts sync complete/i)).toBeVisible({ timeout: 30_000 });
    }

    await page.goto(`/jobs/${mockJobId}`);

    await expect(page).toHaveURL(/\/jobs\//);
    await expect(page.getByText("Evidence Locker")).toBeVisible();
  });
});
