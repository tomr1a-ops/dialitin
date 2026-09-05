import { describe, expect, test } from "vitest";
import {
  leadWristPosition,
  reconstructLeadWristPath,
} from "@/lib/engine/occlusion";
import type { SwingPhases } from "@/lib/engine/phases";
import {
  LEFT_ELBOW,
  LEFT_HIP,
  LEFT_SHOULDER,
  LEFT_WRIST,
  POSE_LANDMARK_COUNT,
  RIGHT_ELBOW,
  RIGHT_HIP,
  RIGHT_SHOULDER,
  RIGHT_WRIST,
  type PoseFrame,
  type PoseLandmark,
} from "@/lib/pose/types";

function blank(): PoseLandmark {
  return { x: 0.5, y: 0.5, visibility: 0.95 };
}

function dtlFrame(
  mediaTime: number,
  options: {
    leadWrist?: Partial<PoseLandmark>;
    trailWrist?: Partial<PoseLandmark>;
    leadElbow?: Partial<PoseLandmark>;
    occlude?: boolean;
  } = {},
): PoseFrame {
  const landmarks = Array.from({ length: POSE_LANDMARK_COUNT }, blank);
  const cx = 0.5;
  landmarks[LEFT_SHOULDER] = { x: cx - 0.02, y: 0.32, visibility: 0.95 };
  landmarks[RIGHT_SHOULDER] = { x: cx + 0.02, y: 0.32, visibility: 0.95 };
  landmarks[LEFT_HIP] = { x: cx - 0.04, y: 0.58, visibility: 0.95 };
  landmarks[RIGHT_HIP] = { x: cx + 0.04, y: 0.58, visibility: 0.95 };
  landmarks[LEFT_ELBOW] = {
    x: cx - 0.06,
    y: 0.42,
    visibility: 0.9,
    ...options.leadElbow,
  };
  landmarks[RIGHT_ELBOW] = { x: cx + 0.05, y: 0.42, visibility: 0.9 };
  const leadVis = options.occlude ? 0.2 : 0.92;
  landmarks[LEFT_WRIST] = {
    x: cx - 0.1,
    y: 0.52,
    visibility: leadVis,
    ...options.leadWrist,
  };
  landmarks[RIGHT_WRIST] = {
    x: cx + 0.02,
    y: 0.5,
    visibility: 0.95,
    ...options.trailWrist,
  };
  return {
    mediaTime,
    landmarks,
    crop: { x: 0, y: 0, width: 1, height: 1 },
  };
}

function phases(impactIdx: number): SwingPhases {
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
    impact: mark(impactIdx, impactIdx * 16.7),
    finish: mark(impactIdx + 5, (impactIdx + 5) * 16.7),
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
      value: { startMs: 0, endMs: 1000 },
      confidence: 0.8,
      valid: true,
      reason: null,
    },
  };
}

describe("reconstructLeadWristPath", () => {
  test("marks visible frames and reconstructs occluded impact window", () => {
    const impactIdx = 16;
    const frames: PoseFrame[] = [];
    for (let i = 0; i <= 20; i++) {
      const occlude = i >= impactIdx - 1 && i <= impactIdx + 1;
      frames.push(
        dtlFrame(i / 60, {
          occlude,
          leadWrist: occlude ? { x: 0.52, y: 0.5, visibility: 0.9 } : {},
        }),
      );
    }
    const result = reconstructLeadWristPath({
      frames,
      phases: phases(impactIdx),
      handedness: "right",
      capturePath: "native_slomo",
    });
    const vis = result.frames.filter((f) => f.reason === "visible");
    const recon = result.frames.filter((f) => f.reason.startsWith("reconstructed"));
    expect(vis.length).toBeGreaterThan(0);
    expect(recon.length).toBeGreaterThan(0);
    expect(result.avClockOffsetReason).toBe("unmeasured on filming day");
    const occluded = leadWristPosition(result, impactIdx - 1);
    expect(occluded?.x).toBeGreaterThan(0);
  });

  test("audio anchor produces virtual impact on spline", () => {
    const impactIdx = 16;
    const frames: PoseFrame[] = [];
    for (let i = 0; i <= 20; i++) {
      frames.push(dtlFrame(i / 60, { occlude: i === impactIdx }));
    }
    const ph = phases(impactIdx);
    const impactMs = ph.impact.timeMs;
    const result = reconstructLeadWristPath({
      frames,
      phases: ph,
      handedness: "right",
      audioTransientMs: impactMs - 5,
    });
    expect(result.virtualImpact?.valid).toBe(true);
    expect(result.virtualImpact?.x).toBeGreaterThan(0);
  });
});
