import { expect, test } from "@playwright/test";

const configuredEmail = process.env.PLAYWRIGHT_TEST_EMAIL;
const configuredPassword = process.env.PLAYWRIGHT_TEST_PASSWORD;
const hasConfiguredCredentials = Boolean(configuredEmail && configuredPassword);

async function gotoWithRetry(page: import("@playwright/test").Page, path: string): Promise<void> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      await page.goto(path, { waitUntil: "domcontentloaded", timeout: 30_000 });
      return;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(1500 * attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Unable to navigate to ${path}`);
}

async function login(page: import("@playwright/test").Page): Promise<void> {
  if (!configuredEmail || !configuredPassword) {
    throw new Error("Missing PLAYWRIGHT_TEST_EMAIL or PLAYWRIGHT_TEST_PASSWORD.");
  }

  await gotoWithRetry(page, "/login");
  await page.locator('input[type="email"]').first().fill(configuredEmail);
  await page.locator('input[type="password"]').first().fill(configuredPassword);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/(home|dashboard)/, { timeout: 30_000 });
}

test.describe("Jobs create on staging", () => {
  test("create job does not fail org setup check", async ({ page }) => {
    test.skip(!hasConfiguredCredentials, "Set PLAYWRIGHT_TEST_EMAIL and PLAYWRIGHT_TEST_PASSWORD.");

    await login(page);
    await gotoWithRetry(page, "/jobs");

    await page.getByRole("button", { name: /Create new job/i }).click();
    await expect(page.getByRole("heading", { level: 2, name: /New Job/i })).toBeVisible({ timeout: 20_000 });

    const uniqueClientName = `Org Setup Debug ${Date.now()}`;
    await page.getByLabel(/Client Name/i).fill(uniqueClientName);
    await page.getByLabel(/Job Title/i).fill("Manual Debug Job");
    await page.getByPlaceholder(/Start typing an address/i).fill("10 Queen Street, Auckland");

    await page.getByRole("button", { name: /^Create Job$/i }).click();
    await expect(page.getByRole("heading", { level: 2, name: /New Job/i })).toBeHidden({ timeout: 25_000 });

    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toMatch(/Organisation setup is incomplete|Organization setup is incomplete/i);
    expect(bodyText).not.toMatch(/Supabase jobs create failed/i);

    await page.getByRole("button", { name: /^To Do$/i }).click();
    await expect(page.getByText(uniqueClientName)).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: /^Drafts$/i }).click();
    await expect(page.getByText(uniqueClientName)).toBeHidden({ timeout: 20_000 });
  });
});
