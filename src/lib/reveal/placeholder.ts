import type { RevealInput } from "@/lib/reveal/types";

const DTL_PLACEHOLDER: RevealInput = {
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
};

const FACE_ON_PLACEHOLDER: RevealInput = {
  fault: "hip_slide_down",
  metric: {
    key: "hip_slide_down",
    label: "Hip slide toward target",
    value: 12,
    unit: "pct_stance",
    confidence: 0.79,
    reason: "Hip center vs address reference at impact",
    bandMin: 0,
    bandMax: 5,
  },
  feelSentence: "Your hips slid toward the target before your hands caught up.",
  drillName: "Hip bump without slide",
  drillDurationSec: 60,
  targetPosition: {
    faultJointFamily: "pelvis",
    targetDelta: -6,
    bandMin: 0,
    bandMax: 5,
  },
  firstGuiltyFrameMs: 200,
  guiltyLabel: "Hips slid toward target",
  bestSwingTimestamp: "11:04",
  whatChangedSince: {
    baselineDate: "Sept 4",
    headline:
      "Your hips slid 12% toward target again. On Sept 4 they stayed on the address line.",
    sameCamera: true,
    sameClub: true,
  },
};

function assertFaultMatchesAngle(
  angle: "dtl" | "face_on",
  input: RevealInput,
): void {
  if (process.env.NODE_ENV !== "development") {
    return;
  }
  if (angle === "face_on" && input.fault === "early_extension") {
    throw new Error(
      "Reveal dev assertion: DTL fault (early_extension) on face-on clip",
    );
  }
  if (angle === "dtl" && input.fault === "hip_slide_down") {
    throw new Error(
      "Reveal dev assertion: face-on fault (hip_slide_down) on DTL clip",
    );
  }
}

/** Admin demo placeholder only. Do not import from golfer-facing routes. */
export function createPlaceholderRevealInput(
  angle: "dtl" | "face_on" = "dtl",
  overrides: Partial<RevealInput> = {},
): RevealInput {
  const base = angle === "face_on" ? FACE_ON_PLACEHOLDER : DTL_PLACEHOLDER;
  const input: RevealInput = { ...base, ...overrides };
  assertFaultMatchesAngle(angle, input);
  return input;
}
