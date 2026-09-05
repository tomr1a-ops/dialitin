import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";

function gitSha(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "local";
  }
}

test.describe("Reveal Phase 2b screenshots", () => {
  test("captures screens 2, 5, 8 and reports canvas FPS", async ({ page }) => {
    const sha = gitSha();
    const outDir = path.join(process.cwd(), "assets", `reveal-${sha}`);
    fs.mkdirSync(outDir, { recursive: true });

    await page.goto("/debug/reveal-e2e");
    await expect(page.getByTestId("demo-nav")).toBeVisible({ timeout: 60_000 });

    const screens = [
      { id: "annotated", file: "screen-02-annotated-playback.png", label: "Screen 2" },
      { id: "target", file: "screen-05-target-position.png", label: "Screen 5" },
      { id: "receipt", file: "screen-08-fix-receipt.png", label: "Screen 8" },
    ] as const;

    for (const screen of screens) {
      await page.locator(`[data-screen="${screen.id}"]`).click();
      await page.waitForTimeout(800);
      await page.screenshot({
        path: path.join(outDir, screen.file),
        fullPage: true,
      });
    }

    await page.locator('[data-screen="annotated"]').click();
    await page.waitForTimeout(1200);
    const fpsAttr = await page
      .locator('[data-testid="reveal-annotated-playback"]')
      .getAttribute("data-canvas-fps");
    const fps = fpsAttr ? Number.parseFloat(fpsAttr) : 0;

    fs.writeFileSync(
      path.join(outDir, "performance.json"),
      JSON.stringify(
        {
          canvasFpsDesktop: fps,
          targetFps: 30,
          meetsTarget: fps >= 30,
          note:
            "Desktop Chromium @ ¼× playback. iPhone 12 Safari not measured in CI.",
          capturedAt: new Date().toISOString(),
          sha,
        },
        null,
        2,
      ),
    );

    expect(fps).toBeGreaterThan(0);
  });
});
