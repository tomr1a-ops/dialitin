import { describe, expect, test } from "vitest";
import {
  estimateCameraAngle,
  FACE_ON_YAW_TARGET_DEG,
  labeledAngleMismatch,
  shouldRefuseAngle,
} from "@/lib/engine/angle";
import type { SwingPhases } from "@/lib/engine/phases";
import {
  LEFT_ANKLE,
  LEFT_HIP,
  LEFT_SHOULDER,
  POSE_LANDMARK_COUNT,
  RIGHT_ANKLE,
  RIGHT_HIP,
  RIGHT_SHOULDER,
  type PoseFrame,
  type PoseLandmark,
} from "@/lib/pose/types";

function blank(): PoseLandmark {
  return { x: 0.5, y: 0.5, visibility: 0.1 };
}

function addressFrame(
  mediaTime: number,
  options: {
    shoulderSpread: number;
    torsoLen: number;
    ankleSkew?: number;
  },
): PoseFrame {
  const landmarks = Array.from({ length: POSE_LANDMARK_COUNT }, blank);
  const cx = 0.5;
  const sy = 0.32;
  const hy = sy + options.torsoLen;
  const half = options.shoulderSpread / 2;
  landmarks[LEFT_SHOULDER] = {
    x: cx - half,
    y: sy,
    visibility: 0.95,
  };
  landmarks[RIGHT_SHOULDER] = {
    x: cx + half,
    y: sy,
    visibility: 0.95,
  };
  landmarks[LEFT_HIP] = { x: cx - half * 0.9, y: hy, visibility: 0.95 };
  landmarks[RIGHT_HIP] = { x: cx + half * 0.9, y: hy, visibility: 0.95 };
  const skew = options.ankleSkew ?? 0;
  landmarks[LEFT_ANKLE] = {
    x: cx - half - skew,
    y: 0.88,
    visibility: 0.9,
  };
  landmarks[RIGHT_ANKLE] = {
    x: cx + half - skew,
    y: 0.88,
    visibility: 0.9,
  };
  return {
    mediaTime,
    landmarks,
    crop: { x: 0, y: 0, width: 1, height: 1 },
  };
}

function phasesAt(index: number): SwingPhases {
  const mark = {
    frameIndex: index,
    timeMs: index * 33,
    confidence: 0.9,
    valid: true,
    reason: "test",
  };
  return {
    address: mark,
    takeaway: { ...mark, frameIndex: index + 1 },
    top: { ...mark, frameIndex: index + 8 },
    impact: { ...mark, frameIndex: index + 16 },
    finish: { ...mark, frameIndex: index + 20 },
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

describe("estimateCameraAngle", () => {
  test("Case B classifies high lambda as face_on", () => {
    const frames = [addressFrame(0, { shoulderSpread: 0.28, torsoLen: 0.28 })];
    const result = estimateCameraAngle({
      frames,
      phases: phasesAt(0),
      imageWidth: 1080,
      imageHeight: 1920,
      capturePath: "native_slomo",
      verticalRoll: {
        rollDeg: 1.2,
        confidence: 0.7,
        valid: true,
        reason: "test",
      },
    });
    expect(result.angle.case).toBe("B");
    expect(result.angle.lambda.value).toBeGreaterThan(0.9);
    expect(result.angle.classification.value).toBe("face_on");
    expect(result.angle.valid).toBe(true);
    expect(result.normalizedFrames).toBeNull();
  });

  test("Case B classifies low lambda as dtl", () => {
    const frames = [addressFrame(0, { shoulderSpread: 0.06, torsoLen: 0.32 })];
    const result = estimateCameraAngle({
      frames,
      phases: phasesAt(0),
      imageWidth: 1080,
      imageHeight: 1920,
      capturePath: "upload",
      verticalRoll: {
        rollDeg: 0,
        confidence: 0.6,
        valid: true,
        reason: "test",
      },
    });
    expect(result.angle.classification.value).toBe("dtl");
    expect(result.angle.valid).toBe(true);
  });

  test("refuse gate returns reason angle for ambiguous lambda", () => {
    const frames = [addressFrame(0, { shoulderSpread: 0.18, torsoLen: 0.3 })];
    const result = estimateCameraAngle({
      frames,
      phases: phasesAt(0),
      imageWidth: 1080,
      imageHeight: 1920,
      capturePath: "upload",
    });
    expect(result.angle.classification.value).toBe("refuse");
    expect(result.angle.valid).toBe(false);
    expect(result.angle.reason).toBe("angle");
    expect(shouldRefuseAngle(result.angle)).toBe(true);
  });

  test("Case A estimates yaw with sensor path", () => {
    const frames = [
      addressFrame(0, {
        shoulderSpread: 0.22,
        torsoLen: 0.28,
        ankleSkew: 0.06,
      }),
    ];
    const result = estimateCameraAngle({
      frames,
      phases: phasesAt(0),
      imageWidth: 1080,
      imageHeight: 1920,
      capturePath: "in-app",
      orientationSamples: [
        { t: 0, beta: 92, gamma: 2, roll: 2, pitch: 2 },
      ],
    });
    expect(result.angle.case).toBe("A");
    expect(result.angle.roll.valid).toBe(true);
  });

  test("labeledAngleMismatch flags G01-style dtl label vs face_on classification", () => {
    const angle = {
      case: "B" as const,
      roll: { value: 0, confidence: 0.5, valid: true, reason: null },
      pitch: { value: 0, confidence: 0, valid: false, reason: "upload" },
      yaw: { value: 0, confidence: 0, valid: false, reason: null },
      lambda: { value: 0.95, confidence: 0.8, valid: true, reason: null },
      classification: {
        value: "face_on" as const,
        confidence: 0.8,
        valid: true,
        reason: null,
      },
      confidence: 0.8,
      valid: true,
      reason: null,
      elapsedMs: 3,
    };
    expect(labeledAngleMismatch("dtl", angle)).toBe(true);
    expect(labeledAngleMismatch("face_on", angle)).toBe(false);
  });
});

describe("yaw refuse bands", () => {
  test("face-on target yaw is 90°", () => {
    expect(FACE_ON_YAW_TARGET_DEG).toBe(90);
  });
});
