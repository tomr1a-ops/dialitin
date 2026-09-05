import { SLO_MO_TIMING_REASON } from "@/lib/engine/slo-mo-export";
import type { SwingPhases } from "@/lib/engine/phases";
import type { MetricRecord } from "@/lib/engine/metrics/faceOn";

export { SLO_MO_TIMING_REASON };

export const FACE_ON_TIMING_METRIC_KEYS = [
  "tempo_ratio",
  "sequence_proxy",
  "lead_elbow_separation",
] as const;

export type FaceOnTimingMetricKey = (typeof FACE_ON_TIMING_METRIC_KEYS)[number];

export function isSloMoReexport(phases: SwingPhases): boolean {
  return phases.sloMoReexportedAt30.value === true;
}

export function gateTimingMetric(metric: MetricRecord): MetricRecord {
  return {
    ...metric,
    valid: false,
    confidence: 0,
    reason: SLO_MO_TIMING_REASON,
  };
}

export function applySloMoTimingGate<T extends Record<string, MetricRecord>>(
  metrics: T,
  phases: SwingPhases,
  keys: readonly string[],
): T {
  if (!isSloMoReexport(phases)) {
    return metrics;
  }
  const next = { ...metrics } as Record<string, MetricRecord>;
  for (const key of keys) {
    const metric = next[key];
    if (metric) {
      next[key] = gateTimingMetric(metric);
    }
  }
  return next as T;
}
