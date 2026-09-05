"use client";

import { useEffect, useRef } from "react";
import { nearestPoseFrame } from "@/lib/pose/nearest-frame";
import {
  LEFT_HIP,
  LEFT_SHOULDER,
  RIGHT_HIP,
  RIGHT_SHOULDER,
  type PoseFrame,
} from "@/lib/pose/types";

const SHOULDER = "#c8f542";
const HIP = "#6ecbff";
const HEAD = "#f3c36a";

function contentRect(video: HTMLVideoElement) {
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

function toCanvas(
  frame: PoseFrame,
  index: number,
  rect: ReturnType<typeof contentRect>,
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
  };
}

function headCanvas(frame: PoseFrame, rect: ReturnType<typeof contentRect>) {
  const leftEar = toCanvas(frame, 7, rect);
  const rightEar = toCanvas(frame, 8, rect);
  if (leftEar && rightEar) {
    return {
      x: (leftEar.x + rightEar.x) / 2,
      y: (leftEar.y + rightEar.y) / 2,
    };
  }
  return toCanvas(frame, 0, rect);
}

function drawMetricGuides(
  ctx: CanvasRenderingContext2D,
  frame: PoseFrame,
  rect: ReturnType<typeof contentRect>,
) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  const ls = toCanvas(frame, LEFT_SHOULDER, rect);
  const rs = toCanvas(frame, RIGHT_SHOULDER, rect);
  const lh = toCanvas(frame, LEFT_HIP, rect);
  const rh = toCanvas(frame, RIGHT_HIP, rect);
  const head = headCanvas(frame, rect);

  ctx.lineWidth = 3;
  ctx.lineCap = "round";

  if (ls && rs) {
    ctx.strokeStyle = SHOULDER;
    ctx.beginPath();
    ctx.moveTo(ls.x, ls.y);
    ctx.lineTo(rs.x, rs.y);
    ctx.stroke();
  }

  if (lh && rh) {
    ctx.strokeStyle = HIP;
    ctx.beginPath();
    ctx.moveTo(lh.x, lh.y);
    ctx.lineTo(rh.x, rh.y);
    ctx.stroke();
  }

  if (head) {
    ctx.fillStyle = HEAD;
    ctx.beginPath();
    ctx.arc(head.x, head.y, 6, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function MetricPhaseStill({
  label,
  videoSrc,
  timeMs,
  keypoints,
}: {
  label: string;
  videoSrc: string;
  timeMs: number;
  keypoints: PoseFrame[];
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || keypoints.length === 0) {
      return;
    }
    const seek = () => {
      video.currentTime = timeMs / 1000;
    };
    const draw = () => {
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
        drawMetricGuides(ctx, frame, contentRect(video));
      }
    };
    if (video.readyState >= 1) {
      seek();
    } else {
      video.addEventListener("loadedmetadata", seek, { once: true });
    }
    video.addEventListener("seeked", draw);
    const raf = window.requestAnimationFrame(draw);
    return () => {
      video.removeEventListener("seeked", draw);
      window.cancelAnimationFrame(raf);
    };
  }, [keypoints, timeMs, videoSrc]);

  return (
    <div>
      <p className="mb-1 text-xs uppercase tracking-wide text-white/50">
        {label}
      </p>
      <div className="relative overflow-hidden rounded-xl bg-black">
        <video
          ref={videoRef}
          className="aspect-[3/4] w-full object-contain"
          src={videoSrc}
          muted
          playsInline
          preload="auto"
        />
        <canvas
          ref={canvasRef}
          className="pointer-events-none absolute inset-0 h-full w-full"
        />
      </div>
    </div>
  );
}
