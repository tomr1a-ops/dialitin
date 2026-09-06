import { SLO_MO_TIMING_REASON } from "@/lib/engine/slo-mo-export";

/** Golfer-facing copy for internal engine reason strings. No dashes. */
const ENGINE_REASON_DISPLAY: Record<string, string> = {
  [SLO_MO_TIMING_REASON]: "Slow-motion clip. Timing not measured.",
  "Could not read reliably": "Could not read reliably.",
  "invalid metric": "Could not read this measurement.",
  "no metric cleared confidence gate": "Not enough reliable signal in this clip.",
  "no fault candidate cleared severity bar": "Not enough reliable signal in this clip.",
  "all readable metrics in functional range":
    "Your swing looks functional. We don't see a body-movement problem strong enough to recommend changing.",
};

const DASH_PATTERN = /\s*[—–-]\s*/g;

/** Maps engine reason strings to golfer-facing copy without dashes. */
export function formatEngineReasonForDisplay(
  reason: string | null | undefined,
): string {
  if (!reason) {
    return "";
  }
  const trimmed = reason.trim();
  if (ENGINE_REASON_DISPLAY[trimmed]) {
    return ENGINE_REASON_DISPLAY[trimmed];
  }
  if (DASH_PATTERN.test(trimmed)) {
    return trimmed
      .replace(DASH_PATTERN, ". ")
      .replace(/\.\s+\./g, ".")
      .replace(/\s+/g, " ")
      .trim();
  }
  return trimmed;
}

export function assertNoDashInGolferReason(text: string): void {
  if (/[—–]/.test(text) || /\s-\s/.test(text)) {
    throw new Error(`Golfer reason contains dash: ${text}`);
  }
}
