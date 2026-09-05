import { describe, expect, test } from "vitest";
import { jointCoverage } from "@/lib/preview/coverage";
import { POSE_LANDMARK_COUNT, type PoseFrame } from "@/lib/pose/types";

function frame(visibility: number): PoseFrame {
  return {
    mediaTime: 0,
    crop: { x: 0, y: 0, width: 1, height: 1 },
    landmarks: Array.from({ length: POSE_LANDMARK_COUNT }, () => ({
      x: 0.5,
      y: 0.5,
      visibility,
    })),
  };
}

describe("jointCoverage", () => {
  test("reports per-joint percent visible and min visibility", () => {
    const rows = jointCoverage([frame(0.49), frame(0.9)]);
    expect(rows).toHaveLength(33);
    expect(rows[0]?.name).toBe("nose");
    expect(rows[0]?.pctVisible).toBe(50);
    expect(rows[0]?.minVisibility).toBeCloseTo(0.49);
  });
});
