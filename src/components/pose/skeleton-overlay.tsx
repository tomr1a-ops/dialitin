"use client";

import { useEffect, useMemo, useRef } from "react";
import { POSE_CONNECTIONS } from "@/lib/pose/connections";
import {
  contentRect,
  drawGolferSkeleton,
  smoothGolferJoints,
} from "@/lib/reveal/canvas-utils";
import { nearestPoseFrame } from "@/lib/pose/nearest-frame";
import type { PoseFrame } from "@/lib/pose/types";

const SKELETON = "#c8f542";
const JOINT_VISIBILITY = 0.15;

function toCanvas(
  frame: PoseFrame,
  index: number,
  rect: ReturnType<typeof contentRect>,
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
  };
}

function drawFullSkeleton(
  ctx: CanvasRenderingContext2D,
  frame: PoseFrame,
  rect: ReturnType<typeof contentRect>,
) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.strokeStyle = SKELETON;
  ctx.fillStyle = SKELETON;

  for (const [start, end] of POSE_CONNECTIONS) {
    const a = toCanvas(frame, start, rect);
    const b = toCanvas(frame, end, rect);
    if (!a || !b) {
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  for (let i = 0; i < frame.landmarks.length; i++) {
    const point = toCanvas(frame, i, rect);
    if (!point) {
      continue;
    }
    ctx.beginPath();
    ctx.arc(point.x, point.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function SkeletonOverlay({
  videoRef,
  keypoints,
  showAllLandmarks = false,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  keypoints: PoseFrame[];
  /** Admin preview: toggle all 33 MediaPipe landmarks. */
  showAllLandmarks?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const smoothedJoints = useMemo(
    () => (showAllLandmarks ? null : smoothGolferJoints(keypoints)),
    [keypoints, showAllLandmarks],
  );

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || keypoints.length === 0) {
      return;
    }
    let raf = 0;
    const tick = () => {
      if (
        canvas.width !== video.clientWidth ||
        canvas.height !== video.clientHeight
      ) {
        canvas.width = video.clientWidth;
        canvas.height = video.clientHeight;
      }
      const frame = nearestPoseFrame(keypoints, video.currentTime);
      const ctx = canvas.getContext("2d");
      if (ctx && frame) {
        const rect = contentRect(video);
        if (showAllLandmarks) {
          drawFullSkeleton(ctx, frame, rect);
        } else {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          const frameIndex = keypoints.indexOf(frame);
          drawGolferSkeleton(
            ctx,
            keypoints,
            frameIndex >= 0 ? frameIndex : 0,
            rect,
            { smoothedJoints: smoothedJoints ?? undefined },
          );
        }
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [keypoints, showAllLandmarks, smoothedJoints, videoRef]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
