"use client";

import { useEffect, useRef } from "react";
import {
  contentRect,
  drawAddressHipReferenceLine,
  drawSkeleton,
  drawTushLine,
  pelvisCenter,
  resizeCanvasToVideo,
  stanceWidthNorm,
  tushLineXAtAddress,
  REVEAL_COLORS,
} from "@/lib/reveal/canvas-utils";
import type { RevealInput, RevealJointFamily } from "@/lib/reveal/types";
import type { PoseFrame } from "@/lib/pose/types";
import { LEFT_HIP, RIGHT_HIP } from "@/lib/pose/types";

export function TargetPosition({
  still: videoSrc,
  keypoints,
  frameIndex,
  handedness,
  angle,
  input,
}: {
  still: string;
  keypoints: PoseFrame[];
  frameIndex: number;
  handedness: "left" | "right";
  angle: "dtl" | "face_on";
  input: RevealInput;
}) {
  const actualVideoRef = useRef<HTMLVideoElement>(null);
  const targetVideoRef = useRef<HTMLVideoElement>(null);
  const actualCanvasRef = useRef<HTMLCanvasElement>(null);
  const targetCanvasRef = useRef<HTMLCanvasElement>(null);

  const frame = keypoints[frameIndex] ?? keypoints[0];
  const addressFrame = keypoints[0] ?? frame;
  const tushLineX = tushLineXAtAddress(addressFrame, handedness);

  useEffect(() => {
    for (const video of [actualVideoRef.current, targetVideoRef.current]) {
      if (!video || !frame) {
        continue;
      }
      video.currentTime = frame.mediaTime;
    }
  }, [frame, videoSrc]);

  useEffect(() => {
    const videos = [
      { video: actualVideoRef.current, canvas: actualCanvasRef.current, target: false },
      { video: targetVideoRef.current, canvas: targetCanvasRef.current, target: true },
    ] as const;

    let raf = 0;
    const tick = () => {
      for (const { video, canvas, target } of videos) {
        if (!video || !canvas || !frame) {
          continue;
        }
        resizeCanvasToVideo(canvas, video);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          continue;
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const rect = contentRect(video);
        const drawFrame = target
          ? applyTargetDelta(frame, input.targetPosition.faultJointFamily, input.targetPosition.targetDelta, addressFrame)
          : frame;

        drawSkeleton(ctx, drawFrame, rect, {
          color: target ? REVEAL_COLORS.target : REVEAL_COLORS.skeleton,
        });

        if (angle === "dtl" && tushLineX != null) {
          drawTushLine(ctx, addressFrame, rect, tushLineX);
        }
        if (angle === "face_on") {
          drawAddressHipReferenceLine(ctx, addressFrame, rect);
        }

        if (!target) {
          const pelvis = pelvisCenter(drawFrame, rect);
          if (pelvis) {
            ctx.fillStyle = REVEAL_COLORS.fault;
            ctx.beginPath();
            ctx.arc(pelvis.x, pelvis.y, 7, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [addressFrame, angle, frame, input.targetPosition, tushLineX, videoSrc]);

  return (
    <section data-testid="reveal-target-position">
      <h2 className="text-[1.35rem] font-semibold tracking-tight">
        Target Position
      </h2>
      <p className="mt-1 text-sm text-white/60">
        Your frame — one joint family moved into the band.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">
            You
          </p>
          <div className="relative overflow-hidden rounded-xl bg-black">
            <video
              ref={actualVideoRef}
              className="aspect-[9/16] w-full object-contain"
              src={videoSrc}
              playsInline
              muted
              preload="auto"
            />
            <canvas
              ref={actualCanvasRef}
              className="pointer-events-none absolute inset-0 h-full w-full"
            />
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#6ecbff]">
            Target
          </p>
          <div className="relative overflow-hidden rounded-xl bg-black">
            <video
              ref={targetVideoRef}
              className="aspect-[9/16] w-full object-contain"
              src={videoSrc}
              playsInline
              muted
              preload="auto"
            />
            <canvas
              ref={targetCanvasRef}
              className="pointer-events-none absolute inset-0 h-full w-full"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function applyTargetDelta(
  frame: PoseFrame,
  jointFamily: RevealJointFamily,
  targetDeltaPct: number,
  addressFrame: PoseFrame,
): PoseFrame {
  if (jointFamily !== "pelvis") {
    return frame;
  }
  const stance = stanceWidthNorm(addressFrame);
  const deltaNorm = (targetDeltaPct / 100) * stance;
  const landmarks = frame.landmarks.map((lm, i) => {
    if (i !== LEFT_HIP && i !== RIGHT_HIP) {
      return lm;
    }
    return { ...lm, x: lm.x + deltaNorm };
  });
  return { ...frame, landmarks };
}
