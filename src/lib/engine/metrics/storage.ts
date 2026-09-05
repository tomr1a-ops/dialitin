import type { StoredAngle } from "@/lib/engine/angle";
import { computeFaceOnMetrics, faceOnMetricsFromUnknown } from "@/lib/engine/metrics/faceOn";
import {
  computeDtlMetrics,
  dtlMetricsFromUnknown,
} from "@/lib/engine/metrics/dtl";
import type { StoredSwingMetrics } from "@/lib/engine/metrics/types";
import type { SwingPhases } from "@/lib/engine/phases";
import type { ClubFamily, Handedness, ShotIntent } from "@/lib/admin/test-swings";
import type { PoseFrame } from "@/lib/pose/types";

export type { StoredSwingMetrics } from "@/lib/engine/metrics/types";

export type ComputeSwingMetricsInput = {
  frames: PoseFrame[];
  normalizedFrames: PoseFrame[] | null;
  phases: SwingPhases;
  angle: StoredAngle | null;
  handedness: Handedness;
  clubFamily?: ClubFamily | null;
  intent?: ShotIntent | null;
  capturePath?: "in_app" | "native_slomo" | "upload" | "in-app" | null;
  audioTransientMs?: number | null;
};

export function computeSwingMetrics(
  input: ComputeSwingMetricsInput,
): StoredSwingMetrics {
  return {
    face_on: computeFaceOnMetrics(input),
    dtl: computeDtlMetrics(input),
  };
}

/** Accept bundled `{ face_on, dtl }` or legacy flat face-on object. */
export function swingMetricsFromUnknown(value: unknown): StoredSwingMetrics | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  if ("face_on" in record || "dtl" in record) {
    const faceOn = faceOnMetricsFromUnknown(record.face_on);
    const dtl = dtlMetricsFromUnknown(record.dtl);
    if (!faceOn && !dtl) {
      return null;
    }
    return { face_on: faceOn, dtl };
  }
  const legacyFaceOn = faceOnMetricsFromUnknown(value);
  if (legacyFaceOn) {
    return { face_on: legacyFaceOn, dtl: null };
  }
  return null;
}

export function activeMetricSet(
  metrics: StoredSwingMetrics | null,
  classification: "face_on" | "dtl" | "refuse" | null | undefined,
): "face_on" | "dtl" | null {
  if (!metrics || !classification || classification === "refuse") {
    return null;
  }
  if (classification === "face_on" && metrics.face_on) {
    return "face_on";
  }
  if (classification === "dtl" && metrics.dtl) {
    return "dtl";
  }
  return classification;
}
