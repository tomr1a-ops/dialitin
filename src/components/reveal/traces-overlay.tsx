import {
  LEFT_HIP,
  LEFT_WRIST,
  RIGHT_HIP,
  RIGHT_WRIST,
  type PoseFrame,
} from "@/lib/pose/types";
import type { LeadWristReconstruction } from "@/lib/engine/occlusion";
import type { SwingPhases } from "@/lib/engine/phases";
import {
  normToCanvas,
  REVEAL_COLORS,
  type ContentRect,
} from "@/lib/reveal/canvas-utils";

export const TracesOverlay = {
  draw(
    ctx: CanvasRenderingContext2D,
    options: {
      keypoints: PoseFrame[];
      phases: SwingPhases;
      handedness: "left" | "right";
      wristReconstruction: LeadWristReconstruction | null;
      currentTime: number;
      rect: ContentRect;
      frame: PoseFrame;
    },
  ) {
    const {
      keypoints,
      phases,
      handedness,
      wristReconstruction,
      currentTime,
      rect,
      frame,
    } = options;

    const topIdx = phases.top.valid ? phases.top.frameIndex : null;
    const impactIdx = phases.impact.valid ? phases.impact.frameIndex : null;
    if (topIdx == null || impactIdx == null) {
      return;
    }

    const leadWrist = handedness === "right" ? LEFT_WRIST : RIGHT_WRIST;
    const currentIdx = keypoints.findIndex(
      (kp) => Math.abs(kp.mediaTime - currentTime) < 0.02,
    );
    const endIdx = currentIdx >= 0 ? currentIdx : keypoints.length - 1;

    drawHandPath(ctx, {
      keypoints,
      wristReconstruction,
      leadWrist,
      addressIdx: phases.address.valid ? phases.address.frameIndex : 0,
      topIdx,
      impactIdx: Math.min(endIdx, impactIdx),
      rect,
      frame,
    });

    drawPelvisTrace(ctx, {
      keypoints,
      startIdx: phases.address.valid ? phases.address.frameIndex : 0,
      endIdx: Math.min(endIdx, impactIdx),
      rect,
      frame,
    });
  },
};

function drawHandPath(
  ctx: CanvasRenderingContext2D,
  options: {
    keypoints: PoseFrame[];
    wristReconstruction: LeadWristReconstruction | null;
    leadWrist: number;
    addressIdx: number;
    topIdx: number;
    impactIdx: number;
    rect: ContentRect;
    frame: PoseFrame;
  },
) {
  const {
    keypoints,
    wristReconstruction,
    leadWrist,
    addressIdx,
    topIdx,
    impactIdx,
    rect,
    frame,
  } = options;

  ctx.save();
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";

  // Backswing trace
  ctx.strokeStyle = REVEAL_COLORS.backswing;
  ctx.beginPath();
  let started = false;
  for (let i = addressIdx; i <= Math.min(topIdx, impactIdx); i++) {
    const pt = wristPoint(keypoints, wristReconstruction, leadWrist, i, frame, rect);
    if (!pt) {
      continue;
    }
    if (!started) {
      ctx.moveTo(pt.x, pt.y);
      started = true;
    } else {
      ctx.setLineDash(pt.dashed ? [6, 4] : []);
      ctx.lineTo(pt.x, pt.y);
    }
  }
  ctx.stroke();

  // Downswing trace
  ctx.strokeStyle = REVEAL_COLORS.downswing;
  ctx.beginPath();
  started = false;
  for (let i = topIdx; i <= impactIdx; i++) {
    const pt = wristPoint(keypoints, wristReconstruction, leadWrist, i, frame, rect);
    if (!pt) {
      continue;
    }
    if (!started) {
      ctx.moveTo(pt.x, pt.y);
      started = true;
    } else {
      ctx.setLineDash(pt.dashed ? [6, 4] : []);
      ctx.lineTo(pt.x, pt.y);
    }
  }
  ctx.stroke();
  ctx.restore();
}

function wristPoint(
  keypoints: PoseFrame[],
  wristReconstruction: LeadWristReconstruction | null,
  leadWrist: number,
  frameIndex: number,
  displayFrame: PoseFrame,
  rect: ContentRect,
): { x: number; y: number; dashed: boolean } | null {
  const recon = wristReconstruction?.frames[frameIndex];
  if (recon?.valid) {
    const c = normToCanvas(recon.x, recon.y, displayFrame, rect);
    return { x: c.x, y: c.y, dashed: recon.reason !== "visible" };
  }
  const kp = keypoints[frameIndex];
  if (!kp) {
    return null;
  }
  const point = kp.landmarks[leadWrist];
  if (!point || point.visibility < 0.2) {
    return null;
  }
  const c = normToCanvas(point.x, point.y, displayFrame, rect);
  return { x: c.x, y: c.y, dashed: false };
}

function drawPelvisTrace(
  ctx: CanvasRenderingContext2D,
  options: {
    keypoints: PoseFrame[];
    startIdx: number;
    endIdx: number;
    rect: ContentRect;
    frame: PoseFrame;
  },
) {
  const { keypoints, startIdx, endIdx, rect, frame } = options;
  ctx.save();
  ctx.strokeStyle = REVEAL_COLORS.pelvis;
  ctx.lineWidth = 2;
  ctx.setLineDash([]);
  ctx.beginPath();
  let started = false;
  for (let i = startIdx; i <= endIdx; i++) {
    const kp = keypoints[i];
    if (!kp) {
      continue;
    }
    const lh = kp.landmarks[LEFT_HIP];
    const rh = kp.landmarks[RIGHT_HIP];
    if (!lh || !rh || lh.visibility < 0.2 || rh.visibility < 0.2) {
      continue;
    }
    const cx = (lh.x + rh.x) / 2;
    const cy = (lh.y + rh.y) / 2;
    const c = normToCanvas(cx, cy, frame, rect);
    if (!started) {
      ctx.moveTo(c.x, c.y);
      started = true;
    } else {
      ctx.lineTo(c.x, c.y);
    }
  }
  ctx.stroke();
  ctx.restore();
}
