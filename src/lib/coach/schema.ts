import type { DiagnosisResult } from "@/lib/engine/diagnose";
import type { ProtocolEntry, VoiceEntry } from "@/lib/engine/content";

export type CoachOutput = {
  headline: string;
  why: string;
  feel_cue: string;
  drill: {
    name: string;
    protocol_seconds: 60;
    reps_slow: number;
    reps_rehearsal: number;
    reps_live: number;
    constraint: string;
  };
  grip_and_face_line?: string;
};

export const FORBIDDEN_COACH_TOKENS = [
  /°/,
  /\binches?\b/i,
  /\bmph\b/i,
  /\bclubface\b/i,
  /\bwrist angle\b/i,
  /\bdegrees?\b/i,
  /—/,
  /–/,
  /;/,
  /\([^)]*\)/,
] as const;

export const COACH_STYLE_RULES = [
  "Write short sentences. One idea per sentence.",
  "Use periods and commas only. Never em dashes, en dashes, semicolons, or parentheses.",
  "The why paragraph is plain prose. No bullet lists.",
  "Feel cue must be external-focus. Never name a joint to move.",
] as const;

export const COACH_RETRY_INSTRUCTION =
  "Rewrite using periods and commas only. Never use dashes, semicolons, or parentheses.";

export function validateCoachOutput(text: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  for (const pattern of FORBIDDEN_COACH_TOKENS) {
    if (pattern.test(text)) {
      errors.push(`forbidden token: ${pattern.source}`);
    }
  }
  if (/\n\s*[-•*]\s/.test(text)) {
    errors.push("forbidden token: bullet list");
  }
  return { valid: errors.length === 0, errors };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseCoachJson(raw: string): CoachOutput {
  const parsed = JSON.parse(raw) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("coach output must be an object");
  }
  const drill = parsed.drill;
  if (!isRecord(drill)) {
    throw new Error("coach output missing drill");
  }
  return {
    headline: String(parsed.headline ?? ""),
    why: String(parsed.why ?? ""),
    feel_cue: String(parsed.feel_cue ?? ""),
    drill: {
      name: String(drill.name ?? ""),
      protocol_seconds: 60,
      reps_slow: Number(drill.reps_slow ?? 3),
      reps_rehearsal: Number(drill.reps_rehearsal ?? 1),
      reps_live: Number(drill.reps_live ?? 1),
      constraint: String(drill.constraint ?? ""),
    },
    grip_and_face_line: parsed.grip_and_face_line
      ? String(parsed.grip_and_face_line)
      : undefined,
  };
}

/** Pro-signed voice entries verbatim when model output fails validation. */
export function fallbackCoachOutput(
  voice: VoiceEntry,
  protocol: ProtocolEntry | null,
): CoachOutput {
  return {
    headline: voice.explanation.split(".")[0]?.trim() || voice.explanation,
    why: voice.explanation,
    feel_cue: voice.feel_cue || voice.explanation,
    drill: {
      name: protocol?.name ?? "Practice drill",
      protocol_seconds: 60,
      reps_slow: protocol?.reps_slow ?? 3,
      reps_rehearsal: protocol?.reps_rehearsal ?? 1,
      reps_live: protocol?.reps_live ?? 1,
      constraint: protocol?.constraint_text ?? "",
    },
    grip_and_face_line:
      "We measure your body, not the clubface. Grip and face control need a pro or a launch monitor.",
  };
}

export type CoachExplainInput = {
  diagnosis: DiagnosisResult;
  voice?: VoiceEntry | null;
  protocol?: ProtocolEntry | null;
  level: string;
  symptom?: string | null;
  isFirstResult?: boolean;
  retryNote?: string;
};

export function buildCoachPrompt(input: CoachExplainInput): string {
  const { diagnosis, voice, protocol, level, symptom, isFirstResult, retryNote } =
    input;
  const evidenceLines = diagnosis.evidence
    .map(
      (e) =>
        `${e.metric}: ${e.value ?? "n/a"} (deviation ${e.deviation?.toFixed(2) ?? "n/a"}, confidence ${(e.confidence * 100).toFixed(0)}%)`,
    )
    .join("\n");

  return [
    "You are DialItIn's coaching voice. WRITE ONLY from the supplied evidence and voice library.",
    "Never invent faults, drills, or measurements.",
    "Never use degrees, inches, mph, clubface, or wrist angle claims.",
    "Use body-relative units only (% of stance width, % of hip height).",
    ...COACH_STYLE_RULES,
    "Return JSON only with keys: headline, why, feel_cue, drill { name, protocol_seconds: 60, reps_slow, reps_rehearsal, reps_live, constraint }, grip_and_face_line (first result only).",
    retryNote ?? "",
    "",
    `Fault: ${diagnosis.fault_key ?? "none"}`,
    `Headline fault (engine): ${diagnosis.headline_fault ?? ""}`,
    `Level: ${level}`,
    symptom ? `Stated symptom: ${symptom}` : "",
    "",
    "Evidence:",
    evidenceLines || "(none)",
    "",
    "Signed voice (use verbatim where possible):",
    voice
      ? `feel_cue: ${voice.feel_cue}\nexplanation: ${voice.explanation}\nball_flight_cost: ${voice.ball_flight_cost}`
      : "(none)",
    "",
    "Protocol (do not invent a different drill):",
    protocol
      ? `name: ${protocol.name}\nconstraint: ${protocol.constraint_text}\nreps: ${protocol.reps_slow ?? 3} slow, ${protocol.reps_rehearsal ?? 1} rehearsal, ${protocol.reps_live ?? 1} live`
      : "(none)",
    isFirstResult
      ? "Include grip_and_face_line paragraph on this first result."
      : "Omit grip_and_face_line.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function coachOutputValidation(output: CoachOutput): {
  valid: boolean;
  errors: string[];
} {
  return validateCoachOutput(JSON.stringify(output));
}
