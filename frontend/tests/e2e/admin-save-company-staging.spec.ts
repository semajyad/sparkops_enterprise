import { expect, test } from "@playwright/test";

const configuredEmail = process.env.PLAYWRIGHT_TEST_EMAIL;
const configuredPassword = process.env.PLAYWRIGHT_TEST_PASSWORD;
const hasConfiguredCredentials = Boolean(configuredEmail && configuredPassword);

async function loginToStaging(page: import("@playwright/test").Page): Promise<void> {
  if (!configuredEmail || !configuredPassword) {
    throw new Error("Missing PLAYWRIGHT_TEST_EMAIL or PLAYWRIGHT_TEST_PASSWORD.");
  }

  await page.goto("/login");
  await page.locator('input[type="email"]').first().fill(configuredEmail);
  await page.locator('input[type="password"]').first().fill(configuredPassword);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/(home|dashboard)/, { timeout: 30_000 });
}

test.describe("Admin company save", () => {
  test("save company does not hang and returns", async ({ page }) => {
    test.skip(!hasConfiguredCredentials, "Set PLAYWRIGHT_TEST_EMAIL and PLAYWRIGHT_TEST_PASSWORD.");

    await loginToStaging(page);
    await page.goto("/admin", { waitUntil: "domcontentloaded" });

    const sectionPicker = page.getByRole("combobox").first();
    await expect(sectionPicker).toBeVisible({ timeout: 10_000 });
    await sectionPicker.selectOption("company");

    const saveButton = page.getByRole("button", { name: /Save Company|Saving Company|Uploading Logo/i });
    await expect(saveButton).toBeVisible({ timeout: 15_000 });
    await expect(saveButton).toBeEnabled({ timeout: 15_000 });

    const putResponsePromise = page.waitForResponse(
      (response) => response.request().method() === "PUT" && response.url().includes("/api/admin/settings"),
      { timeout: 20_000 },
    );

    await saveButton.click();

    const putResponse = await putResponsePromise;
    expect(putResponse.status()).toBeLessThan(500);

    await expect(saveButton).toBeEnabled({ timeout: 20_000 });

    const successToast = page.getByText(/Admin settings saved\./i);
    const timeoutToast = page.getByText(/timed out/i);
    const errorBanner = page.getByText(/Failed to save admin settings\.|Unable to save settings/i);

    const visibleOutcome = await Promise.race([
      successToast
        .waitFor({ state: "visible", timeout: 12_000 })
        .then(() => "success")
        .catch(() => null),
      timeoutToast
        .waitFor({ state: "visible", timeout: 12_000 })
        .then(() => "timeout")
        .catch(() => null),
      errorBanner
        .waitFor({ state: "visible", timeout: 12_000 })
        .then(() => "error")
        .catch(() => null),
    ]);

    expect(visibleOutcome === "success" || visibleOutcome === "timeout" || visibleOutcome === "error").toBeTruthy();
  });
});
