"use client";

import { useEffect, useRef } from "react";
import { nearestPoseFrame } from "@/lib/pose/nearest-frame";
import type { LeadWristReconstruction } from "@/lib/engine/occlusion";
import {
  LEFT_HIP,
  LEFT_WRIST,
  RIGHT_HIP,
  type PoseFrame,
} from "@/lib/pose/types";

const TUSH = "#f3c36a";
const PELVIS = "#6ecbff";
const WRIST_VISIBLE = "#c8f542";
const WRIST_RECON = "#c8f542";

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

function normToCanvas(
  x: number,
  y: number,
  frame: PoseFrame,
  rect: ReturnType<typeof contentRect>,
) {
  const fullX = frame.crop.x + x * frame.crop.width;
  const fullY = frame.crop.y + y * frame.crop.height;
  return {
    x: rect.x + (fullX / rect.videoWidth) * rect.width,
    y: rect.y + (fullY / rect.videoHeight) * rect.height,
  };
}

function drawDtlGuides(
  ctx: CanvasRenderingContext2D,
  frame: PoseFrame,
  rect: ReturnType<typeof contentRect>,
  options: {
    tushLineX: number | null;
    showWristPath?: boolean;
    wristPath?: LeadWristReconstruction | null;
    impactFrameIndex?: number | null;
  },
) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  const lh = toCanvas(frame, LEFT_HIP, rect);
  const rh = toCanvas(frame, RIGHT_HIP, rect);
  if (lh && rh) {
    const pelvis = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 };
    ctx.fillStyle = PELVIS;
    ctx.beginPath();
    ctx.arc(pelvis.x, pelvis.y, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  if (options.tushLineX != null) {
    const top = normToCanvas(options.tushLineX, 0.05, frame, rect);
    const bottom = normToCanvas(options.tushLineX, 0.95, frame, rect);
    ctx.strokeStyle = TUSH;
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(bottom.x, bottom.y);
    ctx.stroke();
  }

  if (options.showWristPath && options.wristPath) {
    const points = options.wristPath.frames.filter((p) => p.valid);
    if (points.length >= 2) {
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < points.length; i++) {
        const p = points[i]!;
        const c = normToCanvas(p.x, p.y, frame, rect);
        if (i === 0) {
          ctx.moveTo(c.x, c.y);
        } else {
          const prev = points[i - 1]!;
          const dashed = prev.reason !== "visible" || p.reason !== "visible";
          if (dashed) {
            ctx.setLineDash([6, 4]);
          } else {
            ctx.setLineDash([]);
          }
          ctx.lineTo(c.x, c.y);
        }
      }
      ctx.strokeStyle = WRIST_RECON;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const lead = toCanvas(frame, LEFT_WRIST, rect);
    if (lead) {
      ctx.fillStyle = WRIST_VISIBLE;
      ctx.beginPath();
      ctx.arc(lead.x, lead.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function DtlMetricPhaseStill({
  label,
  videoSrc,
  timeMs,
  keypoints,
  tushLineX,
  wristPath,
  impactFrameIndex,
}: {
  label: string;
  videoSrc: string;
  timeMs: number;
  keypoints: PoseFrame[];
  tushLineX?: number | null;
  wristPath?: LeadWristReconstruction | null;
  impactFrameIndex?: number | null;
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
        drawDtlGuides(ctx, frame, contentRect(video), {
          tushLineX: tushLineX ?? null,
          showWristPath: label.toLowerCase() === "impact",
          wristPath,
          impactFrameIndex,
        });
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
  }, [impactFrameIndex, keypoints, label, timeMs, tushLineX, videoSrc, wristPath]);

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
