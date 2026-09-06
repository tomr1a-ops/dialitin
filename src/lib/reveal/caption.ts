import { SLO_MO_TIMING_REASON } from "@/lib/engine/slo-mo-export";
import type { SwingPhases } from "@/lib/engine/phases";
import type { PoseFrame } from "@/lib/pose/types";

export const GUILTY_TIMING_CONFIDENCE_THRESHOLD = 0.5;
export const GUILTY_TIME_BEFORE_STRIKE_MAX_MS = 1000;
export const LOST_POSTURE_CAPTION = "Lost posture here.";

export function isGuiltyFrameTimingInvalid(phases: SwingPhases): boolean {
  if (phases.sloMoReexportedAt30.value) {
    return true;
  }
  if (!phases.impact.valid || phases.impact.confidence < GUILTY_TIMING_CONFIDENCE_THRESHOLD) {
    return true;
  }
  if (phases.impact.reason === SLO_MO_TIMING_REASON) {
    return true;
  }
  return false;
}

export function guiltyTimingReliabilityNote(phases: SwingPhases): string | null {
  if (!isGuiltyFrameTimingInvalid(phases)) {
    return null;
  }
  if (phases.sloMoReexportedAt30.value) {
    return SLO_MO_TIMING_REASON;
  }
  return "Could not read reliably";
}

/** Ms from guilty frame to strike (impact); 0 when impact is missing. */
export function firstGuiltyMsBeforeStrike(
  phases: SwingPhases,
  keypoints: PoseFrame[],
  guiltyFrameIndex: number | null | undefined,
): number {
  if (!phases.impact.valid || guiltyFrameIndex == null || guiltyFrameIndex < 0) {
    return 0;
  }
  const guiltyFrame = keypoints[guiltyFrameIndex];
  if (!guiltyFrame) {
    return 0;
  }
  return Math.max(0, phases.impact.timeMs - guiltyFrame.mediaTime * 1000);
}

export type GuiltyFrameCaptionInput = {
  guiltyLabel: string;
  msBeforeStrike: number;
  timingInvalid: boolean;
};

export function formatGuiltyFrameCaption(input: GuiltyFrameCaptionInput): string {
  if (input.timingInvalid) {
    return LOST_POSTURE_CAPTION;
  }
  if (input.msBeforeStrike > 0 && input.msBeforeStrike < GUILTY_TIME_BEFORE_STRIKE_MAX_MS) {
    const seconds = (input.msBeforeStrike / 1000).toFixed(2);
    return `${input.guiltyLabel}. ${seconds}s before the strike.`;
  }
  return `${input.guiltyLabel}.`;
}

export function guiltyTimeSecFromStrike(
  phases: SwingPhases,
  msBeforeStrike: number,
): number | null {
  if (!phases.impact.valid) {
    return null;
  }
  return phases.impact.timeMs / 1000 - msBeforeStrike / 1000;
}
