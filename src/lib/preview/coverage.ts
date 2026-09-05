import { POSE_JOINT_NAMES } from "@/lib/pose/joints";
import { POSE_LANDMARK_COUNT, type PoseFrame } from "@/lib/pose/types";

export const KEYPOINT_VISIBILITY_THRESHOLD = 0.5;

export type JointCoverage = {
  joint: number;
  name: string;
  pctVisible: number;
  minVisibility: number;
};

export function jointCoverage(frames: PoseFrame[]): JointCoverage[] {
  return POSE_JOINT_NAMES.map((name, joint) => {
    const visibilities = frames.map(
      (frame) => frame.landmarks[joint]?.visibility ?? 0,
    );
    const visible = visibilities.filter(
      (value) => value >= KEYPOINT_VISIBILITY_THRESHOLD,
    ).length;
    return {
      joint,
      name,
      pctVisible: frames.length === 0 ? 0 : (visible / frames.length) * 100,
      minVisibility: visibilities.length === 0 ? 0 : Math.min(...visibilities),
    };
  });
}

export function framesFromStoredKeypoints(value: unknown): PoseFrame[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }
    const record = item as {
      mediaTime?: number;
      landmarks?: PoseFrame["landmarks"];
      crop?: PoseFrame["crop"];
    };
    if (!Array.isArray(record.landmarks)) {
      return [];
    }
    const landmarks = record.landmarks.slice(0, POSE_LANDMARK_COUNT);
    while (landmarks.length < POSE_LANDMARK_COUNT) {
      landmarks.push({ x: 0, y: 0, visibility: 0 });
    }
    return [
      {
        mediaTime: Number(record.mediaTime ?? 0),
        landmarks,
        crop: record.crop ?? { x: 0, y: 0, width: 1, height: 1 },
      },
    ];
  });
}
