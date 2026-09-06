import type { LeadWristReconstruction } from "@/lib/engine/occlusion";
import type { SwingPhases } from "@/lib/engine/phases";
import {
  REVEAL_COLORS,
  type ContentRect,
} from "@/lib/reveal/canvas-utils";
import {
  buildHandTrace,
  buildPelvisTrace,
  leadWristIndex,
  traceToCanvas,
  type TraceCanvasPoint,
} from "@/lib/reveal/trace-path";
import type { PoseFrame } from "@/lib/pose/types";

const TRACE_LINE_WIDTH = 2;
const PELVIS_LINE_WIDTH = 1.5;
const TRACE_OPACITY = 0.6;
const TRACE_LOW_CONFIDENCE_OPACITY = 0.28;

export type TraceDrawResult = {
  lowConfidence: boolean;
};

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
  ): TraceDrawResult {
    const { keypoints, phases, handedness, wristReconstruction, currentTime, rect } =
      options;

    const topIdx = phases.top.valid ? phases.top.frameIndex : null;
    const impactIdx = phases.impact.valid ? phases.impact.frameIndex : null;
    if (topIdx == null || impactIdx == null) {
      return { lowConfidence: true };
    }

    const addressIdx = phases.address.valid ? phases.address.frameIndex : 0;
    const currentIdx = keypoints.findIndex(
      (kp) => Math.abs(kp.mediaTime - currentTime) < 0.02,
    );
    const endIdx = currentIdx >= 0 ? currentIdx : keypoints.length - 1;
    const clipEnd = Math.min(endIdx, impactIdx);
    const leadWrist = leadWristIndex(handedness);

    const backswing = buildHandTrace(keypoints, {
      leadWrist,
      startIdx: addressIdx,
      endIdx: Math.min(topIdx, clipEnd),
      wristReconstruction,
    });
    const downswing = buildHandTrace(keypoints, {
      leadWrist,
      startIdx: topIdx,
      endIdx: clipEnd,
      wristReconstruction,
    });
    const pelvisImage = buildPelvisTrace(keypoints, addressIdx, clipEnd);
    const lowConfidence = backswing.lowConfidence || downswing.lowConfidence;
    const traceOpacity = lowConfidence
      ? TRACE_LOW_CONFIDENCE_OPACITY
      : TRACE_OPACITY;

    drawTraceSegment(ctx, traceToCanvas(backswing.points, rect), {
      color: REVEAL_COLORS.backswing,
      lineWidth: TRACE_LINE_WIDTH,
      opacity: traceOpacity,
    });
    drawTraceSegment(ctx, traceToCanvas(downswing.points, rect), {
      color: REVEAL_COLORS.downswing,
      lineWidth: TRACE_LINE_WIDTH,
      opacity: traceOpacity,
    });
    drawTraceSegment(ctx, traceToCanvas(pelvisImage, rect), {
      color: REVEAL_COLORS.pelvis,
      lineWidth: PELVIS_LINE_WIDTH,
      opacity: traceOpacity,
    });

    return { lowConfidence };
  },
};

function drawTraceSegment(
  ctx: CanvasRenderingContext2D,
  points: (TraceCanvasPoint | null)[],
  options: { color: string; lineWidth: number; opacity?: number },
) {
  ctx.save();
  ctx.strokeStyle = options.color;
  ctx.lineWidth = options.lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalAlpha = options.opacity ?? TRACE_OPACITY;

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
