import { describe, expect, test } from "vitest";
import { diffPayloads } from "@/lib/admin/diff";

describe("diffPayloads", () => {
  test("reports changed fields and ignores equals", () => {
    const lines = diffPayloads(
      { name: "Width at top", unit: "ratio" },
      { name: "Width at Top", unit: "ratio" },
    );
    expect(lines).toEqual([
      { path: "name", before: "Width at top", after: "Width at Top" },
    ]);
  });
});
