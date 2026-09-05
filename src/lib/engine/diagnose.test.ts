import { describe, expect, test } from "vitest";
import { diagnose } from "@/lib/engine/diagnose";

describe("diagnose stub", () => {
  test("returns null until the Sec 6.4 rules engine exists", () => {
    expect(diagnose([], "draft")).toBeNull();
  });
});
