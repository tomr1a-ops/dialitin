import type { LeadWristReconstruction } from "@/lib/engine/occlusion";
import type { ContentRect } from "@/lib/reveal/canvas-utils";
import {
  LEFT_HIP,
  LEFT_SHOULDER,
  LEFT_WRIST,
  RIGHT_HIP,
  RIGHT_SHOULDER,
  RIGHT_WRIST,
  type PoseFrame,
} from "@/lib/pose/types";

export const WRIST_TRACE_VISIBILITY = 0.5;
export const TRACE_SMOOTH_WINDOW = 5;
export const TRACE_JUMP_BODY_FRACTION = 0.08;
export const TRACE_LOW_CONFIDENCE_SURVIVAL = 0.6;
export const TRACE_SPLINE_SAMPLE_PX = 4;

export type TraceCanvasPoint = {
  x: number;
  y: number;
  dashed: boolean;
};

type ImagePoint = {
  x: number;
  y: number;
  dashed: boolean;
};

type IndexedImagePoint = ImagePoint & {
  frameIndex: number;
};

export type HandTraceBuildResult = {
  points: (ImagePoint | null)[];
  lowConfidence: boolean;
  survivalRate: number;
};

function toFullImage(frame: PoseFrame, x: number, y: number) {
  return {
    x: frame.crop.x + x * frame.crop.width,
    y: frame.crop.y + y * frame.crop.height,
  };
}

function visibleLandmark(
  frame: PoseFrame,
  index: number,
  minVisibility = WRIST_TRACE_VISIBILITY,
) {
  const point = frame.landmarks[index];
  if (!point || point.visibility < minVisibility) {
    return null;
  }
  return point;
}

/** Mean of both wrists in crop space; falls back to whichever wrist is visible. */
export function handCentroid(frame: PoseFrame): {
  x: number;
  y: number;
  visibility: number;
} | null {
  const left = visibleLandmark(frame, LEFT_WRIST);
  const right = visibleLandmark(frame, RIGHT_WRIST);
  if (left && right) {
    return {
      x: (left.x + right.x) / 2,
      y: (left.y + right.y) / 2,
      visibility: Math.min(left.visibility, right.visibility),
    };
  }
  return left ?? right;
}

/** Torso height in full-image pixels — shoulder midpoint to hip midpoint. */
export function bodyHeightPx(frame: PoseFrame): number | null {
  const ls = visibleLandmark(frame, LEFT_SHOULDER, 0.3);
  const rs = visibleLandmark(frame, RIGHT_SHOULDER, 0.3);
  const lh = visibleLandmark(frame, LEFT_HIP, 0.3);
  const rh = visibleLandmark(frame, RIGHT_HIP, 0.3);
  if (!lh && !rh) {
    return null;
  }
  const hipY = lh && rh ? (lh.y + rh.y) / 2 : (lh ?? rh)!.y;
  const hipX = lh && rh ? (lh.x + rh.x) / 2 : (lh ?? rh)!.x;
  if (!ls && !rs) {
    return null;
  }
  const shoulderY = ls && rs ? (ls.y + rs.y) / 2 : (ls ?? rs)!.y;
  const shoulderX = ls && rs ? (ls.x + rs.x) / 2 : (ls ?? rs)!.x;
  const fullHip = toFullImage(frame, hipX, hipY);
  const fullShoulder = toFullImage(frame, shoulderX, shoulderY);
  const height = Math.hypot(fullHip.x - fullShoulder.x, fullHip.y - fullShoulder.y);
  return height > 1 ? height : null;
}

/** 5-frame centered moving average in full-image space; null gaps stay null. */
export function smoothTracePath(
  points: (ImagePoint | null)[],
  windowSize = TRACE_SMOOTH_WINDOW,
): (ImagePoint | null)[] {
  const half = Math.floor(windowSize / 2);
  return points.map((point, index) => {
    if (!point) {
      return null;
    }
    let sumX = 0;
    let sumY = 0;
    let count = 0;
    let dashed = false;
    for (let j = index - half; j <= index + half; j++) {
      const neighbor = points[j];
      if (!neighbor) {
        continue;
      }
      sumX += neighbor.x;
      sumY += neighbor.y;
      count += 1;
      dashed = dashed || neighbor.dashed;
    }
    if (count === 0) {
      return null;
    }
    return {
      x: sumX / count,
      y: sumY / count,
      dashed,
    };
  });
}

