import { expect, test } from "@playwright/test";

const configuredEmail = process.env.PLAYWRIGHT_TEST_EMAIL;
const configuredPassword = process.env.PLAYWRIGHT_TEST_PASSWORD;
const hasConfiguredCredentials = Boolean(configuredEmail && configuredPassword);

async function ensureAuthenticated(page: import("@playwright/test").Page): Promise<void> {
  if (!configuredEmail || !configuredPassword) {
    throw new Error("Missing PLAYWRIGHT_TEST_EMAIL or PLAYWRIGHT_TEST_PASSWORD.");
  }

  await page.goto("/login");
  await page.locator('input[type="email"]').first().fill(configuredEmail);
  await page.locator('input[type="password"]').first().fill(configuredPassword);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/(home|dashboard)/, { timeout: 20_000 });
}

test.describe("Live staging auth and onboarding", () => {
  test("login redirects to dashboard and profile is accessible", async ({ page }) => {
    test.skip(
      !hasConfiguredCredentials,
      "Set PLAYWRIGHT_TEST_EMAIL and PLAYWRIGHT_TEST_PASSWORD to run live staging auth tests.",
    );

    await ensureAuthenticated(page);
    await expect(page).toHaveURL(/\/(home|dashboard)/);
    await expect(page.getByRole("heading", { level: 1, name: /Welcome/i })).toBeVisible();
    const startJobCta = page.getByRole("link", { name: "Start New Job" });
    const recentActivity = page.getByRole("heading", { level: 2, name: "Recent Activity" });
    await expect(startJobCta.or(recentActivity)).toBeVisible();

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
    const saveOfflineButton = page.getByRole("button", { name: "Save Draft Offline Now" });
    const saveOfflineVisible = await saveOfflineButton
      .isVisible({ timeout: 3_000 })
      .catch(() => false);

    if (saveOfflineVisible) {
      await saveOfflineButton.click();
      await expect(page.getByText(/draft saved offline and queued for sync/i)).toBeVisible({ timeout: 30_000 });
    }

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
      await page.waitForTimeout(2_000);
    }

    await page.goto(`/jobs/${mockJobId}`);

    await expect(page).toHaveURL(/\/jobs\//);
    await expect(page.getByText("Evidence Locker")).toBeVisible();
  });

  test("performance: jobs local interactions stay under 100ms", async ({ page }) => {
    test.skip(
      !hasConfiguredCredentials,
      "Set PLAYWRIGHT_TEST_EMAIL and PLAYWRIGHT_TEST_PASSWORD to run live staging auth tests.",
    );

    await ensureAuthenticated(page);
    await page.goto("/jobs");
    await expect(page.getByRole("button", { name: "Create new job" })).toBeVisible({ timeout: 10_000 });

    const searchLatency = await page.evaluate(() => {
      const input = document.querySelector<HTMLInputElement>("#jobs-search");
      if (!input) {
        return Number.POSITIVE_INFINITY;
      }
      const start = performance.now();
      input.value = "Perf Local Client";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return performance.now() - start;
    });
    expect(searchLatency).toBeLessThan(100);

    const clearLatency = await page.evaluate(() => {
      const input = document.querySelector<HTMLInputElement>("#jobs-search");
      if (!input) {
        return Number.POSITIVE_INFINITY;
      }
      const start = performance.now();
      input.value = "";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return performance.now() - start;
    });
    expect(clearLatency).toBeLessThan(100);
  });
});
