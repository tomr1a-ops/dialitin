import { describe, expect, test } from "vitest";
import {
  AV_CLOCK_OFFSET_MS,
  findSwingPhases,
  type AudioSample,
} from "@/lib/engine/phases";
import {
  LEFT_HIP,
  LEFT_SHOULDER,
  LEFT_WRIST,
  POSE_LANDMARK_COUNT,
  RIGHT_HIP,
  RIGHT_SHOULDER,
  RIGHT_WRIST,
  type PoseFrame,
  type PoseLandmark,
} from "@/lib/pose/types";

function blankLandmark(): PoseLandmark {
  return { x: 0.5, y: 0.5, visibility: 0.9 };
}

function frameAt(
  mediaTime: number,
  hands: { trailX: number; trailY: number; leadX: number; leadY: number },
): PoseFrame {
  const landmarks = Array.from({ length: POSE_LANDMARK_COUNT }, blankLandmark);
  landmarks[LEFT_SHOULDER] = { x: 0.42, y: 0.32, visibility: 0.95 };
  landmarks[RIGHT_SHOULDER] = { x: 0.58, y: 0.32, visibility: 0.95 };
  landmarks[LEFT_HIP] = { x: 0.44, y: 0.58, visibility: 0.95 };
  landmarks[RIGHT_HIP] = { x: 0.56, y: 0.58, visibility: 0.95 };
  landmarks[LEFT_WRIST] = { x: hands.leadX, y: hands.leadY, visibility: 0.92 };
  landmarks[RIGHT_WRIST] = {
    x: hands.trailX,
    y: hands.trailY,
    visibility: 0.92,
  };
  return {
    mediaTime,
    landmarks,
    crop: { x: 0, y: 0, width: 1, height: 1 },
  };
}

/** Right-handed face-on-ish path: still, takeaway, top, downswing, finish. */
function syntheticSwing(options?: {
  fps?: number;
  rehearsal?: boolean;
  startTime?: number;
}): PoseFrame[] {
  const fps = options?.fps ?? 30;
  const dt = 1 / fps;
  const start = options?.startTime ?? 0.4;
  const frames: PoseFrame[] = [];
  let t = 0;

  const pushStill = (seconds: number, x: number, y: number) => {
    const count = Math.round(seconds * fps);
    for (let i = 0; i < count; i++) {
      frames.push(
        frameAt(t, { trailX: x, trailY: y, leadX: x - 0.04, leadY: y }),
      );
      t += dt;
    }
  };

  const pushPath = (
    seconds: number,
    from: { x: number; y: number },
    to: { x: number; y: number },
    ease = (u: number) => u,
  ) => {
    const count = Math.max(2, Math.round(seconds * fps));
    for (let i = 0; i < count; i++) {
      const u = ease(i / (count - 1));
      const x = from.x + (to.x - from.x) * u;
      const y = from.y + (to.y - from.y) * u;
      frames.push(
        frameAt(t, { trailX: x, trailY: y, leadX: x - 0.04, leadY: y + 0.01 }),
      );
      t += dt;
    }
  };

  pushStill(start, 0.5, 0.62);
  if (options?.rehearsal) {
    pushPath(0.18, { x: 0.5, y: 0.62 }, { x: 0.42, y: 0.48 });
    pushPath(0.16, { x: 0.42, y: 0.48 }, { x: 0.5, y: 0.62 });
    pushStill(0.2, 0.5, 0.62);
  }
  pushPath(0.35, { x: 0.5, y: 0.62 }, { x: 0.28, y: 0.28 });
  pushPath(0.18, { x: 0.28, y: 0.28 }, { x: 0.62, y: 0.68 }, (u) => u * u);
  pushPath(0.22, { x: 0.62, y: 0.68 }, { x: 0.78, y: 0.34 });
  pushStill(0.25, 0.78, 0.34);
  return frames;
}

function audioAt(frames: PoseFrame[], impactTimeMs: number): AudioSample[] {
  return frames.map((frame) => {
    const timeMs = frame.mediaTime * 1000;
    const dist = Math.abs(timeMs - impactTimeMs);
    return { timeMs, rms: dist < 40 ? 0.28 : 0.02 };
  });
}

describe("AV clock offset", () => {
  test("defaults to 0 for every capture path until filming day", () => {
    expect(AV_CLOCK_OFFSET_MS["in-app"]).toBe(0);
    expect(AV_CLOCK_OFFSET_MS.upload).toBe(0);
    expect(AV_CLOCK_OFFSET_MS.native_slomo).toBe(0);
  });
});

