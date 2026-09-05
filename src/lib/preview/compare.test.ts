import { describe, expect, test } from "vitest";
import {
  compareDiagnoses,
  swingsThatChangeHeadline,
} from "@/lib/preview/compare";

describe("compareDiagnoses", () => {
  test("treats two stubs as unchanged", () => {
    expect(compareDiagnoses(null, null)).toEqual({
      draftHeadline: null,
      publishedHeadline: null,
      headlineChanged: false,
    });
  });

  test("flags a headline that draft would change", () => {
    const compare = compareDiagnoses(
      { headline: "Early extension", faultKey: "early_extension" },
      { headline: "Trail-side tilt", faultKey: "trail_tilt" },
    );
    expect(compare.headlineChanged).toBe(true);
    expect(swingsThatChangeHeadline([{ swingId: "s1", compare }])).toEqual([
      "s1",
    ]);
  });
});
