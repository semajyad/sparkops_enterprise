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

test.describe("Jobs create on staging", () => {
  test("create job does not fail org setup check", async ({ page }) => {
    test.skip(!hasConfiguredCredentials, "Set PLAYWRIGHT_TEST_EMAIL and PLAYWRIGHT_TEST_PASSWORD.");

    await login(page);
    await page.goto("/jobs", { waitUntil: "domcontentloaded" });

    await page.getByRole("button", { name: /Create new job/i }).click();

    await page.getByLabel(/Client Name/i).fill(`Org Setup Debug ${Date.now()}`);
    await page.getByLabel(/Job Title/i).fill("Manual Debug Job");
    await page.getByPlaceholder(/Start typing an address/i).fill("10 Queen Street, Auckland");

    await page.getByRole("button", { name: /^Create Job$/i }).click();
    await expect(page.getByRole("heading", { level: 2, name: /New Job/i })).toBeHidden({ timeout: 25_000 });

    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toMatch(/Organisation setup is incomplete|Organization setup is incomplete/i);
    expect(bodyText).not.toMatch(/Supabase jobs create failed/i);
  });
});
