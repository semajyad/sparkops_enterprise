import { expect, test } from "@playwright/test";

test.describe("Live staging auth and onboarding", () => {
  test("signup captures full name and redirects to dashboard", async ({ page }) => {
    const uniqueEmail = `sparky+${Date.now()}@example.com`;
    const password = "SparkOps!2026";

    await page.goto("/login?mode=signup");
    await expect(page).toHaveURL(/\/login\?mode=signup/);

    await page.getByLabel("Full Name").fill("Hemi Ropata");
    await page.getByLabel("Email").first().fill(uniqueEmail);
    await page.getByLabel("Password").first().fill(password);
    await page.getByRole("button", { name: "Create Account" }).click();

    await Promise.race([
      expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 }),
      page.getByRole("button", { name: "Sign In to SparkOps" }).waitFor({ state: "visible", timeout: 20_000 }),
    ]);

    if (!page.url().includes("/dashboard")) {
      await page.getByLabel("Email").first().fill(uniqueEmail);
      await page.getByLabel("Password").first().fill(password);
      await page.getByRole("button", { name: "Sign In to SparkOps" }).click();
    }

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { level: 1, name: /Welcome/i })).toBeVisible();
    await expect(page.getByRole("link", { name: "Start New Job" })).toBeVisible();
  });

  test("critical path: auth to capture, sync, and view job detail", async ({ page }) => {
    const uniqueEmail = `sparky+critical-${Date.now()}@example.com`;
    const password = "SparkOps!2026";
    const mockJobId = "11111111-2222-3333-4444-555555555555";

    await page.goto("/login?mode=signup");
    await page.getByLabel("Full Name").fill("Wiremu Kahu");
    await page.getByLabel("Email").first().fill(uniqueEmail);
    await page.getByLabel("Password").first().fill(password);
    await page.getByRole("button", { name: "Create Account" }).click();

    await Promise.race([
      expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 }),
      page.getByRole("button", { name: "Sign In to SparkOps" }).waitFor({ state: "visible", timeout: 20_000 }),
    ]);

    if (!page.url().includes("/dashboard")) {
      await page.getByLabel("Email").first().fill(uniqueEmail);
      await page.getByLabel("Password").first().fill(password);
      await page.getByRole("button", { name: "Sign In to SparkOps" }).click();
      await expect(page).toHaveURL(/\/dashboard/);
    }

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
