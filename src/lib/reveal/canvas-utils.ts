import type { PoseFrame } from "@/lib/pose/types";
import {
  GOLFER_HEAD,
  GOLFER_SKELETON_CONNECTIONS,
  GOLFER_SKELETON_JOINTS,
  golferJointLandmarkIndex,
  LEFT_EAR,
  RIGHT_EAR,
  type GolferSkeletonJoint,
} from "@/lib/pose/golfer-skeleton";
import { TRACE_SMOOTH_WINDOW } from "@/lib/reveal/trace-path";
import {
  LEFT_HIP,
  LEFT_SHOULDER,
  RIGHT_HIP,
  RIGHT_SHOULDER,
} from "@/lib/pose/types";

export const REVEAL_COLORS = {
  skeleton: "#c8f542",
  tushLine: "#f3c36a",
  pelvis: "#6ecbff",
  shoulder: "#e8a0ff",
  hip: "#6ecbff",
  backswing: "#c8f542",
  downswing: "#f3c36a",
  target: "#6ecbff",
  fault: "#ff6b6b",
  reconstructed: "#c8f542",
} as const;

export const SKELETON_SMOOTH_WINDOW = TRACE_SMOOTH_WINDOW;
export const BONE_LENGTH_CHANGE_THRESHOLD = 0.4;
const JOINT_VISIBILITY = 0.15;
const FADED_JOINT_OPACITY = 0.45;

export type ContentRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  videoWidth: number;
  videoHeight: number;
};

type ImageJoint = {
  x: number;
  y: number;
  visibility: number;
};

export function contentRect(video: HTMLVideoElement): ContentRect {
  const elW = video.clientWidth;
  const elH = video.clientHeight;
  const vw = Math.max(video.videoWidth, 1);
  const vh = Math.max(video.videoHeight, 1);
  const scale = Math.min(elW / vw, elH / vh);
  const width = vw * scale;
  const height = vh * scale;
  return {
    x: (elW - width) / 2,
    y: (elH - height) / 2,
    width,
    height,
    videoWidth: vw,
    videoHeight: vh,
  };
}

function toFullImage(frame: PoseFrame, x: number, y: number) {
  return {
    x: frame.crop.x + x * frame.crop.width,
    y: frame.crop.y + y * frame.crop.height,
  };
}

function rawJointInImage(
  frame: PoseFrame,
  joint: GolferSkeletonJoint,
): ImageJoint | null {
  if (joint === GOLFER_HEAD) {
    const leftEar = frame.landmarks[LEFT_EAR];
    const rightEar = frame.landmarks[RIGHT_EAR];
    if (!leftEar || !rightEar) {
      return null;
    }
    const visibility = Math.min(leftEar.visibility, rightEar.visibility);
    if (visibility < JOINT_VISIBILITY) {
      return null;
    }
    const cx = (leftEar.x + rightEar.x) / 2;
    const cy = (leftEar.y + rightEar.y) / 2;
    return { ...toFullImage(frame, cx, cy), visibility };
  }

  const index = golferJointLandmarkIndex(joint);
  if (index == null) {
    return null;
  }
  const point = frame.landmarks[index];
  if (!point || point.visibility < JOINT_VISIBILITY) {
    return null;
  }
  return { ...toFullImage(frame, point.x, point.y), visibility: point.visibility };
}

/** 5-frame centered moving average per joint in full-image space. */
export function smoothGolferJoints(
  keypoints: PoseFrame[],
  windowSize = SKELETON_SMOOTH_WINDOW,
): (Partial<Record<GolferSkeletonJoint, ImageJoint>> | null)[] {
  const half = Math.floor(windowSize / 2);
  const raw = keypoints.map((frame) => {
    const joints: Partial<Record<GolferSkeletonJoint, ImageJoint>> = {};
    for (const joint of GOLFER_SKELETON_JOINTS) {
      const point = rawJointInImage(frame, joint);
      if (point) {
        joints[joint] = point;
      }
    }
    return Object.keys(joints).length > 0 ? joints : null;
  });

  return raw.map((frameJoints, index) => {
    if (!frameJoints) {
      return null;
    }
    const smoothed: Partial<Record<GolferSkeletonJoint, ImageJoint>> = {};
    for (const joint of GOLFER_SKELETON_JOINTS) {
      if (!frameJoints[joint]) {
        continue;
      }
      let sumX = 0;
      let sumY = 0;
      let visSum = 0;
      let count = 0;
      for (let j = index - half; j <= index + half; j++) {
        const neighbor = raw[j]?.[joint];
        if (!neighbor) {
          continue;
        }
        sumX += neighbor.x;
        sumY += neighbor.y;
        visSum += neighbor.visibility;
        count += 1;
      }
      if (count === 0) {
        continue;
      }
      smoothed[joint] = {
        x: sumX / count,
        y: sumY / count,
        visibility: visSum / count,
      };
    }
    return Object.keys(smoothed).length > 0 ? smoothed : null;
  });
}

