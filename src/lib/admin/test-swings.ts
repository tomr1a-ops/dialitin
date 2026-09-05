import { CLUB_FAMILIES, INTENTS } from "@/lib/admin/constants";

export const TEST_SWING_BUCKET = "test-swings";

export const TEST_SWING_ANGLES = ["dtl", "face_on"] as const;
export const TEST_CAPTURE_PATHS = ["in_app", "upload"] as const;
export const HANDEDNESS = ["right", "left"] as const;
export const CAMERA_YAW_MARKERS = [0, 5, -5, 10, -10, 15, -15] as const;

export type TestSwingAngle = (typeof TEST_SWING_ANGLES)[number];
export type TestCapturePath = (typeof TEST_CAPTURE_PATHS)[number];
export type Handedness = (typeof HANDEDNESS)[number];
export type CameraYawMarker = (typeof CAMERA_YAW_MARKERS)[number];
export type ClubFamily = (typeof CLUB_FAMILIES)[number];
export type ShotIntent = (typeof INTENTS)[number];

export type TestSwingLabels = {
  golfer_label: string;
  club_family: ClubFamily;
  intent: ShotIntent;
  angle: TestSwingAngle;
  frame_rate: number;
  camera_yaw_marker: CameraYawMarker;
  capture_path: TestCapturePath;
  consecutive_group: string | null;
  pro_label_fault_1: string | null;
  pro_label_fault_2: string | null;
  handedness: Handedness;
  notes: string | null;
};

export type TestSwingRow = TestSwingLabels & {
  id: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  created_by_email: string | null;
  storage_path: string;
};

export type TestSwingPoseRun = {
  id: string;
  created_at: string;
  test_swing_id: string;
  frames_processed: number;
  coverage_pct: number;
  pose_path: "worker" | "main";
  seconds_to_process: number;
};

export type TestSwingListItem = TestSwingRow & {
  signed_url: string | null;
  pose_run: TestSwingPoseRun | null;
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
  const golfer_label = String(input.golfer_label ?? "").trim();
  if (!golfer_label) {
    return { ok: false, error: "golfer_label is required." };
  }

  const club_family = String(input.club_family ?? "");
  if (!isClubFamily(club_family)) {
    return { ok: false, error: "club_family is invalid." };
  }

  const intent = String(input.intent ?? "");
  if (!isIntent(intent)) {
    return { ok: false, error: "intent is invalid." };
  }

  const angle = String(input.angle ?? "");
  if (!isAngle(angle)) {
    return { ok: false, error: "angle must be dtl or face_on." };
  }

  const frame_rate = Number(input.frame_rate);
  if (!Number.isFinite(frame_rate) || frame_rate <= 0 || frame_rate > 480) {
    return { ok: false, error: "frame_rate must be between 0 and 480." };
  }

  const camera_yaw_marker = Number(input.camera_yaw_marker);
  if (!isYaw(camera_yaw_marker)) {
    return {
      ok: false,
      error: "camera_yaw_marker must be 0, ±5, ±10, or ±15.",
    };
  }

  const capture_path = String(input.capture_path ?? "");
  if (!isCapturePath(capture_path)) {
    return { ok: false, error: "capture_path must be in_app or upload." };
  }

  const handedness = String(input.handedness ?? "");
  if (!isHandedness(handedness)) {
    return { ok: false, error: "handedness must be right or left." };
  }

  return {
    ok: true,
    labels: {
      golfer_label,
      club_family,
      intent,
      angle,
      frame_rate,
      camera_yaw_marker,
      capture_path,
      consecutive_group: blankToNull(input.consecutive_group),
      pro_label_fault_1: blankToNull(input.pro_label_fault_1),
      pro_label_fault_2: blankToNull(input.pro_label_fault_2),
      handedness,
      notes: blankToNull(input.notes),
    },
  };
}

export function safeClipFileName(name: string) {
  const trimmed = name.trim().replace(/[^a-zA-Z0-9._-]/g, "_");
  return trimmed.slice(0, 120) || "clip.mp4";
}
