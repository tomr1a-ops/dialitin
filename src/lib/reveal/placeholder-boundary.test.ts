import { describe, expect, test } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd(), "src");
const ALLOWED = [
  "app/admin/",
  "lib/reveal/placeholder.ts",
  "lib/reveal/trace-path.test.ts",
  "lib/reveal/placeholder-boundary.test.ts",
];

function walk(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function isAllowed(file: string): boolean {
  const rel = file.slice(ROOT.length + 1);
  return ALLOWED.some((prefix) => rel.startsWith(prefix) || rel === prefix);
}

describe("placeholder import boundary", () => {
  test("golfer paths do not import createPlaceholderRevealInput", () => {
    const offenders: string[] = [];
    for (const file of walk(ROOT)) {
      if (isAllowed(file)) {
        continue;
      }
      const source = readFileSync(file, "utf8");
      if (source.includes("createPlaceholderRevealInput") || source.includes("@/lib/reveal/placeholder")) {
        offenders.push(file.slice(ROOT.length + 1));
      }
    }
    expect(offenders).toEqual([]);
  });
});
