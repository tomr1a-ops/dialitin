"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  contentRect,
  drawSkeleton,
  poseFrameIndex,
  resizeCanvasToVideo,
  smoothGolferJoints,
} from "@/lib/reveal/canvas-utils";
import { nearestPoseFrame } from "@/lib/pose/nearest-frame";
import type { PoseFrame } from "@/lib/pose/types";

const FLASH_MS = 400;

export function SwingFoundScreen({
  videoSrc,
  keypoints,
  windowStart,
  windowEnd,
  onComplete,
}: {
  videoSrc: string;
  keypoints: PoseFrame[];
  windowStart: number;
  windowEnd: number;
  onComplete: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const flashStartRef = useRef<number | null>(null);
  const doneRef = useRef(false);
  const smoothedJoints = useMemo(
    () => smoothGolferJoints(keypoints),
    [keypoints],
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    video.currentTime = windowStart;
    void video.play().catch(() => undefined);
  }, [windowStart, videoSrc]);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || keypoints.length === 0) {
      return;
    }

    let raf = 0;
    const tick = () => {
      resizeCanvasToVideo(canvas, video);
      const frame = nearestPoseFrame(keypoints, video.currentTime);
      const ctx = canvas.getContext("2d");
      if (ctx && frame) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (flashStartRef.current == null) {
          flashStartRef.current = performance.now();
        }
        const elapsed = performance.now() - (flashStartRef.current ?? 0);
        const opacity = elapsed < FLASH_MS ? 1 : 0.35;
        drawSkeleton(ctx, keypoints, contentRect(video), {
          opacity,
          frameIndex: poseFrameIndex(keypoints, frame),
          smoothedJoints,
        });
      }

      if (video.currentTime >= windowEnd - 0.02 && !doneRef.current) {
        doneRef.current = true;
        video.pause();
        onComplete();
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [keypoints, onComplete, smoothedJoints, windowEnd]);

  return (
    <section data-testid="reveal-swing-found">
      <h2 className="text-[1.35rem] font-semibold tracking-tight">Swing found</h2>
      <p className="mt-1 text-sm text-white/60">
        Trimmed to your swing. Skeleton confirms we saw you.
      </p>
      <div className="relative mt-4 overflow-hidden rounded-2xl bg-black">
        <video
          ref={videoRef}
          className="aspect-[9/16] w-full object-contain"
          src={videoSrc}
          playsInline
          muted
          preload="auto"
        />
        <canvas
          ref={canvasRef}
          className="pointer-events-none absolute inset-0 h-full w-full"
        />
      </div>
    </section>
  );
}
