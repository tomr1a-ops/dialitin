import { describe, expect, test } from "vitest";
import { padLandmarks } from "@/lib/pose/isolate";
import {
  isTrackingLost,
  pickTrackedPerson,
  torsoMetrics,
} from "@/lib/pose/track";
import type { PoseLandmark } from "@/lib/pose/types";

const crop = { x: 100, y: 50, width: 200, height: 400 };

function pose(
  partial: Partial<Record<number, { x: number; y: number; visibility: number }>>,
): PoseLandmark[] {
  const landmarks = padLandmarks(undefined);
  for (const [index, point] of Object.entries(partial)) {
    landmarks[Number(index)] = point!;
  }
  return landmarks;
}

describe("pose track", () => {
  test("torsoMetrics returns hip center in canvas pixels", () => {
    const metrics = torsoMetrics(
      pose({
        11: { x: 0.4, y: 0.3, visibility: 0.9 },
        12: { x: 0.6, y: 0.3, visibility: 0.9 },
        23: { x: 0.45, y: 0.7, visibility: 0.9 },
        24: { x: 0.55, y: 0.7, visibility: 0.9 },
      }),
      crop,
    );
    expect(metrics?.hipCenter.x).toBeCloseTo(200);
    expect(metrics?.torsoHeight).toBeGreaterThan(40);
  });

  test("isTrackingLost flags large hip jumps", () => {
    const previous = torsoMetrics(
      pose({
        11: { x: 0.4, y: 0.3, visibility: 0.9 },
        12: { x: 0.6, y: 0.3, visibility: 0.9 },
        23: { x: 0.45, y: 0.7, visibility: 0.9 },
        24: { x: 0.55, y: 0.7, visibility: 0.9 },
      }),
      crop,
    );
    const next = torsoMetrics(
      pose({
        11: { x: 0.9, y: 0.3, visibility: 0.9 },
        12: { x: 1.0, y: 0.3, visibility: 0.9 },
        23: { x: 0.95, y: 0.7, visibility: 0.9 },
        24: { x: 1.0, y: 0.7, visibility: 0.9 },
      }),
      crop,
    );
    expect(isTrackingLost(previous, next)).toBe(true);
  });

  test("pickTrackedPerson prefers nearest hip to previous frame", () => {
    const previous = torsoMetrics(
      pose({
        11: { x: 0.4, y: 0.3, visibility: 0.9 },
        12: { x: 0.6, y: 0.3, visibility: 0.9 },
        23: { x: 0.45, y: 0.7, visibility: 0.9 },
        24: { x: 0.55, y: 0.7, visibility: 0.9 },
      }),
      crop,
    );
    const golfer = pose({
      11: { x: 0.4, y: 0.3, visibility: 0.9 },
      12: { x: 0.6, y: 0.3, visibility: 0.9 },
      23: { x: 0.45, y: 0.7, visibility: 0.9 },
      24: { x: 0.55, y: 0.7, visibility: 0.9 },
    });
    const bystander = pose({
      11: { x: 0.8, y: 0.2, visibility: 0.9 },
      12: { x: 0.95, y: 0.2, visibility: 0.9 },
      23: { x: 0.85, y: 0.55, visibility: 0.9 },
      24: { x: 0.95, y: 0.55, visibility: 0.9 },
    });
    const picked = pickTrackedPerson([bystander, golfer], crop, previous);
    expect(picked?.[23]?.x).toBeCloseTo(0.45);
  });
});
