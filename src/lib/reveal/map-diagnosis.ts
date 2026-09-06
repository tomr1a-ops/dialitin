import type { CoachOutput } from "@/lib/coach/schema";
import type { DiagnosisResult } from "@/lib/engine/diagnose";
import type { ProtocolEntry, VoiceEntry } from "@/lib/engine/content";
import type {
  RevealFaultKey,
  RevealInput,
  RevealJointFamily,
  WhatChangedSinceDisplay,
} from "@/lib/reveal/types";

const FAULT_KEY_MAP: Partial<Record<string, RevealFaultKey>> = {
  early_extension: "early_extension",
  hip_slide_down: "hip_slide_down",
};

const JOINT_FAMILY: Partial<Record<string, RevealJointFamily>> = {
  early_extension: "pelvis",
  hip_slide_down: "pelvis",
  over_the_top: "hands",
  head_sway: "head",
};

function primaryMetric(diagnosis: DiagnosisResult): DiagnosisResult["evidence"][0] | null {
  return diagnosis.evidence[0] ?? null;
}

export function diagnosisToRevealInput(input: {
  diagnosis: DiagnosisResult;
  coach?: CoachOutput | null;
  voice?: VoiceEntry | null;
  protocol?: ProtocolEntry | null;
  angle: "dtl" | "face_on";
  whatChangedSince?: WhatChangedSinceDisplay;
  firstGuiltyFrameMs?: number;
}): RevealInput {
  const { diagnosis, coach, voice, protocol, angle } = input;
  const metricEv = primaryMetric(diagnosis);
  const faultKey =
    (diagnosis.fault_key && FAULT_KEY_MAP[diagnosis.fault_key]) ||
    (angle === "face_on" ? "hip_slide_down" : "early_extension");

  const value = metricEv?.value ?? 0;
  const bandMin = metricEv?.band?.low ?? 0;
  const bandMax = metricEv?.band?.high ?? 6;

  const feelSentence =
    coach?.feel_cue ||
    voice?.feel_cue ||
    coach?.why ||
    diagnosis.headline_fault ||
    "Keep working on the fix.";

  const drillName =
    coach?.drill.name || protocol?.name || "Practice drill";

  const targetDelta =
    diagnosis.delta_pct_stance ??
    (metricEv && metricEv.band?.high != null && metricEv.value != null
      ? Math.min(0, (metricEv.band.high ?? 0) - metricEv.value)
      : -8);

  return {
    fault: faultKey,
    metric: {
      key:
        metricEv?.metric === "hip_slide_down" ||
        metricEv?.metric === "tush_line_pelvis"
          ? (metricEv.metric as RevealInput["metric"]["key"])
          : faultKey === "hip_slide_down"
            ? "hip_slide_down"
            : "tush_line_pelvis",
      label:
        faultKey === "hip_slide_down"
          ? "Hip slide toward target"
          : "Pelvis vs. tush line",
      value: Math.abs(value),
      unit: "pct_stance",
      confidence: metricEv?.confidence ?? 0.5,
      reason: diagnosis.reasons[0] ?? "Measured from pose",
      bandMin: bandMin ?? 0,
      bandMax: bandMax ?? 6,
    },
    feelSentence,
    drillName,
    drillDurationSec: 60,
    targetPosition: {
      faultJointFamily: JOINT_FAMILY[diagnosis.fault_key ?? ""] ?? "pelvis",
      targetDelta,
      bandMin: bandMin ?? 0,
      bandMax: bandMax ?? 6,
    },
    firstGuiltyFrameMs: input.firstGuiltyFrameMs ?? 180,
    guiltyLabel:
      diagnosis.outcome === "fault"
        ? "Fault onset here"
        : diagnosis.outcome === "dont_fix_it"
          ? "Functional range"
          : "Could not read reliably",
    bestSwingTimestamp: "n/a",
    whatChangedSince: input.whatChangedSince,
    insufficientData: diagnosis.outcome === "insufficient_data",
    outcome: diagnosis.outcome,
    headline: coach?.headline ?? diagnosis.headline_fault ?? "",
    coachWhy: coach?.why,
    gripAndFaceLine: coach?.grip_and_face_line,
    retestDeltaPct: diagnosis.delta_pct_stance,
  };
}

export function insufficientRevealInput(
  diagnosis: DiagnosisResult,
): RevealInput {
  return diagnosisToRevealInput({
    diagnosis,
    angle: "face_on",
    coach: {
      headline: diagnosis.headline_fault ?? "Not enough signed data yet",
      why: diagnosis.headline_fault ?? "",
      feel_cue: "",
      drill: {
        name: "",
        protocol_seconds: 60,
        reps_slow: 0,
        reps_rehearsal: 0,
        reps_live: 0,
        constraint: "",
      },
    },
  });
}
