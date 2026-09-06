import type { RevealInput } from "@/lib/reveal/types";

/** Empty shell while pose/diagnosis runs. Never shown as a fault headline. */
export function createLoadingRevealInput(): RevealInput {
  return {
    fault: "early_extension",
    metric: {
      key: "tush_line_pelvis",
      label: "",
      value: 0,
      unit: "pct_stance",
      confidence: 0,
      reason: "",
      bandMin: 0,
      bandMax: 0,
    },
    feelSentence: "",
    drillName: "",
    drillDurationSec: 60,
    targetPosition: {
      faultJointFamily: "pelvis",
      targetDelta: 0,
      bandMin: 0,
      bandMax: 0,
    },
    firstGuiltyFrameMs: 0,
    guiltyLabel: "",
    bestSwingTimestamp: "n/a",
    outcome: undefined,
  };
}
