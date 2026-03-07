import { expect, test } from "@playwright/test";

test.describe("Live staging ladder mode", () => {
  test("navigates to ladder, toggles mode, and renders triage feed update", async ({ page }) => {
    let ladderEnabled = false;
    const triageItems: Array<{
      id: string;
      from_number: string;
      urgency: "High" | "Medium" | "Low";
      summary: string;
      created_at: string;
    }> = [];

    await page.route("**/api/twilio/ladder-mode", async (route, request) => {
      if (request.method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ enabled: ladderEnabled }),
        });
        return;
      }

      if (request.method() === "POST") {
        const payload = request.postDataJSON() as { enabled?: boolean };
        ladderEnabled = Boolean(payload.enabled);
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ enabled: ladderEnabled }),
        });
        return;
      }

      await route.fallback();
    });

    await page.route("**/api/twilio/voicemails", async (route) => {
      const body = { items: ladderEnabled ? triageItems : [] };

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    });

    await page.route("**/api/twilio/recording", async (route, request) => {
      if (request.method() !== "POST") {
        await route.fallback();
        return;
      }

      const mockMessage = {
        id: `vm_live_${Date.now()}`,
        from_number: "+64210000001",
        urgency: "High" as const,
        summary: "Main board fault, urgent callback needed before shutdown now",
        created_at: new Date().toISOString(),
      };

      triageItems.unshift(mockMessage);

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "processed", message: mockMessage }),
      });
    });

    await page.goto("/ladder");

    await expect(page.getByRole("heading", { name: "Ladder Mode Dashboard" })).toBeVisible();
    await expect(page.getByRole("switch", { name: /Ladder Mode/i })).toHaveAttribute("aria-checked", "false");

    await page.getByRole("switch", { name: /Ladder Mode/i }).click();

    await page.request.post("https://sparkopsstagingbackend-staging.up.railway.app/api/twilio/recording", {
      form: {
        RecordingUrl: "https://api.twilio.com/mock/recording",
        From: "+64210000001",
        CallSid: "CA_LIVE_001",
        RecordingSid: "RE_LIVE_001",
      },
    });

    await expect(page.getByRole("switch", { name: /Ladder Mode/i })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText("Main board fault, urgent callback needed before shutdown now")).toBeVisible();

    const firstUrgencyBadge = page.locator("li span", { hasText: "High" }).first();
    await expect(firstUrgencyBadge).toBeVisible();

    await page.getByRole("button", { name: "Refresh Feed" }).click();
    await expect(page.getByText("Ladder Mode active. Calls route to Smart Triage.")).toBeVisible();
  });
});
