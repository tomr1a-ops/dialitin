import type { CoachOutput } from "@/lib/coach/schema";
import type { DiagnosisResult } from "@/lib/engine/diagnose";
import { METRIC_READ_CONFIDENCE_THRESHOLD } from "@/lib/engine/evaluate";
import type { ProtocolEntry, VoiceEntry } from "@/lib/engine/content";
import type { SwingPhases } from "@/lib/engine/phases";
import type { PoseFrame } from "@/lib/pose/types";
import { firstGuiltyMsBeforeStrike } from "@/lib/reveal/caption";
import { isNonFaultReveal } from "@/lib/reveal/confidence-gate";
import { formatEngineReasonForDisplay } from "@/lib/reveal/reason-display";
import { strikeCorroborationCopy } from "@/lib/engine/strike";
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

function primaryMetric(
  diagnosis: DiagnosisResult,
): DiagnosisResult["evidence"][0] | null {
  return diagnosis.evidence[0] ?? null;
}

function metricReadable(
  metricEv: DiagnosisResult["evidence"][0] | null,
): boolean {
  return (
    metricEv != null &&
    metricEv.confidence >= METRIC_READ_CONFIDENCE_THRESHOLD &&
    metricEv.value != null
  );
}

export function diagnosisToRevealInput(input: {
  diagnosis: DiagnosisResult;
  coach?: CoachOutput | null;
  voice?: VoiceEntry | null;
  protocol?: ProtocolEntry | null;
  angle: "dtl" | "face_on";
  whatChangedSince?: WhatChangedSinceDisplay;
  firstGuiltyFrameMs?: number;
  phases?: SwingPhases | null;
  keypoints?: PoseFrame[];
  ballCentroid?: { x: number; y: number } | null;
  strike?: import("@/lib/engine/strike").StrikeAnalysis | null;
}): RevealInput {
  const { diagnosis, coach, voice, protocol, angle } = input;
  const metricEv = primaryMetric(diagnosis);
  const readable = metricReadable(metricEv);
  const faultKey =
    (diagnosis.fault_key && FAULT_KEY_MAP[diagnosis.fault_key]) ||
    (angle === "face_on" ? "hip_slide_down" : "early_extension");

  const value = readable ? (metricEv?.value ?? 0) : 0;
  const bandMin = metricEv?.band?.low ?? 0;
  const bandMax = metricEv?.band?.high ?? 6;

  const feelSentence =
    coach?.feel_cue ||
    voice?.feel_cue ||
    coach?.why ||
    voice?.explanation ||
    diagnosis.headline_fault ||
    "";

  const drillName =
    coach?.drill.name || protocol?.name || voice?.feel_cue || "Practice drill";

  const targetDelta =
    diagnosis.delta_pct_stance ??
    (metricEv && metricEv.band?.high != null && metricEv.value != null
      ? Math.min(0, (metricEv.band.high ?? 0) - metricEv.value)
      : -8);

  const rawReason = diagnosis.reasons[0] ?? "Measured from pose";
  const displayReason = formatEngineReasonForDisplay(rawReason);

  const revealInput: RevealInput = {
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
      confidence: readable ? (metricEv?.confidence ?? 0) : 0,
      reason: displayReason || "Measured from pose",
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
    guiltyLabel:
      diagnosis.outcome === "fault"
        ? "Lost posture here"
        : diagnosis.outcome === "dont_fix_it"
          ? "Functional range"
          : "Could not read reliably",
    bestSwingTimestamp: "n/a",
    whatChangedSince: input.whatChangedSince,
    insufficientData:
      diagnosis.outcome === "insufficient_data" ||
      diagnosis.outcome === "refuse",
    outcome: diagnosis.outcome,
    headline:
      coach?.headline ??
      (voice?.explanation.split(".")[0]?.trim() || voice?.explanation) ??
      diagnosis.headline_fault ??
      "",
    coachWhy: coach?.why ?? voice?.explanation ?? diagnosis.headline_fault ?? "",
    gripAndFaceLine: coach?.grip_and_face_line,
    retestDeltaPct: diagnosis.delta_pct_stance,
    firstGuiltyFrameMs:
      input.firstGuiltyFrameMs ??
      (input.phases && input.keypoints
        ? firstGuiltyMsBeforeStrike(
            input.phases,
            input.keypoints,
            diagnosis.first_guilty_frame,
          )
        : 0),
    ballCentroid: input.ballCentroid ?? null,
    strikeCorroboration: input.strike
      ? strikeCorroborationCopy(input.strike.strike_quality)
      : null,
  };

  return revealInput;
}

export function insufficientRevealInput(
  diagnosis: DiagnosisResult,
): RevealInput {
  return diagnosisToRevealInput({
    diagnosis,
    angle: "face_on",
    coach: {
      headline: diagnosis.headline_fault ?? "Not enough signal",
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

export { isNonFaultReveal };
