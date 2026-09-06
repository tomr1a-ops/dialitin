import type { LeadWristReconstruction } from "@/lib/engine/occlusion";
import type { SwingPhases } from "@/lib/engine/phases";
import {
  REVEAL_COLORS,
  type ContentRect,
} from "@/lib/reveal/canvas-utils";
import {
  buildPelvisTrace,
  buildWristTrace,
  leadWristIndex,
  traceToCanvas,
  type TraceCanvasPoint,
} from "@/lib/reveal/trace-path";
import type { PoseFrame } from "@/lib/pose/types";

const TRACE_LINE_WIDTH = 2;
const PELVIS_LINE_WIDTH = 1.5;
const TRACE_OPACITY = 0.6;

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
    },
  ) {
    const { keypoints, phases, handedness, wristReconstruction, currentTime, rect } =
      options;

    const topIdx = phases.top.valid ? phases.top.frameIndex : null;
    const impactIdx = phases.impact.valid ? phases.impact.frameIndex : null;
    if (topIdx == null || impactIdx == null) {
      return;
    }

    const addressIdx = phases.address.valid ? phases.address.frameIndex : 0;
    const currentIdx = keypoints.findIndex(
      (kp) => Math.abs(kp.mediaTime - currentTime) < 0.02,
    );
    const endIdx = currentIdx >= 0 ? currentIdx : keypoints.length - 1;
    const clipEnd = Math.min(endIdx, impactIdx);
    const leadWrist = leadWristIndex(handedness);

    const backswingImage = buildWristTrace(keypoints, {
      leadWrist,
      startIdx: addressIdx,
      endIdx: Math.min(topIdx, clipEnd),
      wristReconstruction,
    });
    const downswingImage = buildWristTrace(keypoints, {
      leadWrist,
      startIdx: topIdx,
      endIdx: clipEnd,
      wristReconstruction,
    });
    const pelvisImage = buildPelvisTrace(keypoints, addressIdx, clipEnd);

    drawTraceSegment(ctx, traceToCanvas(backswingImage, rect), {
      color: REVEAL_COLORS.backswing,
      lineWidth: TRACE_LINE_WIDTH,
    });
    drawTraceSegment(ctx, traceToCanvas(downswingImage, rect), {
      color: REVEAL_COLORS.downswing,
      lineWidth: TRACE_LINE_WIDTH,
    });
    drawTraceSegment(ctx, traceToCanvas(pelvisImage, rect), {
      color: REVEAL_COLORS.pelvis,
      lineWidth: PELVIS_LINE_WIDTH,
    });
  },
};

function drawTraceSegment(
  ctx: CanvasRenderingContext2D,
  points: (TraceCanvasPoint | null)[],
  options: { color: string; lineWidth: number },
) {
  ctx.save();
  ctx.strokeStyle = options.color;
  ctx.lineWidth = options.lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalAlpha = TRACE_OPACITY;

  let started = false;
  let last: TraceCanvasPoint | null = null;

  const flush = () => {
    if (started) {
      ctx.stroke();
    }
    started = false;
  };

  for (const point of points) {
    if (!point) {
      flush();
      last = null;
      continue;
    }

    if (!started) {
      ctx.beginPath();
      ctx.setLineDash(point.dashed ? [6, 4] : []);
      ctx.moveTo(point.x, point.y);
      started = true;
      last = point;
      continue;
    }

    if (point.dashed !== last!.dashed) {
      flush();
      ctx.beginPath();
      ctx.setLineDash(point.dashed ? [6, 4] : []);
      ctx.moveTo(last!.x, last!.y);
      ctx.lineTo(point.x, point.y);
      started = true;
      last = point;
      continue;
    }

    ctx.setLineDash(point.dashed ? [6, 4] : []);
    ctx.lineTo(point.x, point.y);
    last = point;
  }

  flush();
  ctx.restore();
}
