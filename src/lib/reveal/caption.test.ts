import { describe, expect, test } from "vitest";
import {
  formatGuiltyFrameCaption,
  firstGuiltyMsBeforeStrike,
  guiltyTimeSecFromStrike,
  isGuiltyFrameTimingInvalid,
} from "@/lib/reveal/caption";
import type { SwingPhases } from "@/lib/engine/phases";
import { SLO_MO_TIMING_REASON } from "@/lib/engine/slo-mo-export";
import type { PoseFrame } from "@/lib/pose/types";

function basePhases(overrides: Partial<SwingPhases> = {}): SwingPhases {
  return {
    address: {
      frameIndex: 0,
      timeMs: 0,
      confidence: 0.9,
      valid: true,
      reason: null,
    },
    takeaway: {
      frameIndex: 5,
      timeMs: 100,
      confidence: 0.9,
      valid: true,
      reason: null,
    },
    top: {
      frameIndex: 10,
      timeMs: 400,
      confidence: 0.9,
      valid: true,
      reason: null,
    },
    impact: {
      frameIndex: 20,
      timeMs: 800,
      confidence: 0.9,
      valid: true,
      reason: null,
    },
    finish: {
      frameIndex: 25,
      timeMs: 1000,
      confidence: 0.9,
      valid: true,
      reason: null,
    },
    impactCandidate: {
      valid: true,
      value: "fused",
      confidence: 0.8,
      reason: null,
    },
    effectiveFrameRate: {
      valid: true,
      value: 120,
      confidence: 0.9,
      reason: null,
    },
    sloMoReexportedAt30: {
      valid: true,
      value: false,
      confidence: 0.9,
      reason: null,
    },
    trim: {
      valid: true,
      value: { startMs: 0, endMs: 1200 },
      confidence: 0.9,
      reason: null,
    },
    ...overrides,
  };
}

describe("formatGuiltyFrameCaption", () => {
  test("invalid timing uses guilty label without strike time", () => {
    expect(
      formatGuiltyFrameCaption({
        guiltyLabel: "Could not read reliably",
        msBeforeStrike: 180,
        timingInvalid: true,
      }),
    ).toBe("Could not read reliably.");
  });

  test("valid timing under 1s includes strike-relative time", () => {
    expect(
      formatGuiltyFrameCaption({
        guiltyLabel: "Lost posture here",
        msBeforeStrike: 180,
        timingInvalid: false,
      }),
    ).toBe("Lost posture here. 0.18s before the strike.");
  });

  test("valid timing at or above 1s omits time", () => {
    expect(
      formatGuiltyFrameCaption({
        guiltyLabel: "Lost posture here",
        msBeforeStrike: 1200,
        timingInvalid: false,
      }),
    ).toBe("Lost posture here.");
  });
});

describe("firstGuiltyMsBeforeStrike", () => {
  test("measures from impact not clip start", () => {
    const phases = basePhases();
    const keypoints: PoseFrame[] = Array.from({ length: 21 }, (_, index) => ({
      mediaTime: index * 0.04,
      landmarks: [],
      crop: { x: 0, y: 0, width: 1, height: 1 },
    }));
    expect(firstGuiltyMsBeforeStrike(phases, keypoints, 10)).toBe(400);
  });
});

describe("guiltyTimeSecFromStrike", () => {
  test("converts ms-before-strike to absolute video time", () => {
    const phases = basePhases();
    expect(guiltyTimeSecFromStrike(phases, 200)).toBeCloseTo(0.6);
  });
});

describe("isGuiltyFrameTimingInvalid", () => {
  test("flags slo-mo re-export", () => {
    const phases = basePhases({
      sloMoReexportedAt30: {
        valid: true,
        value: true,
        confidence: 0.8,
        reason: "Slo-mo clip arrived near 30 fps",
      },
    });
    expect(isGuiltyFrameTimingInvalid(phases)).toBe(true);
  });

  test("flags low impact confidence", () => {
    const phases = basePhases({
      impact: {
        frameIndex: 20,
        timeMs: 800,
        confidence: 0.4,
        valid: true,
        reason: null,
      },
    });
    expect(isGuiltyFrameTimingInvalid(phases)).toBe(true);
  });

  test("flags slo-mo timing reason on impact", () => {
    const phases = basePhases({
      impact: {
        frameIndex: 20,
        timeMs: 800,
        confidence: 0.9,
        valid: true,
        reason: SLO_MO_TIMING_REASON,
      },
    });
    expect(isGuiltyFrameTimingInvalid(phases)).toBe(true);
  });
});
