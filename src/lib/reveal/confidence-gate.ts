import { METRIC_READ_CONFIDENCE_THRESHOLD } from "@/lib/engine/evaluate";
import type { DiagnosisOutcome } from "@/lib/engine/diagnose";
import type { RevealInput } from "@/lib/reveal/types";

const NON_FAULT_OUTCOMES = new Set<DiagnosisOutcome>([
  "insufficient_data",
  "dont_fix_it",
  "refuse",
]);

export function isNonFaultReveal(input: RevealInput): boolean {
  return (
    input.insufficientData === true ||
    (input.outcome != null && NON_FAULT_OUTCOMES.has(input.outcome))
  );
}

export function metricEligibleForReveal(input: RevealInput): boolean {
  if (isNonFaultReveal(input)) {
    return false;
  }
  return (
    input.metric.confidence >= METRIC_READ_CONFIDENCE_THRESHOLD &&
    input.metric.value > 0
  );
}

/** Dev/test guard: low-confidence metrics must not headline Show Me cards. */
export function assertRevealInputConfidence(input: RevealInput): void {
  if (process.env.NODE_ENV === "production") {
    return;
  }
  if (isNonFaultReveal(input)) {
    return;
  }
  if (input.metric.confidence < METRIC_READ_CONFIDENCE_THRESHOLD) {
    throw new Error(
      `Reveal dev assertion: metric confidence ${input.metric.confidence} below read threshold`,
    );
  }
}
