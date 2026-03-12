import { expect, test } from "@playwright/test";

const configuredEmail = process.env.PLAYWRIGHT_TEST_EMAIL;
const configuredPassword = process.env.PLAYWRIGHT_TEST_PASSWORD;
const hasConfiguredCredentials = Boolean(configuredEmail && configuredPassword);

async function login(page: import("@playwright/test").Page): Promise<void> {
  if (!configuredEmail || !configuredPassword) {
    throw new Error("Missing PLAYWRIGHT_TEST_EMAIL or PLAYWRIGHT_TEST_PASSWORD.");
  }

  await page.goto("/login");
  await page.locator('input[type="email"]').first().fill(configuredEmail);
  await page.locator('input[type="password"]').first().fill(configuredPassword);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/(home|dashboard)/, { timeout: 30_000 });
}

test.describe("Jobs address autocomplete on staging", () => {
  test("new job modal renders mapbox suggestions", async ({ page }) => {
    test.skip(!hasConfiguredCredentials, "Set PLAYWRIGHT_TEST_EMAIL and PLAYWRIGHT_TEST_PASSWORD.");

    await login(page);
    await page.goto("/jobs", { waitUntil: "domcontentloaded" });

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
