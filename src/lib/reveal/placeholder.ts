import type { RevealInput } from "@/lib/reveal/types";

/** Placeholder RevealInput for Phase 2b — real data swap in Phase 2. */
export function createPlaceholderRevealInput(
  overrides: Partial<RevealInput> = {},
): RevealInput {
  return {
    fault: "early_extension",
    metric: {
      key: "tush_line_pelvis",
      label: "Pelvis vs. tush line",
      value: 14,
      unit: "pct_stance",
      confidence: 0.82,
      reason: "Trail hip visible at address and impact",
      bandMin: 0,
      bandMax: 6,
    },
    feelSentence: "Your belt buckle got to the ball before your hands.",
    drillName: "Stick behind the hips",
    drillDurationSec: 60,
    targetPosition: {
      faultJointFamily: "pelvis",
      targetDelta: -8,
      bandMin: 0,
      bandMax: 6,
    },
    firstGuiltyFrameMs: 180,
    guiltyLabel: "Lost posture here",
    bestSwingTimestamp: "11:04",
    whatChangedSince: {
      baselineDate: "Sept 4",
      headline:
        "Your pelvis is 14% past the tush line again. On Sept 4 it held the line.",
      sameCamera: true,
      sameClub: true,
    },
    ...overrides,
  };
}
