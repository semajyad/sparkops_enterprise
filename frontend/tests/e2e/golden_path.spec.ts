import { expect, test } from "@playwright/test";

type JobRow = {
  id: string;
  status: string;
  created_at: string;
  client_name: string;
  extracted_data: Record<string, unknown>;
};

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

async function getLatestVoiceNote(page: import("@playwright/test").Page): Promise<string | null> {
  return page.evaluate(async () => {
    const request = indexedDB.open("sparkops-offline-db");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const tx = db.transaction("jobDrafts", "readonly");
    const rows = await new Promise<Array<{ voice_text?: string }>>((resolve, reject) => {
      const getRequest = tx.objectStore("jobDrafts").getAll();
      getRequest.onsuccess = () => resolve((getRequest.result ?? []) as Array<{ voice_text?: string }>);
      getRequest.onerror = () => reject(getRequest.error);
    });

    db.close();
    const latest = rows.at(-1);
    return typeof latest?.voice_text === "string" ? latest.voice_text : null;
  });
}

test("golden path: login -> new job -> capture -> persistence", async ({ page, context }) => {
  const jobs: JobRow[] = [];

  await context.addInitScript(() => {
    class FakeMediaRecorder {
      static isTypeSupported(): boolean {
        return true;
      }

      mimeType = "audio/webm";
      state: "inactive" | "recording" = "inactive";
      ondataavailable: ((event: BlobEvent) => void) | null = null;
      onstop: (() => void) | null = null;

      constructor() {}

      start(): void {
        this.state = "recording";
      }

      stop(): void {
        this.state = "inactive";
        const chunk = new Blob(["golden-path-audio"], { type: "audio/webm" });
        this.ondataavailable?.({ data: chunk } as BlobEvent);
        this.onstop?.();
      }
    }

    Object.defineProperty(window.navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => ({
          getTracks: () => [{ stop: () => undefined }],
        }),
      },
    });

    Object.defineProperty(window, "MediaRecorder", {
      configurable: true,
      value: FakeMediaRecorder,
    });
  });

  await page.route("**/api/jobs", async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      const created: JobRow = {
        id: String(body.client_generated_id ?? crypto.randomUUID()),
        status: "DRAFT",
        created_at: new Date().toISOString(),
        client_name: String(body.client_name ?? "E2E Client"),
        extracted_data: {
          location: body.location,
          address: body.address,
        },
      };
      jobs.unshift(created);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(created),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(jobs),
    });
  });

  await page.route("**/api/ingest", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ extracted_data: { safety_tests: [] } }),
    });
  });

  await loginAsSeededSparky(page);

  await page.goto("/jobs");
  await page.getByRole("button", { name: "Create new job" }).click();
  await page.getByLabel("Client Name").fill("Golden Path Client");
  await page.getByLabel("Job Title").fill("Switchboard Repair");
  await page.getByLabel("Address").fill("21 Churchill Road");
  await page.getByRole("button", { name: /create draft/i }).click();

  await expect(page.getByText("Golden Path Client")).toBeVisible({ timeout: 20_000 });

  await page.goto("/capture");
  await page.getByLabel("Voice Notes (Text)").fill("Golden path voice note saved");
  await page.getByRole("button", { name: /start recording/i }).click();
  await page.getByRole("button", { name: /stop recording/i }).click();
  await page.getByRole("button", { name: /save \/ sync now/i }).click();

  await expect(page.getByText(/draft saved offline and queued for sync/i)).toBeVisible({ timeout: 20_000 });

  await page.reload();
  await expect.poll(() => getLatestVoiceNote(page), { timeout: 20_000 }).toContain("Golden path voice note saved");
});
