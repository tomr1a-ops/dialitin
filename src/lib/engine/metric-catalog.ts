import type { DtlMetricKey } from "@/lib/engine/metrics/dtl";
import type { FaceOnMetricKey } from "@/lib/engine/metrics/faceOn";

/** Catalog keys in public.metrics — engine keys differ in a few places. */
export const ENGINE_TO_CATALOG_KEY: Record<string, string> = {
  spine_tilt_address: "spine_tilt_at_address",
  tush_line_pelvis: "pelvis_vs_tush_line",
  tush_line_family: "pelvis_vs_tush_line",
  lead_hip_clearance_impact: "lead_hip_depth_at_impact",
  spine_tilt_change: "spine_tilt_change",
  head_lift_dtl: "head_lift",
  delivery_slot: "downswing_hand_path",
  shoulder_rotation_top: "shoulder_rotation_at_top",
  hip_rotation_top: "hip_rotation_at_top",
  hip_sway_back: "hip_lateral_movement",
  hip_slide_down: "hip_lateral_movement",
  head_sway: "head_sway",
  head_lift: "head_lift",
  trail_knee_flexion_change: "trail_knee_flexion_change",
  weight_transfer_proxy: "weight_transfer_proxy",
  width_at_top: "width_at_top",
  lead_elbow_separation: "lead_elbow_separation",
  sequence_proxy: "sequence_proxy",
  tempo_ratio: "tempo_ratio",
  ball_position_inferred: "ball_position_vs_lead_heel",
};

export type EngineMetricKey = FaceOnMetricKey | DtlMetricKey;

export function catalogKeyForEngineKey(engineKey: string): string {
  return ENGINE_TO_CATALOG_KEY[engineKey] ?? engineKey;
}

export type MetricAngle = "dtl" | "face_on" | "either";

export function angleMatchesMetric(
  metricAngle: MetricAngle,
  swingAngle: "dtl" | "face_on",
): boolean {
  return metricAngle === "either" || metricAngle === swingAngle;
}
