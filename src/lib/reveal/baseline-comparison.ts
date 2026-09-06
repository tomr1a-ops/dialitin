import type { MetricEvaluation } from "@/lib/engine/evaluate";
import {
  diffAgainstBaseline,
  type BaselineSnapshot,
} from "@/lib/engine/what-changed-since";
import type { WhatChangedSinceDisplay } from "@/lib/reveal/types";

export function whatChangedSinceDisplay(input: {
  evaluations: Record<string, MetricEvaluation>;
  baseline: BaselineSnapshot | null;
  angle: string;
  clubFamily: string;
  intent: string;
  diagnosisOrder?: string[];
}): WhatChangedSinceDisplay | undefined {
  if (!input.baseline) {
    return undefined;
  }

  const diff = diffAgainstBaseline({
    todayEvaluations: input.evaluations,
    baseline: input.baseline,
    todayAngle: input.angle,
    todayClub: input.clubFamily,
    todayIntent: input.intent,
    diagnosisOrder: input.diagnosisOrder,
  });

  if (!diff.canCompare && !diff.headline && !diff.guardMessage) {
    return undefined;
  }

  return {
    baselineDate: formatBaselineDate(input.baseline.savedAt),
    headline: diff.headline,
    guardMessage: diff.guardMessage,
    sameCamera: diff.sameCamera,
    sameClub: diff.sameClub,
  };
}

function formatBaselineDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function baselineSnapshotFromSwingMetrics(input: {
  evaluations: Record<string, MetricEvaluation>;
  clubFamily: string;
  angle: string;
  intent: string;
  savedAt: string;
}): BaselineSnapshot {
  const metrics: Record<string, number> = {};
  for (const [key, ev] of Object.entries(input.evaluations)) {
    if (ev.value != null && ev.status !== "not-read") {
      metrics[key] = ev.value;
    }
  }
  return {
    savedAt: input.savedAt,
    clubFamily: input.clubFamily,
    angle: input.angle,
    intent: input.intent,
    metrics,
  };
}
