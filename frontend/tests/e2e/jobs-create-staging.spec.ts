import { expect, test } from "@playwright/test";

const configuredEmail = process.env.PLAYWRIGHT_TEST_EMAIL;
const configuredPassword = process.env.PLAYWRIGHT_TEST_PASSWORD;
const hasConfiguredCredentials = Boolean(configuredEmail && configuredPassword);

async function gotoWithRetry(page: import("@playwright/test").Page, path: string): Promise<void> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      await page.goto(path, { waitUntil: "commit", timeout: 45_000 });
      await page.waitForLoadState("domcontentloaded", { timeout: 20_000 });
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 2_000 * attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Unable to navigate to ${path}`);
}

async function login(page: import("@playwright/test").Page): Promise<void> {
  if (!configuredEmail || !configuredPassword) {
    throw new Error("Missing PLAYWRIGHT_TEST_EMAIL or PLAYWRIGHT_TEST_PASSWORD.");
  }

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    await gotoWithRetry(page, "/login");
    const emailInput = page.locator('input[type="email"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    await expect(emailInput).toBeVisible({ timeout: 20_000 });
    await expect(passwordInput).toBeVisible({ timeout: 20_000 });
    await emailInput.fill(configuredEmail);
    await passwordInput.fill(configuredPassword);
    await page.getByRole("button", { name: /Sign In to TradeOps|Sign In/i }).last().click();
    const authenticatedUrl = /\/(home|dashboard|jobs)/;
    try {
      await expect(page).toHaveURL(authenticatedUrl, { timeout: 30_000 });
      await gotoWithRetry(page, "/jobs");
      await expect(page).toHaveURL(/\/jobs/, { timeout: 30_000 });
      return;
    } catch {
      const alertText = (await page.getByRole("alert").first().innerText().catch(() => "")).trim();
      if (alertText.length > 0) {
        throw new Error(`Unable to log in: ${alertText}`);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1_500 * attempt));
  }
  const alertText = (await page.getByRole("alert").first().innerText().catch(() => "")).trim();
  throw new Error(alertText ? `Unable to log in: ${alertText}` : "Unable to log in after multiple attempts.");
}

test.describe("Jobs create on staging", () => {
  test("create job does not fail org setup check", async ({ page }) => {
    test.setTimeout(180_000);
    test.skip(!hasConfiguredCredentials, "Set PLAYWRIGHT_TEST_EMAIL and PLAYWRIGHT_TEST_PASSWORD.");

    await login(page);

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
