import { describe, expect, test } from "vitest";
import { keypointCoveragePct, poseBackendToPath } from "@/lib/preview/coverage";
import { POSE_LANDMARK_COUNT, type PoseFrame } from "@/lib/pose/types";

function frame(visibilities: number[]): PoseFrame {
  return {
    mediaTime: 0,
    crop: { x: 0, y: 0, width: 1, height: 1 },
    landmarks: visibilities.map((visibility) => ({
      x: 0.5,
      y: 0.5,
      visibility,
    })),
  };
}

function full(visibility: number): PoseFrame {
  return frame(Array.from({ length: POSE_LANDMARK_COUNT }, () => visibility));
}

describe("keypointCoveragePct", () => {
  test("is zero with no frames", () => {
    expect(keypointCoveragePct([])).toBe(0);
  });

  test("counts only frames where all 33 landmarks are >= 0.5", () => {
    const weak = full(0.49);
    const strong = full(0.5);
    const short = frame(Array.from({ length: 10 }, () => 0.9));
    expect(keypointCoveragePct([weak, strong, short])).toBeCloseTo(100 / 3);
  });
});

describe("poseBackendToPath", () => {
  test("maps worker and main-thread to the preview table labels", () => {
    expect(poseBackendToPath("worker")).toBe("worker");
    expect(poseBackendToPath("main-thread")).toBe("main");
    expect(poseBackendToPath("unavailable")).toBeNull();
  });
});
