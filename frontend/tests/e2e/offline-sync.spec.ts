import { expect, test } from "@playwright/test";

async function ensureAuthenticated(page: import("@playwright/test").Page): Promise<void> {
  const configuredEmail = process.env.PLAYWRIGHT_TEST_EMAIL;
  const configuredPassword = process.env.PLAYWRIGHT_TEST_PASSWORD;

  if (configuredEmail && configuredPassword) {
    await page.goto("/login");
    await page.getByLabel("Email").first().fill(configuredEmail);
    await page.getByLabel("Password").first().fill(configuredPassword);
    await page.getByRole("button", { name: "Sign In to SparkOps" }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
    return;
  }

  const uniqueEmail = `sparky+offline-${Date.now()}@example.com`;
  const password = "SparkOps!2026";

  await page.goto("/login?mode=signup");
  await page.getByLabel("Full Name").fill("Offline Sync Tester");
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
}

async function getPendingCount(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(async () => {
    const request = indexedDB.open("sparkops-offline-db", 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const tx = db.transaction("jobDrafts", "readonly");
    const index = tx.objectStore("jobDrafts").index("sync_status");
    const rows = await new Promise<unknown[]>((resolve, reject) => {
      const getRequest = index.getAll("pending");
      getRequest.onsuccess = () => resolve(getRequest.result || []);
      getRequest.onerror = () => reject(getRequest.error);
    });

    db.close();
    return rows.length;
  });
}

test("captures offline then syncs when back online", async ({ page, context }) => {
  test.skip(
    !process.env.PLAYWRIGHT_TEST_EMAIL || !process.env.PLAYWRIGHT_TEST_PASSWORD,
    "Set PLAYWRIGHT_TEST_EMAIL and PLAYWRIGHT_TEST_PASSWORD to run auth-dependent offline sync test on staging.",
  );

  await page.route("http://127.0.0.1:8000/api/ingest", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });

  await ensureAuthenticated(page);
  await page.goto("/capture");

  await context.setOffline(true);
  await page.getByLabel("Voice Notes (text)").fill("Hot water cylinder in cupboard");
  await page.getByRole("button", { name: "Save Draft Offline Now" }).click();

  await expect.poll(() => getPendingCount(page)).toBeGreaterThan(0);

  await context.setOffline(false);
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
  }

  await expect.poll(() => getPendingCount(page), { timeout: 20_000 }).toBe(0);
  await expect(page.getByText(/Online/i)).toBeVisible();
});
