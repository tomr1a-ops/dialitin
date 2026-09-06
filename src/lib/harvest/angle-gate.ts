import type { StoredAngle } from "@/lib/engine/angle";
import {
  DTL_YAW_TOLERANCE_DEG,
  FACE_ON_YAW_TOLERANCE_DEG,
} from "@/lib/engine/angle";

export type AngleGateResult =
  | { pass: true; classification: "face_on" | "dtl" }
  | { pass: false; reason: string };

/** Keep only face_on or dtl inside refuse thresholds; rest excluded. */
export function applyAngleGate(angle: StoredAngle | null): AngleGateResult {
  if (!angle) {
    return { pass: false, reason: "no angle estimate" };
  }
  if (!angle.valid) {
    return {
      pass: false,
      reason: angle.reason ?? "angle invalid",
    };
  }
  if (!angle.classification.valid) {
    return {
      pass: false,
      reason: angle.classification.reason ?? "classification invalid",
    };
  }
  const classification = angle.classification.value;
  if (classification === "refuse") {
    const yaw = angle.yaw.valid ? angle.yaw.value : null;
    return {
      pass: false,
      reason:
        yaw != null
          ? `refused yaw ${yaw.toFixed(1)}° (dtl ±${DTL_YAW_TOLERANCE_DEG}, face-on ±${FACE_ON_YAW_TOLERANCE_DEG})`
          : "refused — outside app view bands",
    };
  }
  return { pass: true, classification };
}
