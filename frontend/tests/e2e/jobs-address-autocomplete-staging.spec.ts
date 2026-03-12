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

test.describe("Jobs address autocomplete on staging", () => {
  test("new job modal renders mapbox suggestions", async ({ page }) => {
    test.skip(!hasConfiguredCredentials, "Set PLAYWRIGHT_TEST_EMAIL and PLAYWRIGHT_TEST_PASSWORD.");

    await login(page);
    await gotoWithRetry(page, "/jobs");

    await page.getByRole("button", { name: /Create new job/i }).click();

    const addressInput = page.getByPlaceholder(/Start typing an address/i);
    await expect(addressInput).toBeVisible({ timeout: 10_000 });
    await addressInput.fill("21 Churchill Avenue");

    const firstSuggestion = page.locator("ul li button").first();
    await expect(firstSuggestion).toBeVisible({ timeout: 20_000 });

    const suggestionText = (await firstSuggestion.innerText()).trim();
    expect(suggestionText.length).toBeGreaterThan(3);
  });
});
