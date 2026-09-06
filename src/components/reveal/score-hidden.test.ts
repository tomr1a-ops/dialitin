import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** Sec 6.5 / 11 — DialItIn Score is internal; never rendered to golfers. */
describe("consumer reveal components never render score_internal", () => {
  const revealDir = join(process.cwd(), "src/components/reveal");
  const files = readdirSync(revealDir).filter((f) => f.endsWith(".tsx"));

  for (const file of files) {
    test(`${file} does not surface internal score`, () => {
      const src = readFileSync(join(revealDir, file), "utf8");
      expect(src).not.toMatch(/score_internal/);
      expect(src).not.toMatch(/DialItIn Score/i);
      expect(src).not.toMatch(/\bGrade\b/);
      expect(src).not.toMatch(/\/100/);
    });
  }
});
