import type { LeadWristReconstruction } from "@/lib/engine/occlusion";
import type { ContentRect } from "@/lib/reveal/canvas-utils";
import {
  LEFT_HIP,
  LEFT_WRIST,
  RIGHT_HIP,
  RIGHT_WRIST,
  type PoseFrame,
} from "@/lib/pose/types";

export const WRIST_TRACE_VISIBILITY = 0.5;
export const TRACE_SMOOTH_WINDOW = 5;

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

function toFullImage(frame: PoseFrame, x: number, y: number) {
  return {
    x: frame.crop.x + x * frame.crop.width,
    y: frame.crop.y + y * frame.crop.height,
  };
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

export function buildWristTrace(
  keypoints: PoseFrame[],
  options: {
    leadWrist: number;
    startIdx: number;
    endIdx: number;
    wristReconstruction: LeadWristReconstruction | null;
  },
): (ImagePoint | null)[] {
  const { leadWrist, startIdx, endIdx, wristReconstruction } = options;
  const path: (ImagePoint | null)[] = [];

  for (let i = startIdx; i <= endIdx; i++) {
    const frame = keypoints[i];
    if (!frame) {
      path.push(null);
      continue;
    }

    const recon = wristReconstruction?.frames.find((f) => f.frameIndex === i);
    if (recon?.valid) {
      path.push({
        ...toFullImage(frame, recon.x, recon.y),
        dashed: recon.reason !== "visible",
      });
      continue;
    }

    const point = frame.landmarks[leadWrist];
    if (!point || point.visibility < WRIST_TRACE_VISIBILITY) {
      path.push(null);
      continue;
    }

    path.push({
      ...toFullImage(frame, point.x, point.y),
      dashed: false,
    });
  }

  return smoothTracePath(path);
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