function boneLength(
  a: ImageJoint | undefined,
  b: ImageJoint | undefined,
): number | null {
  if (!a || !b) {
    return null;
  }
  const length = Math.hypot(a.x - b.x, a.y - b.y);
  return length > 0 ? length : null;
}

function shouldSkipBone(
  current: Partial<Record<GolferSkeletonJoint, ImageJoint>> | null,
  previous: Partial<Record<GolferSkeletonJoint, ImageJoint>> | null,
  start: GolferSkeletonJoint,
  end: GolferSkeletonJoint,
): boolean {
  const currentLength = boneLength(current?.[start], current?.[end]);
  const previousLength = boneLength(previous?.[start], previous?.[end]);
  if (currentLength == null || previousLength == null || previousLength <= 0) {
    return false;
  }
  const change = Math.abs(currentLength - previousLength) / previousLength;
  return change > BONE_LENGTH_CHANGE_THRESHOLD;
}

function jointToCanvas(
  point: ImageJoint,
  frame: PoseFrame,
  rect: ContentRect,
) {
  return {
    x: rect.x + (point.x / rect.videoWidth) * rect.width,
    y: rect.y + (point.y / rect.videoHeight) * rect.height,
    visibility: point.visibility,
  };
}

export function toCanvasPoint(
  frame: PoseFrame,
  index: number,
  rect: ContentRect,
) {
  const point = frame.landmarks[index];
  if (!point || point.visibility < JOINT_VISIBILITY) {
    return null;
  }
  const fullX = frame.crop.x + point.x * frame.crop.width;
  const fullY = frame.crop.y + point.y * frame.crop.height;
  return {
    x: rect.x + (fullX / rect.videoWidth) * rect.width,
    y: rect.y + (fullY / rect.videoHeight) * rect.height,
    visibility: point.visibility,
  };
}

/** Map crop-normalized landmark coords through the frame's own crop → canvas. */
export function landmarkToCanvas(
  frame: PoseFrame,
  x: number,
  y: number,
  rect: ContentRect,
) {
  const fullX = frame.crop.x + x * frame.crop.width;
  const fullY = frame.crop.y + y * frame.crop.height;
  return {
    x: rect.x + (fullX / rect.videoWidth) * rect.width,
    y: rect.y + (fullY / rect.videoHeight) * rect.height,
  };
}

/** @deprecated Use landmarkToCanvas — same math, name clarifies per-frame crop. */
export function normToCanvas(
  x: number,
  y: number,
  frame: PoseFrame,
  rect: ContentRect,
) {
  return landmarkToCanvas(frame, x, y, rect);
}

export function drawGolferSkeleton(
  ctx: CanvasRenderingContext2D,
  keypoints: PoseFrame[],
  frameIndex: number,
  rect: ContentRect,
  options: {
    color?: string;
    opacity?: number;
    lineWidth?: number;
    jointRadius?: number;
    smoothedJoints?: ReturnType<typeof smoothGolferJoints>;
  } = {},
) {
  const frame = keypoints[frameIndex];
  if (!frame) {
    return;
  }

  const color = options.color ?? REVEAL_COLORS.skeleton;
  const opacity = options.opacity ?? 1;
  const lineWidth = options.lineWidth ?? 3;
  const jointRadius = options.jointRadius ?? 3.5;
  const smoothed =
    options.smoothedJoints ?? smoothGolferJoints(keypoints, SKELETON_SMOOTH_WINDOW);
  const current = smoothed[frameIndex];
  const previous = frameIndex > 0 ? smoothed[frameIndex - 1] : null;

  if (!current) {
    return;
  }

  ctx.save();
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.globalAlpha = opacity;

  for (const [start, end] of GOLFER_SKELETON_CONNECTIONS) {
    if (shouldSkipBone(current, previous, start, end)) {
      continue;
    }
    const a = current[start];
    const b = current[end];
    if (!a || !b) {
      continue;
    }
    const canvasA = jointToCanvas(a, frame, rect);
    const canvasB = jointToCanvas(b, frame, rect);
    ctx.beginPath();
    ctx.moveTo(canvasA.x, canvasA.y);
    ctx.lineTo(canvasB.x, canvasB.y);
    ctx.stroke();
  }

  for (const joint of GOLFER_SKELETON_JOINTS) {
    const point = current[joint];
    if (!point) {
      continue;
    }
    const canvasPoint = jointToCanvas(point, frame, rect);
    const faded = GOLFER_SKELETON_CONNECTIONS.some(([start, end]) => {
      if (start !== joint && end !== joint) {
        return false;
      }
      return shouldSkipBone(current, previous, start, end);
    });
    ctx.globalAlpha = opacity * (faded ? FADED_JOINT_OPACITY : 1);
    ctx.beginPath();
    ctx.arc(canvasPoint.x, canvasPoint.y, jointRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = opacity;
  }

  ctx.restore();
}

/** Golfer-facing 12-joint skeleton with smoothing and bone-length gate. */
export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  frameOrKeypoints: PoseFrame | PoseFrame[],
  rect: ContentRect,
  options: {
    color?: string;
    opacity?: number;
    lineWidth?: number;
    jointRadius?: number;
    frameIndex?: number;
    smoothedJoints?: ReturnType<typeof smoothGolferJoints>;
  } = {},
) {
  if (Array.isArray(frameOrKeypoints)) {
    const frameIndex =
      options.frameIndex ??
      Math.max(0, frameOrKeypoints.length - 1);
    drawGolferSkeleton(ctx, frameOrKeypoints, frameIndex, rect, options);
    return;
  }

  drawGolferSkeleton(ctx, [frameOrKeypoints], 0, rect, options);
}

