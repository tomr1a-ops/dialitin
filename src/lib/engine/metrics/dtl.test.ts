import { describe, expect, test } from "vitest";
import {
  computeDtlMetrics,
  familyFromValue,
} from "@/lib/engine/metrics/dtl";
import type { StoredAngle } from "@/lib/engine/angle";
import type { SwingPhases } from "@/lib/engine/phases";
import {
  LEFT_ANKLE,
  LEFT_HEEL,
  LEFT_HIP,
  LEFT_SHOULDER,
  LEFT_WRIST,
  POSE_LANDMARK_COUNT,
  RIGHT_ANKLE,
  RIGHT_HEEL,
  RIGHT_HIP,
  RIGHT_SHOULDER,
  RIGHT_WRIST,
  type PoseFrame,
  type PoseLandmark,
} from "@/lib/pose/types";

function blank(): PoseLandmark {
  return { x: 0.5, y: 0.5, visibility: 0.95 };
}

type DtlFrameOptions = {
  hipShiftX?: number;
  headShiftY?: number;
  shoulderTilt?: number;
  leadWristX?: number;
  leadWristY?: number;
};

function dtlFrame(mediaTime: number, options: DtlFrameOptions = {}): PoseFrame {
  const landmarks = Array.from({ length: POSE_LANDMARK_COUNT }, blank);
  const cx = 0.5;
  const hipShift = options.hipShiftX ?? 0;
  const headShiftY = options.headShiftY ?? 0;
  const tilt = options.shoulderTilt ?? 0;

  landmarks[LEFT_SHOULDER] = {
    x: cx - 0.02 + tilt,
    y: 0.32,
    visibility: 0.95,
  };
  landmarks[RIGHT_SHOULDER] = {
    x: cx + 0.02 + tilt,
    y: 0.32,
    visibility: 0.95,
  };
  landmarks[LEFT_HIP] = { x: cx - 0.04 + hipShift, y: 0.58, visibility: 0.95 };
  landmarks[RIGHT_HIP] = { x: cx + 0.04 + hipShift, y: 0.58, visibility: 0.95 };
  landmarks[LEFT_ANKLE] = { x: cx - 0.1, y: 0.88, visibility: 0.9 };
  landmarks[RIGHT_ANKLE] = { x: cx + 0.1, y: 0.88, visibility: 0.9 };
  landmarks[LEFT_HEEL] = { x: cx - 0.1, y: 0.89, visibility: 0.9 };
  landmarks[RIGHT_HEEL] = { x: cx + 0.1, y: 0.89, visibility: 0.9 };
  landmarks[LEFT_WRIST] = {
    x: options.leadWristX ?? cx - 0.08,
    y: options.leadWristY ?? 0.52,
    visibility: 0.9,
  };
  landmarks[RIGHT_WRIST] = { x: cx + 0.02, y: 0.5, visibility: 0.95 };
  landmarks[0] = {
    x: cx,
    y: 0.18 + headShiftY,
    visibility: 0.9,
  };
  landmarks[7] = {
    x: cx - 0.02,
    y: 0.16 + headShiftY,
    visibility: 0.9,
  };
  landmarks[8] = {
    x: cx + 0.02,
    y: 0.16 + headShiftY,
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
    takeaway: mark(5, 83),
    top: mark(10, 167),
    impact: mark(20, 333),
    finish: mark(25, 417),
    impactCandidate: {
      value: "motion",
      confidence: 0.8,
      valid: true,
      reason: null,
    },
    effectiveFrameRate: {
      value: 60,
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
      value: { startMs: 0, endMs: 500 },
      confidence: 0.8,
      valid: true,
      reason: null,
    },
  };
}

