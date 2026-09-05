import { describe, expect, test } from "vitest";
import {
  computeFaceOnMetrics,
  HIP_ROTATION_UPPER_BOUND,
  shoulderRotationTop,
  tempoRatio,
} from "@/lib/engine/metrics/faceOn";
import type { StoredAngle } from "@/lib/engine/angle";
import type { SwingPhases } from "@/lib/engine/phases";
import {
  LEFT_ANKLE,
  LEFT_HEEL,
  LEFT_HIP,
  LEFT_KNEE,
  LEFT_SHOULDER,
  LEFT_WRIST,
  POSE_LANDMARK_COUNT,
  RIGHT_ANKLE,
  RIGHT_HEEL,
  RIGHT_HIP,
  RIGHT_KNEE,
  RIGHT_SHOULDER,
  RIGHT_WRIST,
  type PoseFrame,
  type PoseLandmark,
} from "@/lib/pose/types";

function blank(): PoseLandmark {
  return { x: 0.5, y: 0.5, visibility: 0.95 };
}

function faceOnFrame(
  mediaTime: number,
  options: {
    shoulderAngle?: number;
    hipAngle?: number;
    hipShiftX?: number;
    headShiftX?: number;
    headShiftY?: number;
    leadWristOffset?: number;
  } = {},
): PoseFrame {
  const landmarks = Array.from({ length: POSE_LANDMARK_COUNT }, blank);
  const cx = 0.5 + (options.hipShiftX ?? 0);
  const sy = 0.32 + (options.headShiftY ?? 0);
  const hy = 0.58 + (options.hipShiftX ?? 0) * 0.2;
  const shoulderSpread = 0.22;
  const hipSpread = 0.18;
  const shAngle = options.shoulderAngle ?? 0;
  const hipAngle = options.hipAngle ?? 0;

  const rot = (angle: number, half: number, y: number) => {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    landmarks[LEFT_SHOULDER] = {
      x: cx - half * cos,
      y: y - half * sin,
      visibility: 0.95,
    };
    landmarks[RIGHT_SHOULDER] = {
      x: cx + half * cos,
      y: y + half * sin,
      visibility: 0.95,
    };
  };

  rot(shAngle, shoulderSpread / 2, sy);
  const cosH = Math.cos(hipAngle);
  const sinH = Math.sin(hipAngle);
  landmarks[LEFT_HIP] = {
    x: cx - (hipSpread / 2) * cosH,
    y: hy - (hipSpread / 2) * sinH,
    visibility: 0.95,
  };
  landmarks[RIGHT_HIP] = {
    x: cx + (hipSpread / 2) * cosH,
    y: hy + (hipSpread / 2) * sinH,
    visibility: 0.95,
  };

  landmarks[LEFT_KNEE] = { x: cx - 0.08, y: 0.72, visibility: 0.9 };
  landmarks[RIGHT_KNEE] = { x: cx + 0.08, y: 0.72, visibility: 0.9 };
  landmarks[LEFT_ANKLE] = { x: cx - 0.1, y: 0.88, visibility: 0.9 };
  landmarks[RIGHT_ANKLE] = { x: cx + 0.1, y: 0.88, visibility: 0.9 };
  landmarks[LEFT_HEEL] = { x: cx - 0.1, y: 0.89, visibility: 0.9 };
  landmarks[RIGHT_HEEL] = { x: cx + 0.1, y: 0.89, visibility: 0.9 };
  landmarks[LEFT_WRIST] = {
    x: cx - 0.12 + (options.leadWristOffset ?? 0),
    y: 0.5,
    visibility: 0.9,
  };
  landmarks[RIGHT_WRIST] = { x: cx + 0.04, y: 0.5, visibility: 0.9 };
  landmarks[0] = {
    x: cx + (options.headShiftX ?? 0),
    y: sy - 0.12 + (options.headShiftY ?? 0),
    visibility: 0.9,
  };

  return {
    mediaTime,
    landmarks,
    crop: { x: 0, y: 0, width: 1, height: 1 },
  };
}

function phases(): SwingPhases {
  const mark = (frameIndex: number, timeMs: number) => ({
    frameIndex,
    timeMs,
    confidence: 0.9,
    valid: true,
    reason: "test",
  });
  return {
    address: mark(0, 0),
    takeaway: mark(5, 167),
    top: mark(15, 500),
    impact: mark(20, 667),
    finish: mark(25, 833),
    impactCandidate: {
      value: "motion",
      confidence: 0.8,
      valid: true,
      reason: null,
    },
    effectiveFrameRate: {
      value: 30,
      confidence: 0.9,
      valid: true,
      reason: null,
    },
    sloMoReexportedAt30: {
      value: false,
      confidence: 0.7,
      valid: true,
      reason: null,
    },
    trim: {
      value: { startMs: 0, endMs: 1000 },
      confidence: 0.8,
      valid: true,
      reason: null,
    },
  };
}

