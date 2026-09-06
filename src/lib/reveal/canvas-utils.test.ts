import { describe, expect, test } from "vitest";
import {
  GOLFER_HEAD,
  GOLFER_SKELETON_CONNECTIONS,
  GOLFER_SKELETON_JOINTS,
} from "@/lib/pose/golfer-skeleton";
import {
  BONE_LENGTH_CHANGE_THRESHOLD,
  smoothGolferJoints,
} from "@/lib/reveal/canvas-utils";
import type { PoseFrame } from "@/lib/pose/types";

function frame(landmarks: PoseFrame["landmarks"], mediaTime = 0): PoseFrame {
  return {
    mediaTime,
    landmarks,
    crop: { x: 0, y: 0, width: 1, height: 1 },
  };
}

describe("GOLFER_SKELETON_JOINTS", () => {
  test("includes 12 body joints plus head", () => {
    expect(GOLFER_SKELETON_JOINTS).toHaveLength(13);
    expect(GOLFER_SKELETON_JOINTS[0]).toBe(GOLFER_HEAD);
    expect(GOLFER_SKELETON_CONNECTIONS.length).toBeGreaterThan(0);
  });

  test("excludes face, hand, and foot detail landmarks", () => {
    const numeric = GOLFER_SKELETON_JOINTS.filter((joint) => joint !== GOLFER_HEAD);
    expect(numeric).toEqual([
      11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28,
    ]);
  });
});

describe("smoothGolferJoints", () => {
  test("averages neighboring frames per joint", () => {
    const visible = { x: 0.5, y: 0.5, visibility: 0.9 };
    const keypoints = [
      frame(Array.from({ length: 33 }, () => ({ ...visible, x: 0.4 })), 0),
      frame(Array.from({ length: 33 }, () => ({ ...visible, x: 0.5 })), 0.04),
      frame(Array.from({ length: 33 }, () => ({ ...visible, x: 0.6 })), 0.08),
    ];
    keypoints[0]!.landmarks[7] = { x: 0.4, y: 0.2, visibility: 0.9 };
    keypoints[0]!.landmarks[8] = { x: 0.42, y: 0.2, visibility: 0.9 };
    keypoints[1]!.landmarks[7] = { x: 0.5, y: 0.2, visibility: 0.9 };
    keypoints[1]!.landmarks[8] = { x: 0.52, y: 0.2, visibility: 0.9 };
    keypoints[2]!.landmarks[7] = { x: 0.6, y: 0.2, visibility: 0.9 };
    keypoints[2]!.landmarks[8] = { x: 0.62, y: 0.2, visibility: 0.9 };

    const smoothed = smoothGolferJoints(keypoints, 3);
    const head = smoothed[1]?.[GOLFER_HEAD];
    expect(head?.x).toBeCloseTo(0.51, 2);
  });
});

describe("bone length gate threshold", () => {
  test("uses 40% frame-to-frame change", () => {
    expect(BONE_LENGTH_CHANGE_THRESHOLD).toBe(0.4);
  });
});
