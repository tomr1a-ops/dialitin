import type { PoseFrame } from "@/lib/pose/types";
import { POSE_CONNECTIONS } from "@/lib/pose/connections";
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

export type ContentRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  videoWidth: number;
  videoHeight: number;
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

export function toCanvasPoint(
  frame: PoseFrame,
  index: number,
  rect: ContentRect,
) {
  const point = frame.landmarks[index];
  if (!point || point.visibility < 0.15) {
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

export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  frame: PoseFrame,
  rect: ContentRect,
  options: {
    color?: string;
    opacity?: number;
    lineWidth?: number;
    jointRadius?: number;
  } = {},
) {
  const color = options.color ?? REVEAL_COLORS.skeleton;
  const opacity = options.opacity ?? 1;
  const lineWidth = options.lineWidth ?? 3;
  const jointRadius = options.jointRadius ?? 3.5;

  ctx.save();
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.globalAlpha = opacity;

  for (const [start, end] of POSE_CONNECTIONS) {
    const a = toCanvasPoint(frame, start, rect);
    const b = toCanvasPoint(frame, end, rect);
    if (!a || !b) {
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  for (let i = 0; i < frame.landmarks.length; i++) {
    const point = toCanvasPoint(frame, i, rect);
    if (!point) {
      continue;
    }
    ctx.beginPath();
    ctx.arc(point.x, point.y, jointRadius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
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