export function tushLineXAtAddress(
  frame: PoseFrame,
  handedness: "left" | "right",
): number | null {
  const trailHip = handedness === "right" ? RIGHT_HIP : LEFT_HIP;
  const point = frame.landmarks[trailHip];
  if (!point || point.visibility < 0.35) {
    return null;
  }
  return point.x;
}

export function pelvisCenter(frame: PoseFrame, rect: ContentRect) {
  const lh = toCanvasPoint(frame, LEFT_HIP, rect);
  const rh = toCanvasPoint(frame, RIGHT_HIP, rect);
  if (!lh || !rh) {
    return null;
  }
  return { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 };
}

export function drawTushLine(
  ctx: CanvasRenderingContext2D,
  addressFrame: PoseFrame,
  rect: ContentRect,
  tushLineX: number,
  color = REVEAL_COLORS.tushLine,
) {
  const top = landmarkToCanvas(addressFrame, tushLineX, 0.05, rect);
  const bottom = landmarkToCanvas(addressFrame, tushLineX, 0.95, rect);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.6;
  ctx.lineCap = "round";
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(top.x, top.y);
  ctx.lineTo(bottom.x, bottom.y);
  ctx.stroke();
  ctx.restore();
}

/** Face-on address hip-center vertical reference for hip slide faults. */
export function drawAddressHipReferenceLine(
  ctx: CanvasRenderingContext2D,
  addressFrame: PoseFrame,
  rect: ContentRect,
  color = REVEAL_COLORS.tushLine,
) {
  const lh = addressFrame.landmarks[LEFT_HIP];
  const rh = addressFrame.landmarks[RIGHT_HIP];
  if (!lh || !rh || lh.visibility < 0.35 || rh.visibility < 0.35) {
    return;
  }
  const hipCenterX = (lh.x + rh.x) / 2;
  const top = landmarkToCanvas(addressFrame, hipCenterX, 0.05, rect);
  const bottom = landmarkToCanvas(addressFrame, hipCenterX, 0.95, rect);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.6;
  ctx.lineCap = "round";
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(top.x, top.y);
  ctx.lineTo(bottom.x, bottom.y);
  ctx.stroke();
  ctx.restore();
}

export function drawShoulderHipLines(
  ctx: CanvasRenderingContext2D,
  frame: PoseFrame,
  rect: ContentRect,
) {
  const ls = toCanvasPoint(frame, LEFT_SHOULDER, rect);
  const rs = toCanvasPoint(frame, RIGHT_SHOULDER, rect);
  const lh = toCanvasPoint(frame, LEFT_HIP, rect);
  const rh = toCanvasPoint(frame, RIGHT_HIP, rect);

  ctx.save();
  ctx.lineWidth = 2;
  ctx.lineCap = "round";

  if (ls && rs) {
    ctx.strokeStyle = REVEAL_COLORS.shoulder;
    ctx.beginPath();
    ctx.moveTo(ls.x, ls.y);
    ctx.lineTo(rs.x, rs.y);
    ctx.stroke();
  }
  if (lh && rh) {
    ctx.strokeStyle = REVEAL_COLORS.hip;
    ctx.beginPath();
    ctx.moveTo(lh.x, lh.y);
    ctx.lineTo(rh.x, rh.y);
    ctx.stroke();
  }
  ctx.restore();
}

/** Ring on ball when blob/detector saw it at address (Phase 2e). */
export function drawBallRing(
  ctx: CanvasRenderingContext2D,
  centroid: { x: number; y: number },
  rect: ContentRect,
  radiusPx = 14,
) {
  const x = rect.x + centroid.x * rect.width;
  const y = rect.y + centroid.y * rect.height;
  ctx.save();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2.5;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.arc(x, y, radiusPx, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function stanceWidthNorm(frame: PoseFrame): number {
  const la = frame.landmarks[27];
  const ra = frame.landmarks[28];
  if (!la || !ra || la.visibility < 0.2 || ra.visibility < 0.2) {
    return 0.15;
  }
  return Math.max(Math.abs(ra.x - la.x), 0.08);
}

export function resizeCanvasToVideo(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
) {
  const w = video.clientWidth;
  const h = video.clientHeight;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}

export function poseFrameIndex(keypoints: PoseFrame[], frame: PoseFrame): number {
  const direct = keypoints.indexOf(frame);
  if (direct >= 0) {
    return direct;
  }
  let best = 0;
  let bestDelta = Infinity;
  for (let i = 0; i < keypoints.length; i++) {
    const delta = Math.abs(keypoints[i]!.mediaTime - frame.mediaTime);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = i;
    }
  }
  return best;
}