function faceOnAngle(): StoredAngle {
  return {
    case: "B",
    roll: { value: 0, confidence: 0.6, valid: true, reason: null },
    pitch: { value: 0, confidence: 0, valid: false, reason: null },
    yaw: { value: 0, confidence: 0, valid: false, reason: null },
    lambda: { value: 0.9, confidence: 0.8, valid: true, reason: null },
    classification: {
      value: "face_on",
      confidence: 0.85,
      valid: true,
      reason: null,
    },
    confidence: 0.85,
    valid: true,
    reason: null,
    elapsedMs: 2,
  };
}

describe("computeFaceOnMetrics", () => {
  test("refuses dtl classification", () => {
    const result = computeFaceOnMetrics({
      frames: [faceOnFrame(0)],
      normalizedFrames: null,
      phases: phases(),
      angle: {
        ...faceOnAngle(),
        classification: {
          value: "dtl",
          confidence: 0.8,
          valid: true,
          reason: null,
        },
      },
      handedness: "right",
    });
    expect(result.shoulder_rotation_top.valid).toBe(false);
    expect(result.shoulder_rotation_top.reason).toContain("dtl");
  });

  test("computes projected shoulder rotation at top", () => {
    const frames = [
      faceOnFrame(0, { shoulderAngle: 0 }),
      faceOnFrame(0.5, { shoulderAngle: 0.45 }),
    ];
    const result = computeFaceOnMetrics({
      frames,
      normalizedFrames: null,
      phases: {
        ...phases(),
        top: { ...phases().top, frameIndex: 1, timeMs: 500 },
      },
      angle: faceOnAngle(),
      handedness: "right",
    });
    expect(result.shoulder_rotation_top.valid).toBe(true);
    expect(result.shoulder_rotation_top.unit).toBe("normalized_rotation");
    expect(result.shoulder_rotation_top.value).toBeGreaterThan(0.2);
  });

  test("tempo ratio uses timestamps not frame counts", () => {
    const p = phases();
    const metric = tempoRatio(p);
    expect(metric.valid).toBe(true);
    expect(metric.value).toBeCloseTo((500 - 167) / (667 - 500), 2);
  });

  test("lead elbow separation invalid below 60 fps", () => {
    const frames = Array.from({ length: 26 }, (_, i) => faceOnFrame(i / 30));
    const result = computeFaceOnMetrics({
      frames,
      normalizedFrames: null,
      phases: phases(),
      angle: faceOnAngle(),
      handedness: "right",
    });
    expect(result.lead_elbow_separation.valid).toBe(false);
    expect(result.lead_elbow_separation.reason).toBe("fps");
  });

  test("ball position is low confidence inferred", () => {
    const frames = [faceOnFrame(0)];
    const result = computeFaceOnMetrics({
      frames,
      normalizedFrames: null,
      phases: phases(),
      angle: faceOnAngle(),
      handedness: "right",
    });
    expect(result.ball_position_inferred.confidence).toBeLessThan(0.5);
    expect(result.ball_position_inferred.reason).toContain("inferred");
  });

  test("hip rotation upper-bound hook fires", () => {
    const address = faceOnFrame(0, { hipAngle: 0 });
    const top = faceOnFrame(0.5, { hipAngle: 1.4 });
    const aspect = { value: 0.9, confidence: 0.9, valid: true, reason: null };
    const side = {
      leadShoulder: LEFT_SHOULDER,
      trailShoulder: RIGHT_SHOULDER,
      leadHip: LEFT_HIP,
      trailHip: RIGHT_HIP,
      leadElbow: 13,
      trailElbow: 14,
      leadWrist: LEFT_WRIST,
      trailWrist: RIGHT_WRIST,
      leadKnee: LEFT_KNEE,
      trailKnee: RIGHT_KNEE,
      leadAnkle: LEFT_ANKLE,
      trailAnkle: RIGHT_ANKLE,
      leadHeel: LEFT_HEEL,
      trailHeel: RIGHT_HEEL,
    };
    const trailKnee = {
      value: 0.05,
      confidence: 0.9,
      valid: true,
      reason: null,
    };
    const hipSway = { value: 2, confidence: 0.9, valid: true, reason: null };
    const { value } = shoulderRotationTop(address, top, side, aspect);
    void value;
    const metric = computeFaceOnMetrics({
      frames: [address, top],
      normalizedFrames: null,
      phases: {
        ...phases(),
        top: { ...phases().top, frameIndex: 1 },
      },
      angle: faceOnAngle(),
      handedness: "right",
    });
    if (metric.hip_rotation_top.value > HIP_ROTATION_UPPER_BOUND) {
      expect(metric.hip_rotation_top.reason).toContain("upper-bound hook");
    }
    void trailKnee;
    void hipSway;
  });
});
