import { describe, expect, test } from "vitest";
import {
  gateTimingMetric,
  isSloMoReexport,
  SLO_MO_TIMING_REASON,
} from "@/lib/engine/metrics/timing-gate";
import { tempoRatio } from "@/lib/engine/metrics/faceOn";
import type { SwingPhases } from "@/lib/engine/phases";

function phases(sloMo: boolean): SwingPhases {
  const mark = (frameIndex: number, timeMs: number) => ({
    frameIndex,
    timeMs,
    confidence: 0.9,
    valid: true,
    reason: "test",
  });
  return {
    address: mark(0, 0),
    takeaway: mark(5, 167),
    top: mark(15, 500),
    impact: mark(20, 667),
    finish: mark(25, 833),
    impactCandidate: {
      value: "motion",
      confidence: 0.8,
      valid: true,
      reason: null,
    },
    effectiveFrameRate: {
      value: 30,
      confidence: 0.9,
      valid: true,
      reason: null,
    },
    sloMoReexportedAt30: {
      value: sloMo,
      confidence: 0.8,
      valid: true,
      reason: sloMo ? "Slo-mo clip arrived near 30 fps" : null,
    },
    trim: {
      value: { startMs: 0, endMs: 1000 },
      confidence: 0.8,
      valid: true,
      reason: null,
    },
  };
}

describe("timing gate", () => {
  test("detects slo-mo re-export flag", () => {
    expect(isSloMoReexport(phases(true))).toBe(true);
    expect(isSloMoReexport(phases(false))).toBe(false);
  });

  test("invalidates timing metrics with slo-mo reason", () => {
    const gated = gateTimingMetric({
      value: 0.73,
      unit: "ratio",
      confidence: 0.9,
      valid: true,
      reason: "takeaway→top ÷ top→impact from timestamps",
    });
    expect(gated.valid).toBe(false);
    expect(gated.reason).toBe(SLO_MO_TIMING_REASON);
  });

  test("tempo ratio invalid when slo-mo re-export", () => {
    const metric = tempoRatio(phases(true));
    expect(metric.valid).toBe(false);
    expect(metric.reason).toBe(SLO_MO_TIMING_REASON);
  });
});
