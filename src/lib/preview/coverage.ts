import { POSE_LANDMARK_COUNT, type PoseFrame } from "@/lib/pose/types";

export const KEYPOINT_VISIBILITY_THRESHOLD = 0.5;

export function isCoveredFrame(frame: PoseFrame): boolean {
  if (frame.landmarks.length !== POSE_LANDMARK_COUNT) {
    return false;
  }
  return frame.landmarks.every(
    (landmark) => landmark.visibility >= KEYPOINT_VISIBILITY_THRESHOLD,
  );
}

export function keypointCoveragePct(frames: PoseFrame[]): number {
  if (frames.length === 0) {
    return 0;
  }
  const covered = frames.filter(isCoveredFrame).length;
  return (covered / frames.length) * 100;
}

export function poseBackendToPath(
  backend: "worker" | "main-thread" | "unavailable",
): "worker" | "main" | null {
  if (backend === "worker") {
    return "worker";
  }
  if (backend === "main-thread") {
    return "main";
  }
  return null;
}
