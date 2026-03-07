import { expect, test } from "@playwright/test";

async function getPendingCount(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(async () => {
    const request = indexedDB.open("sparkops-offline-db", 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const tx = db.transaction("jobDrafts", "readonly");
    const index = tx.objectStore("jobDrafts").index("sync_status");
    const rows = await new Promise<any[]>((resolve, reject) => {
      const getRequest = index.getAll("pending");
      getRequest.onsuccess = () => resolve(getRequest.result || []);
      getRequest.onerror = () => reject(getRequest.error);
    });

    db.close();
    return rows.length;
  });
}

test("captures offline then syncs when back online", async ({ page, context }) => {
  await page.route("http://127.0.0.1:8000/api/ingest", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.goto("/capture");

  await context.setOffline(true);
  await page.getByLabel("Voice Notes (text)").fill("Hori in the cupboard");
  await page.getByRole("button", { name: "Save Draft Offline Now" }).click();

  await expect.poll(() => getPendingCount(page)).toBeGreaterThan(0);

  await context.setOffline(false);
  await page.getByRole("button", { name: "Force Sync Pending Drafts" }).click();

  await expect.poll(() => getPendingCount(page)).toBe(0);
  await expect(page.getByText(/Online/i)).toBeVisible();
});
