import type { PoseFrame } from "@/lib/pose/types";

/**
 * Sec 6.4 — computer vision measures every metric as a record.
 * Observation is a metric. Interpretation is a pattern candidate.
 * Diagnosis is a fault only after intent / symptom / other measurements agree.
 */
export type MetricObservation = {
  key: string;
  value: number | null;
  confidence: number;
  valid: boolean;
  reason: string | null;
};

export type Interpretation = {
  pattern: string;
  fromObservations: string[];
};

export type Diagnosis = {
  headline_fault: string;
  severity: number;
  confidence: number;
  priority_rank: number;
  delta: number | null;
  observations: MetricObservation[];
  interpretations: Interpretation[];
};

export function diagnose(
  keypoints: PoseFrame[],
  contentVersionId: string,
): Diagnosis | null {
  void keypoints;
  void contentVersionId;
  return null;
}