/** Reject frames whose centroid jumps more than maxJump px from the last accepted point. */
export function rejectCentroidJumps(
  points: (ImagePoint | null)[],
  maxJump: number,
): (ImagePoint | null)[] {
  if (maxJump <= 0) {
    return points;
  }
  const next: (ImagePoint | null)[] = [];
  let lastGood: ImagePoint | null = null;
  for (const point of points) {
    if (!point) {
      next.push(null);
      continue;
    }
    if (
      lastGood &&
      Math.hypot(point.x - lastGood.x, point.y - lastGood.y) > maxJump
    ) {
      next.push(null);
      continue;
    }
    next.push(point);
    lastGood = point;
  }
  return next;
}

function catmullRomPoint(
  p0: IndexedImagePoint,
  p1: IndexedImagePoint,
  p2: IndexedImagePoint,
  p3: IndexedImagePoint,
  t: number,
): IndexedImagePoint {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    frameIndex: p1.frameIndex,
    dashed: p1.dashed || p2.dashed,
    x:
      0.5 *
      (2 * p1.x +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y:
      0.5 *
      (2 * p1.y +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
  };
}

/** Fit Catmull-Rom spline through contiguous runs; sample every samplePx. */
export function densifyTraceWithSpline(
  points: (ImagePoint | null)[],
  startIdx: number,
  samplePx = TRACE_SPLINE_SAMPLE_PX,
): (ImagePoint | null)[] {
  const runs: IndexedImagePoint[][] = [];
  let current: IndexedImagePoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    if (!point) {
      if (current.length > 0) {
        runs.push(current);
        current = [];
      }
      continue;
    }
    current.push({ ...point, frameIndex: startIdx + i });
  }
  if (current.length > 0) {
    runs.push(current);
  }

  const output: (ImagePoint | null)[] = points.map(() => null);

  for (const run of runs) {
    if (run.length === 1) {
      const only = run[0]!;
      output[only.frameIndex - startIdx] = {
        x: only.x,
        y: only.y,
        dashed: only.dashed,
      };
      continue;
    }

    const dense: IndexedImagePoint[] = [];
    for (let i = 0; i < run.length - 1; i++) {
      const p0 = run[Math.max(0, i - 1)]!;
      const p1 = run[i]!;
      const p2 = run[i + 1]!;
      const p3 = run[Math.min(run.length - 1, i + 2)]!;
      const segmentLength = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const steps = Math.max(1, Math.ceil(segmentLength / samplePx));
      for (let step = 0; step < steps; step++) {
        const t = step / steps;
        const sample = catmullRomPoint(p0, p1, p2, p3, t);
        sample.frameIndex = p1.frameIndex;
        dense.push(sample);
      }
    }
    const tail = run.at(-1)!;
    dense.push(tail);

    for (const sample of dense) {
      const slot = sample.frameIndex - startIdx;
      if (slot < 0 || slot >= output.length) {
        continue;
      }
      const existing = output[slot];
      if (!existing) {
        output[slot] = {
          x: sample.x,
          y: sample.y,
          dashed: sample.dashed,
        };
        continue;
      }
      output[slot] = {
        x: (existing.x + sample.x) / 2,
        y: (existing.y + sample.y) / 2,
        dashed: existing.dashed || sample.dashed,
      };
    }
  }

  return output;
}

function markOcclusionBridges(points: (ImagePoint | null)[]): (ImagePoint | null)[] {
  let hadGap = false;
  return points.map((point) => {
    if (!point) {
      hadGap = true;
      return null;
    }
    if (hadGap) {
      hadGap = false;
      return { ...point, dashed: true };
    }
    return point;
  });
}

