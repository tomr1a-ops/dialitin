import { describe, expect, test } from "vitest";
import type { PoseFrame } from "@/lib/pose/types";
import {
  buildPelvisTrace,
  buildWristTrace,
  smoothTracePath,
  traceToCanvas,
  WRIST_TRACE_VISIBILITY,
} from "@/lib/reveal/trace-path";
import type { ContentRect } from "@/lib/reveal/canvas-utils";

function frame(
  mediaTime: number,
  crop: PoseFrame["crop"],
  landmarks: Partial<Record<number, { x: number; y: number; visibility: number }>>,
): PoseFrame {
  const full: PoseFrame["landmarks"] = Array.from({ length: 33 }, () => ({
    x: 0,
    y: 0,
    visibility: 0,
  }));
  for (const [index, point] of Object.entries(landmarks)) {
    full[Number(index)] = point!;
  }
  return { mediaTime, crop, landmarks: full };
}

describe("trace-path", () => {
  test("smoothTracePath applies centered 5-frame average", () => {
    const path = [
      { x: 0, y: 0, dashed: false },
      { x: 10, y: 0, dashed: false },
      { x: 20, y: 0, dashed: false },
      { x: 30, y: 0, dashed: false },
      { x: 40, y: 0, dashed: false },
    ];
    const smoothed = smoothTracePath(path);
    expect(smoothed[2]?.x).toBe(20);
  });

  test("buildWristTrace skips low-visibility frames", () => {
    const keypoints = [
      frame(0, { x: 0, y: 0, width: 100, height: 200 }, {
        15: { x: 0.5, y: 0.5, visibility: WRIST_TRACE_VISIBILITY - 0.1 },
      }),
      frame(0.03, { x: 0, y: 0, width: 100, height: 200 }, {
        15: { x: 0.52, y: 0.51, visibility: 0.9 },
      }),
    ];
    const path = buildWristTrace(keypoints, {
      leadWrist: 15,
      startIdx: 0,
      endIdx: 1,
      wristReconstruction: null,
    });
    expect(path[0]).toBeNull();
    expect(path[1]).not.toBeNull();
  });

  test("buildWristTrace converts per-frame crop through full-image space", () => {
    const keypoints = [
      frame(0, { x: 50, y: 0, width: 100, height: 200 }, {
        15: { x: 0.5, y: 0.5, visibility: 1 },
      }),
    ];
    const path = buildWristTrace(keypoints, {
      leadWrist: 15,
      startIdx: 0,
      endIdx: 0,
      wristReconstruction: null,
    });
    expect(path[0]?.x).toBe(100);
    expect(path[0]?.y).toBe(100);
  });

  test("traceToCanvas maps full-image coords to canvas", () => {
    const imagePath = [
      { x: 50, y: 100, dashed: false },
      { x: 100, y: 100, dashed: false },
    ];
    const rect: ContentRect = {
      x: 0,
      y: 0,
      width: 200,
      height: 400,
      videoWidth: 200,
      videoHeight: 400,
    };
    const canvasPoints = traceToCanvas(imagePath, rect);
    expect(canvasPoints[0]?.x).toBe(50);
    expect(canvasPoints[1]?.x).toBe(100);
  });

  test("buildPelvisTrace averages hips in full-image space", () => {
    const keypoints = [
      frame(0, { x: 0, y: 0, width: 100, height: 200 }, {
        23: { x: 0.4, y: 0.6, visibility: 0.9 },
        24: { x: 0.6, y: 0.6, visibility: 0.9 },
      }),
    ];
    const path = buildPelvisTrace(keypoints, 0, 0);
    expect(path[0]?.x).toBe(50);
  });
});

describe("createPlaceholderRevealInput", () => {
  test("throws in development when DTL fault used on face-on", async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    const { createPlaceholderRevealInput } = await import("@/lib/reveal/placeholder");
    expect(() =>
      createPlaceholderRevealInput("face_on", { fault: "early_extension" }),
    ).toThrow(/face-on clip/);
    process.env.NODE_ENV = prev;
  });
});
