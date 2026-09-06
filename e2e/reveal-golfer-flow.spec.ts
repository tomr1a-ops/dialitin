import { test, expect } from "@playwright/test";

test.describe("Golfer reveal flow", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("reveal page never shows invented Sept 4 comparison on fresh profile", async ({
    page,
  }) => {
    await page.route("**/api/diagnose", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          diagnosis: {
            outcome: "refuse",
            headline_fault:
              "We couldn't read this clip reliably enough to diagnose.",
            fault_key: null,
            family: null,
            evidence: [],
            first_guilty_frame: null,
            protocol_id: null,
            mode: "diagnose",
            reasons: ["no metric cleared confidence gate"],
            delta_pct_stance: null,
            score_internal: null,
          },
          evaluations: {},
          coachOutput: null,
          swingId: "00000000-0000-0000-0000-000000000001",
          diagnosisId: "00000000-0000-0000-0000-000000000002",
          isFirstResult: true,
          whatChangedSince: undefined,
        }),
      });
    });

    await page.goto("/reveal");

    await expect(page.getByText("No clip in this tab yet")).toBeVisible();
    await expect(page.getByTestId("reveal-what-changed-since")).toHaveCount(0);
    await expect(page.getByText("Sept 4")).toHaveCount(0);
    await expect(page.getByText("14% of stance width")).toHaveCount(0);
  });
});
