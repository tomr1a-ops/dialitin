import { describe, expect, test } from "vitest";
import {
  formatEngineReasonForDisplay,
  assertNoDashInGolferReason,
} from "@/lib/reveal/reason-display";
import { SLO_MO_TIMING_REASON } from "@/lib/engine/slo-mo-export";

describe("formatEngineReasonForDisplay", () => {
  test("maps slo-mo timing reason without dashes", () => {
    const text = formatEngineReasonForDisplay(SLO_MO_TIMING_REASON);
    expect(text).toBe("Slow-motion clip. Timing not measured.");
    assertNoDashInGolferReason(text);
  });

  test("converts unknown dashed strings", () => {
    const text = formatEngineReasonForDisplay("foo — bar");
    expect(text).toBe("foo. bar");
    assertNoDashInGolferReason(text);
  });
});
