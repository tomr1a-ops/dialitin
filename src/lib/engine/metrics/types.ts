import type { FaceOnMetrics } from "@/lib/engine/metrics/faceOn";
import type { DtlMetrics } from "@/lib/engine/metrics/dtl";

/** Sec 6.1 — every stored metric is a record, never a bare number. */
export type MetricRecord = {
  value: number;
  unit: string;
  confidence: number;
  valid: boolean;
  reason: string | null;
};

/** Stored in test_swing_keypoints.metrics jsonb. */
export type StoredSwingMetrics = {
  face_on: FaceOnMetrics | null;
  dtl: DtlMetrics | null;
};

export type EarlyExtensionFamily = "clean" | "thrust" | "stand_up" | "both";

export function familyFromValue(value: number): EarlyExtensionFamily {
  if (value === 1) {
    return "thrust";
  }
  if (value === 2) {
    return "stand_up";
  }
  if (value === 3) {
    return "both";
  }
  return "clean";
}
