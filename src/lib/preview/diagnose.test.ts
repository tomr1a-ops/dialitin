import { describe, expect, test } from "vitest";
import { diagnose, DRAFT_CONTENT_VERSION_ID } from "@/lib/preview/diagnose";

describe("diagnose stub", () => {
  test("returns null until Phase 1 wires the engine", () => {
    expect(diagnose([], DRAFT_CONTENT_VERSION_ID)).toBeNull();
    expect(diagnose([], "published-version-id")).toBeNull();
  });
});
