import { CLUB_FAMILIES, INTENTS } from "@/lib/admin/constants";
import type { SwingPhases } from "@/lib/engine/phases";
import type { StoredAngle } from "@/lib/engine/angle";
import type { StoredSwingMetrics } from "@/lib/engine/metrics/storage";
import type { OrientationSample } from "@/lib/capture/types";
import type { JointCoverage } from "@/lib/preview/coverage";
import type { PoseFrame } from "@/lib/pose/types";

export const TEST_SWING_BUCKET = "test-swings";

export const TEST_SWING_ANGLES = ["dtl", "face_on"] as const;
export const TEST_CAPTURE_PATHS = ["in_app", "native_slomo"] as const;
export const HANDEDNESS = ["right", "left"] as const;
export const CAMERA_YAW_MARKERS = [0, 5, -5, 10, -10, 15, -15] as const;

export type TestSwingAngle = (typeof TEST_SWING_ANGLES)[number];
export type TestCapturePath = (typeof TEST_CAPTURE_PATHS)[number];
export type Handedness = (typeof HANDEDNESS)[number];
export type CameraYawMarker = (typeof CAMERA_YAW_MARKERS)[number];
export type ClubFamily = (typeof CLUB_FAMILIES)[number];
export type ShotIntent = (typeof INTENTS)[number];

export type TestSwingLabels = {
  golfer_label: string | null;
  club_family: ClubFamily | null;
  intent: ShotIntent | null;
  angle: TestSwingAngle | null;
  frame_rate: number | null;
  camera_yaw_marker: CameraYawMarker | null;
  capture_path: TestCapturePath | null;
  consecutive_group: string | null;
  pro_label_fault_1: string | null;
  pro_label_fault_2: string | null;
  handedness: Handedness | null;
  notes: string | null;
};

export type TestSwingRow = TestSwingLabels & {
  id: string;
  created_at: string;
  storage_path: string;
};

export type GroundTruthPhaseMarks = Partial<
  Record<"address" | "takeaway" | "top" | "impact" | "finish", number>
>;

export type TestSwingKeypointsRow = {
  id: string;
  created_at: string;
  test_swing_id: string;
  model_version: string;
  frame_rate_detected: number;
  keypoints: PoseFrame[];
  coverage: JointCoverage[];
  phases: SwingPhases | null;
  angle: StoredAngle | null;
  normalized_keypoints: PoseFrame[] | null;
  orientation: OrientationSample[] | null;
  metrics: StoredSwingMetrics | null;
  phase_marks: GroundTruthPhaseMarks | null;
};

export type TestSwingListItem = TestSwingRow & {
  signed_url: string | null;
  keypoints: TestSwingKeypointsRow | null;
};

function isClubFamily(value: string): value is ClubFamily {
  return (CLUB_FAMILIES as readonly string[]).includes(value);
}

function isIntent(value: string): value is ShotIntent {
  return (INTENTS as readonly string[]).includes(value);
}

function isAngle(value: string): value is TestSwingAngle {
  return (TEST_SWING_ANGLES as readonly string[]).includes(value);
}

function isCapturePath(value: string): value is TestCapturePath {
  return (TEST_CAPTURE_PATHS as readonly string[]).includes(value);
}

function isHandedness(value: string): value is Handedness {
  return (HANDEDNESS as readonly string[]).includes(value);
}

function isYaw(value: number): value is CameraYawMarker {
  return (CAMERA_YAW_MARKERS as readonly number[]).includes(value);
}

function blankToNull(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseTestSwingLabels(
  input: Record<string, unknown>,
): { ok: true; labels: TestSwingLabels } | { ok: false; error: string } {
  const clubRaw = blankToNull(input.club_family);
  if (clubRaw && !isClubFamily(clubRaw)) {
    return { ok: false, error: "club_family is invalid." };
  }

  const intentRaw = blankToNull(input.intent);
  if (intentRaw && !isIntent(intentRaw)) {
    return { ok: false, error: "intent is invalid." };
  }

  const angleRaw = blankToNull(input.angle);
  if (angleRaw && !isAngle(angleRaw)) {
    return { ok: false, error: "angle must be dtl or face_on." };
  }

  const frameRaw = input.frame_rate;
  const frameBlank =
    frameRaw === "" || frameRaw === null || frameRaw === undefined;
  const frame_rate = frameBlank ? null : Number(frameRaw);
  if (
    frame_rate !== null &&
    (!Number.isInteger(frame_rate) || frame_rate <= 0)
  ) {
    return { ok: false, error: "frame_rate must be a positive integer." };
  }

  const yawRaw = input.camera_yaw_marker;
  const yawBlank = yawRaw === "" || yawRaw === null || yawRaw === undefined;
  const yawNumber = yawBlank ? null : Number(yawRaw);
  if (yawNumber !== null && !isYaw(yawNumber)) {
    return {
      ok: false,
      error: "camera_yaw_marker must be 0, ±5, ±10, or ±15.",
    };
  }

  const pathRaw = blankToNull(input.capture_path);
  if (pathRaw && !isCapturePath(pathRaw)) {
    return { ok: false, error: "capture_path must be in_app or native_slomo." };
  }

  const handRaw = blankToNull(input.handedness);
  if (handRaw && !isHandedness(handRaw)) {
    return { ok: false, error: "handedness must be right or left." };
  }

  return {
    ok: true,
    labels: {
      golfer_label: blankToNull(input.golfer_label),
      club_family: clubRaw && isClubFamily(clubRaw) ? clubRaw : null,
      intent: intentRaw && isIntent(intentRaw) ? intentRaw : null,
      angle: angleRaw && isAngle(angleRaw) ? angleRaw : null,
      frame_rate,
      camera_yaw_marker: yawNumber,
      capture_path: pathRaw && isCapturePath(pathRaw) ? pathRaw : null,
      consecutive_group: blankToNull(input.consecutive_group),
      pro_label_fault_1: blankToNull(input.pro_label_fault_1),
      pro_label_fault_2: blankToNull(input.pro_label_fault_2),
      handedness: handRaw && isHandedness(handRaw) ? handRaw : null,
      notes: blankToNull(input.notes),
    },
  };
}

export function safeClipFileName(name: string) {
  const trimmed = name.trim().replace(/[^a-zA-Z0-9._-]/g, "_");
  return trimmed.slice(0, 120) || "clip.mp4";
}