describe("findSwingPhases", () => {
  test("fuses audio and motion impact and orders the five phases", () => {
    const frames = syntheticSwing();
    const guessed = findSwingPhases(frames);
    const samples = audioAt(frames, guessed.impact.timeMs);
    const phases = findSwingPhases(frames, { audioSamples: samples });

    expect(phases.address.valid).toBe(true);
    expect(phases.takeaway.valid).toBe(true);
    expect(phases.top.valid).toBe(true);
    expect(phases.impact.valid).toBe(true);
    expect(phases.finish.valid).toBe(true);
    expect(phases.address.frameIndex).toBeLessThan(phases.takeaway.frameIndex);
    expect(phases.takeaway.frameIndex).toBeLessThan(phases.top.frameIndex);
    expect(phases.top.frameIndex).toBeLessThan(phases.impact.frameIndex);
    expect(phases.impact.frameIndex).toBeLessThan(phases.finish.frameIndex);
    expect(phases.impactCandidate.value).toBe("fused");
    expect(phases.impactCandidate.valid).toBe(true);
    expect(phases.effectiveFrameRate.value).toBeGreaterThan(25);
    const lastMs = frames.at(-1)!.mediaTime * 1000;
    expect(phases.trim.value.startMs).toBe(
      Math.max(0, phases.address.timeMs - 500),
    );
    expect(phases.trim.value.endMs).toBe(
      Math.min(lastMs, phases.finish.timeMs + 500),
    );
  });

  test("uses motion-only impact with reason no audio", () => {
    const phases = findSwingPhases(syntheticSwing());
    expect(phases.impact.valid).toBe(true);
    expect(phases.impactCandidate.value).toBe("motion");
    expect(phases.impactCandidate.reason).toBe("no audio");
    expect(phases.impactCandidate.confidence).toBeLessThan(0.7);
  });

  test("drops a rehearsal waggle before the real backswing", () => {
    const withWaggle = findSwingPhases(syntheticSwing({ rehearsal: true }));
    const clean = findSwingPhases(syntheticSwing({ rehearsal: false }));
    expect(withWaggle.takeaway.timeMs).toBeGreaterThan(800);
    expect(withWaggle.address.timeMs).toBeGreaterThan(
      clean.address.timeMs - 80,
    );
    expect(withWaggle.takeaway.frameIndex).toBeLessThan(
      withWaggle.top.frameIndex,
    );
    expect(withWaggle.address.frameIndex).toBeLessThan(
      withWaggle.takeaway.frameIndex,
    );
  });

  test("marks a color-bar clip with no person as invalid", () => {
    const frames = Array.from({ length: 20 }, (_, i) => ({
      mediaTime: i / 30,
      landmarks: Array.from({ length: POSE_LANDMARK_COUNT }, () => ({
        x: 0.1,
        y: 0.1,
        visibility: 0.02,
      })),
      crop: { x: 0, y: 0, width: 1, height: 1 },
    }));
    const phases = findSwingPhases(frames);
    expect(phases.impact.valid).toBe(false);
    expect(phases.address.valid).toBe(false);
    expect(phases.impact.reason).toBe("no person");
    expect(phases.impactCandidate.valid).toBe(false);
  });

  test("flags a Slo-mo filename that arrived at 30 fps", () => {
    const phases = findSwingPhases(syntheticSwing({ fps: 30 }), {
      fileName: "IMG_120fps_slomo.mov",
      labeledFrameRate: 120,
    });
    expect(phases.sloMoReexportedAt30.value).toBe(true);
    expect(phases.sloMoReexportedAt30.reason).toMatch(/30 fps/i);
  });

  test("flags a native Slo-mo upload that landed at 30 fps", () => {
    const phases = findSwingPhases(syntheticSwing({ fps: 30 }), {
      capturePath: "native_slomo",
      labeledFrameRate: 30,
    });
    expect(phases.sloMoReexportedAt30.value).toBe(true);
  });

  test("applies the (default-zero) A/V offset to the audio candidate", () => {
    const frames = syntheticSwing();
    const motion = findSwingPhases(frames);
    const samples = audioAt(frames, motion.impact.timeMs).map((sample) => ({
      ...sample,
      timeMs: sample.timeMs + 80,
    }));
    const shifted = findSwingPhases(frames, {
      audioSamples: samples,
      avClockOffsetMs: 80,
    });
    expect(Math.abs(shifted.impact.timeMs - motion.impact.timeMs)).toBeLessThan(
      45,
    );
    expect(shifted.impactCandidate.value).toMatch(/fused|motion|audio/);
  });

  test("detects effective frame rate from timestamps, not a container label", () => {
    const phases = findSwingPhases(syntheticSwing({ fps: 60 }), {
      labeledFrameRate: 30,
    });
    expect(phases.effectiveFrameRate.value).toBeGreaterThan(50);
    expect(phases.effectiveFrameRate.reason).toBe("from frame timestamps");
  });
});