function dtlAngle(caseType: "A" | "B" = "B"): StoredAngle {
  return {
    case: caseType,
    roll: { value: 0, confidence: 0.6, valid: true, reason: null },
    pitch: { value: 0, confidence: 0, valid: false, reason: null },
    yaw: { value: 0, confidence: 0.7, valid: true, reason: null },
    lambda: { value: 0.25, confidence: 0.8, valid: true, reason: null },
    classification: {
      value: "dtl",
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

function buildSwing(
  perFrame: (i: number, phase: "address" | "mid" | "top" | "impact") => DtlFrameOptions,
): PoseFrame[] {
  const ph = phases();
  const frames: PoseFrame[] = [];
  for (let i = 0; i <= 25; i++) {
    let phase: "address" | "mid" | "top" | "impact" = "mid";
    if (i === ph.address.frameIndex) {
      phase = "address";
    } else if (i === ph.top.frameIndex) {
      phase = "top";
    } else if (i === ph.impact.frameIndex) {
      phase = "impact";
    }
    frames.push(dtlFrame(i / 60, perFrame(i, phase)));
  }
  return frames;
}

const THRUST_MIN = 4;

describe("computeDtlMetrics", () => {
  test("refuses face-on classification", () => {
    const result = computeDtlMetrics({
      frames: [dtlFrame(0)],
      normalizedFrames: null,
      phases: phases(),
      angle: {
        ...dtlAngle(),
        classification: {
          value: "face_on",
          confidence: 0.8,
          valid: true,
          reason: null,
        },
      },
      handedness: "right",
    });
    expect(result.spine_tilt_address.valid).toBe(false);
    expect(result.spine_tilt_address.reason).toContain("face-on");
  });

  test("known thrust case — pelvis toward ball", () => {
    const frames = buildSwing((_i, phase) => ({
      hipShiftX: phase === "impact" ? -0.06 : 0,
    }));
    const result = computeDtlMetrics({
      frames,
      normalizedFrames: null,
      phases: phases(),
      angle: dtlAngle(),
      handedness: "right",
    });
    expect(result.tush_line_pelvis.valid).toBe(true);
    expect(result.tush_line_pelvis.value).toBeGreaterThan(THRUST_MIN);
    expect(familyFromValue(result.tush_line_family.value)).toBe("thrust");
  });

  test("known stand-up case — head rises, pelvis quiet", () => {
    const frames = buildSwing((_i, phase) => ({
      headShiftY: phase === "impact" ? -0.08 : 0,
      shoulderTilt: phase === "impact" ? 0.1 : 0,
      hipShiftX: 0,
    }));
    const result = computeDtlMetrics({
      frames,
      normalizedFrames: null,
      phases: phases(),
      angle: dtlAngle(),
      handedness: "right",
    });
    expect(result.head_lift_dtl.valid).toBe(true);
    expect(result.head_lift_dtl.value).toBeGreaterThan(5);
    expect(familyFromValue(result.tush_line_family.value)).toBe("stand_up");
  });

  test("clean case — no early extension family", () => {
    const frames = buildSwing(() => ({}));
    const result = computeDtlMetrics({
      frames,
      normalizedFrames: null,
      phases: phases(),
      angle: dtlAngle(),
      handedness: "right",
    });
    expect(result.tush_line_pelvis.valid).toBe(true);
    expect(result.tush_line_pelvis.value).toBeLessThan(4);
    expect(familyFromValue(result.tush_line_family.value)).toBe("clean");
  });

  test("over-the-top path vs shallow path", () => {
    const base = buildSwing((_i, phase) => {
      if (phase === "top") {
        return { leadWristX: 0.42, leadWristY: 0.4 };
      }
      if (phase === "impact") {
        return { leadWristX: 0.38, leadWristY: 0.55 };
      }
      return { leadWristX: 0.42, leadWristY: 0.45 };
    });

    const ottFrames = base.map((frame, i) => {
      if (i > phases().top.frameIndex && i <= phases().impact.frameIndex) {
        const landmarks = frame.landmarks.slice();
        const w = landmarks[LEFT_WRIST]!;
        landmarks[LEFT_WRIST] = { ...w, x: w.x + 0.06, y: w.y - 0.02 };
        return { ...frame, landmarks };
      }
      return frame;
    });

    const shallowFrames = base.map((frame, i) => {
      if (i > phases().top.frameIndex && i <= phases().impact.frameIndex) {
        const landmarks = frame.landmarks.slice();
        const w = landmarks[LEFT_WRIST]!;
        landmarks[LEFT_WRIST] = { ...w, x: w.x - 0.05, y: w.y + 0.01 };
        return { ...frame, landmarks };
      }
      return frame;
    });

    const ott = computeDtlMetrics({
      frames: ottFrames,
      normalizedFrames: null,
      phases: phases(),
      angle: dtlAngle(),
      handedness: "right",
    });
    const shallow = computeDtlMetrics({
      frames: shallowFrames,
      normalizedFrames: null,
      phases: phases(),
      angle: dtlAngle(),
      handedness: "right",
    });

    expect(ott.delivery_slot.valid).toBe(true);
    expect(shallow.delivery_slot.valid).toBe(true);
    expect(ott.delivery_slot.value).toBeGreaterThan(shallow.delivery_slot.value);
  });

  test("Case B metrics carry uncorrected reason", () => {
    const result = computeDtlMetrics({
      frames: buildSwing(() => ({})),
      normalizedFrames: null,
      phases: phases(),
      angle: dtlAngle("B"),
      handedness: "right",
    });
    expect(result.spine_tilt_address.reason).toContain("uncorrected, Case B");
  });
});
