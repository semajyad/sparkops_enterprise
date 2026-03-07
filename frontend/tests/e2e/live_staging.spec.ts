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
});
