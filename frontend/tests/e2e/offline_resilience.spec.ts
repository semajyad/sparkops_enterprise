import { expect, test } from "@playwright/test";

async function loginAsSeededSparky(page: import("@playwright/test").Page): Promise<void> {
  const email = process.env.PLAYWRIGHT_TEST_EMAIL;
  const password = process.env.PLAYWRIGHT_TEST_PASSWORD;

  if (!email || !password) {
    throw new Error("Missing PLAYWRIGHT_TEST_EMAIL or PLAYWRIGHT_TEST_PASSWORD after setup-e2e seeding.");
  }

  await page.goto("/login");
  await page.getByLabel("Email").first().fill(email);
  await page.getByLabel("Password").first().fill(password);
  await page.getByRole("button", { name: "Sign In to TradeOps" }).click();
  await expect(page).toHaveURL(/\/(home|dashboard)/, { timeout: 25_000 });
}

async function getPendingCount(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(async () => {
    const request = indexedDB.open("sparkops-offline-db");
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

test("offline tunnel: save while offline then sync once online", async ({ page, context }) => {
  await page.route("**/api/ingest", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ extracted_data: { safety_tests: [] } }),
    });
  });

  await loginAsSeededSparky(page);
  await page.goto("/capture");

  await context.setOffline(true);
  await expect(page.getByLabel("Network status: Offline")).toBeVisible({ timeout: 10_000 });

  await page.getByLabel("Voice Notes (Text)").fill("Offline tunnel note");
  await page.getByRole("button", { name: /save \/ sync now/i }).click();

  await expect(page.getByText(/draft saved offline and queued for sync/i)).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => getPendingCount(page), { timeout: 20_000 }).toBeGreaterThan(0);

  await context.setOffline(false);
  await expect(page.getByLabel("Network status: Online")).toBeVisible({ timeout: 10_000 });

  const forceSyncButton = page.getByRole("button", { name: /force sync pending drafts/i });
  await expect(forceSyncButton).toBeVisible({ timeout: 20_000 });
  await forceSyncButton.click();

  await expect(page.getByText(/pending drafts sync complete/i)).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => getPendingCount(page), { timeout: 20_000 }).toBe(0);

  await page.reload();
  await expect.poll(() => getPendingCount(page), { timeout: 20_000 }).toBe(0);
});
