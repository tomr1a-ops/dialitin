import { describe, expect, test } from "vitest";
import {
  assertRevealInputConfidence,
  isNonFaultReveal,
  metricEligibleForReveal,
} from "@/lib/reveal/confidence-gate";
import type { RevealInput } from "@/lib/reveal/types";

function baseInput(overrides: Partial<RevealInput> = {}): RevealInput {
  return {
    fault: "early_extension",
    metric: {
      key: "tush_line_pelvis",
      label: "Pelvis vs. tush line",
      value: 12,
      unit: "pct_stance",
      confidence: 0.82,
      reason: "Measured from pose",
      bandMin: 0,
      bandMax: 6,
    },
    feelSentence: "Feel",
    drillName: "Drill",
    drillDurationSec: 60,
    targetPosition: {
      faultJointFamily: "pelvis",
      targetDelta: -8,
      bandMin: 0,
      bandMax: 6,
    },
    firstGuiltyFrameMs: 180,
    guiltyLabel: "Lost posture here",
    bestSwingTimestamp: "n/a",
    outcome: "fault",
    ...overrides,
  };
}

describe("confidence gate", () => {
  test("low confidence metric is ineligible for Show Me", () => {
    const input = baseInput({
      metric: {
        ...baseInput().metric,
        confidence: 0.2,
      },
    });
    expect(metricEligibleForReveal(input)).toBe(false);
  });

  test("insufficient_data is non-fault", () => {
    const input = baseInput({
      outcome: "insufficient_data",
      insufficientData: true,
    });
    expect(isNonFaultReveal(input)).toBe(true);
    expect(metricEligibleForReveal(input)).toBe(false);
  });

  test("dev assertion rejects low-confidence fault headline", () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    expect(() =>
      assertRevealInputConfidence(
        baseInput({
          metric: { ...baseInput().metric, confidence: 0.1 },
        }),
      ),
    ).toThrow(/below read threshold/);
    process.env.NODE_ENV = prev;
  });
});
