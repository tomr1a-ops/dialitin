import type { DiagnosisResult } from "@/lib/engine/diagnose";
import type { MetricEvaluation } from "@/lib/engine/evaluate";

/** Per-metric noise threshold placeholder until Phase 0b calibration. */
const DEFAULT_NOISE_THRESHOLD = 0.15;

export type BaselineSnapshot = {
  savedAt: string;
  clubFamily: string;
  angle: string;
  intent: string;
  metrics: Record<string, number>;
  cameraYaw?: number | null;
};

export type WhatChangedResult = {
  headline: string;
  guardMessage?: string;
  sameCamera: boolean;
  sameClub: boolean;
  canCompare: boolean;
};

export function diffAgainstBaseline(input: {
  todayEvaluations: Record<string, MetricEvaluation>;
  baseline: BaselineSnapshot;
  todayAngle: string;
  todayClub: string;
  todayIntent: string;
  todayCameraYaw?: number | null;
  diagnosisOrder?: string[];
}): WhatChangedResult {
  const {
    todayEvaluations,
    baseline,
    todayAngle,
    todayClub,
    todayIntent,
    todayCameraYaw,
  } = input;

  if (todayClub !== baseline.clubFamily || todayIntent !== baseline.intent) {
    return {
      headline: "",
      guardMessage: "Compare using the same club and intent as your saved good swing.",
      sameCamera: true,
      sameClub: false,
      canCompare: false,
    };
  }

  if (todayAngle !== baseline.angle) {
    return {
      headline: "",
      guardMessage: "Film from the same camera angle as your saved good swing.",
      sameCamera: false,
      sameClub: true,
      canCompare: false,
    };
  }

  if (
    baseline.cameraYaw != null &&
    todayCameraYaw != null &&
    Math.abs(baseline.cameraYaw - todayCameraYaw) > 8
  ) {
    return {
      headline: "",
      guardMessage: `Film from the same spot as ${formatBaselineDate(baseline.savedAt)} to compare.`,
      sameCamera: false,
      sameClub: true,
      canCompare: false,
    };
  }

  const order =
    input.diagnosisOrder ??
    Object.keys(baseline.metrics).filter((k) => todayEvaluations[k]);

  let largestKey: string | null = null;
  let largestDelta = 0;

  for (const key of order) {
    const today = todayEvaluations[key];
    const baseVal = baseline.metrics[key];
    if (!today || today.value == null || baseVal == null) {
      continue;
    }
    if (today.status === "not-read") {
      continue;
    }
    const delta = Math.abs(today.value - baseVal);
    const noise = DEFAULT_NOISE_THRESHOLD * Math.max(Math.abs(baseVal), 1);
    if (delta > noise && delta > largestDelta) {
      largestDelta = delta;
      largestKey = key;
    }
  }

  if (!largestKey) {
    return {
      headline: `Your body is doing what it did on ${formatBaselineDate(baseline.savedAt)}. The difference may be the face, the strike, or the day.`,
      sameCamera: true,
      sameClub: true,
      canCompare: true,
    };
  }

  const todayVal = todayEvaluations[largestKey]?.value ?? 0;
  const baseVal = baseline.metrics[largestKey] ?? 0;

  return {
    headline: `${metricLabel(largestKey)} moved from ${baseVal.toFixed(0)}% to ${todayVal.toFixed(0)}% since ${formatBaselineDate(baseline.savedAt)}. Everything else is where it was.`,
    sameCamera: true,
    sameClub: true,
    canCompare: true,
  };
}

function formatBaselineDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function metricLabel(key: string): string {
  const labels: Record<string, string> = {
    hip_slide_down: "Hip slide",
    tush_line_pelvis: "Pelvis vs tush line",
    head_sway: "Head sway",
    delivery_slot: "Hand path",
  };
  return labels[key] ?? key.replace(/_/g, " ");
}

export function baselineFromDiagnosis(input: {
  diagnosis: DiagnosisResult;
  evaluations: Record<string, MetricEvaluation>;
  clubFamily: string;
  angle: string;
  intent: string;
  cameraYaw?: number | null;
}): BaselineSnapshot {
  const metrics: Record<string, number> = {};
  for (const [key, ev] of Object.entries(input.evaluations)) {
    if (ev.value != null && ev.status !== "not-read") {
      metrics[key] = ev.value;
    }
  }
  return {
    savedAt: new Date().toISOString(),
    clubFamily: input.clubFamily,
    angle: input.angle,
    intent: input.intent,
    metrics,
    cameraYaw: input.cameraYaw,
  };
}