export function buildHandTrace(
  keypoints: PoseFrame[],
  options: {
    startIdx: number;
    endIdx: number;
    wristReconstruction: LeadWristReconstruction | null;
    leadWrist: number;
  },
): HandTraceBuildResult {
  const { startIdx, endIdx, wristReconstruction } = options;
  const raw: (ImagePoint | null)[] = [];

  for (let i = startIdx; i <= endIdx; i++) {
    const frame = keypoints[i];
    if (!frame) {
      raw.push(null);
      continue;
    }

    const recon = wristReconstruction?.frames.find((f) => f.frameIndex === i);
    if (recon?.valid) {
      raw.push({
        ...toFullImage(frame, recon.x, recon.y),
        dashed: recon.reason !== "visible",
      });
      continue;
    }

    const centroid = handCentroid(frame);
    if (!centroid) {
      raw.push(null);
      continue;
    }

    raw.push({
      ...toFullImage(frame, centroid.x, centroid.y),
      dashed: false,
    });
  }

  const totalFrames = raw.length;
  const initialSurvivors = raw.filter(Boolean).length;
  const referenceFrame = keypoints[startIdx] ?? keypoints.find(Boolean);
  const bodyHeight = referenceFrame ? bodyHeightPx(referenceFrame) : null;
  const maxJump =
    bodyHeight != null ? bodyHeight * TRACE_JUMP_BODY_FRACTION : Infinity;

  const jumpFiltered = rejectCentroidJumps(raw, maxJump);
  const bridged = markOcclusionBridges(jumpFiltered);
  const smoothed = smoothTracePath(bridged);
  const splined = densifyTraceWithSpline(smoothed, startIdx);
  const survivors = splined.filter(Boolean).length;
  const survivalRate = totalFrames === 0 ? 0 : survivors / totalFrames;
  const lowConfidence =
    totalFrames > 0 && survivalRate < TRACE_LOW_CONFIDENCE_SURVIVAL;

  if (lowConfidence && initialSurvivors > 0) {
    return {
      points: splined,
      lowConfidence: true,
      survivalRate,
    };
  }

  return {
    points: splined,
    lowConfidence,
    survivalRate,
  };
}

/** @deprecated Use buildHandTrace — kept for tests and pelvis traces. */
export function buildWristTrace(
  keypoints: PoseFrame[],
  options: {
    leadWrist: number;
    startIdx: number;
    endIdx: number;
    wristReconstruction: LeadWristReconstruction | null;
  },
): (ImagePoint | null)[] {
  return buildHandTrace(keypoints, options).points;
}

export function evaluateHandTraceConfidence(
  keypoints: PoseFrame[],
  options: {
    phases: { address: { valid: boolean; frameIndex: number }; top: { valid: boolean; frameIndex: number }; impact: { valid: boolean; frameIndex: number } };
    handedness: "left" | "right";
    wristReconstruction: LeadWristReconstruction | null;
  },
): { lowConfidence: boolean; survivalRate: number } {
  const { phases, handedness, wristReconstruction } = options;
  const topIdx = phases.top.valid ? phases.top.frameIndex : null;
  const impactIdx = phases.impact.valid ? phases.impact.frameIndex : null;
  if (topIdx == null || impactIdx == null) {
    return { lowConfidence: true, survivalRate: 0 };
  }
  const addressIdx = phases.address.valid ? phases.address.frameIndex : 0;
  const leadWrist = leadWristIndex(handedness);
  const backswing = buildHandTrace(keypoints, {
    leadWrist,
    startIdx: addressIdx,
    endIdx: topIdx,
    wristReconstruction,
  });
  const downswing = buildHandTrace(keypoints, {
    leadWrist,
    startIdx: topIdx,
    endIdx: impactIdx,
    wristReconstruction,
  });
  const lowConfidence = backswing.lowConfidence || downswing.lowConfidence;
  const survivalRate = Math.min(backswing.survivalRate, downswing.survivalRate);
  return { lowConfidence, survivalRate };
}

export function buildPelvisTrace(
  keypoints: PoseFrame[],
  startIdx: number,
  endIdx: number,
): (ImagePoint | null)[] {
  const path: (ImagePoint | null)[] = [];

  for (let i = startIdx; i <= endIdx; i++) {
    const frame = keypoints[i];
    if (!frame) {
      path.push(null);
      continue;
    }
    const lh = frame.landmarks[LEFT_HIP];
    const rh = frame.landmarks[RIGHT_HIP];
    if (
      !lh ||
      !rh ||
      lh.visibility < WRIST_TRACE_VISIBILITY ||
      rh.visibility < WRIST_TRACE_VISIBILITY
    ) {
      path.push(null);
      continue;
    }
    const cx = (lh.x + rh.x) / 2;
    const cy = (lh.y + rh.y) / 2;
    path.push({
      ...toFullImage(frame, cx, cy),
      dashed: false,
    });
  }

  return smoothTracePath(path);
}

export function traceToCanvas(
  imagePath: (ImagePoint | null)[],
  rect: ContentRect,
): (TraceCanvasPoint | null)[] {
  return imagePath.map((point) => {
    if (!point) {
      return null;
    }
    return {
      x: rect.x + (point.x / rect.videoWidth) * rect.width,
      y: rect.y + (point.y / rect.videoHeight) * rect.height,
      dashed: point.dashed,
    };
  });
}

export function leadWristIndex(handedness: "left" | "right") {
  return handedness === "right" ? LEFT_WRIST : RIGHT_WRIST;
}
