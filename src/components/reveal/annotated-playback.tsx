"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RevealScrubber } from "@/components/reveal/reveal-scrubber";
import {
  contentRect,
  drawShoulderHipLines,
  drawSkeleton,
  drawTushLine,
  pelvisCenter,
  resizeCanvasToVideo,
  tushLineXAtAddress,
} from "@/lib/reveal/canvas-utils";
import type { RevealInput } from "@/lib/reveal/types";
import { reconstructLeadWristPath } from "@/lib/engine/occlusion";
import type { SwingPhases } from "@/lib/engine/phases";
import { nearestPoseFrame } from "@/lib/pose/nearest-frame";
import type { PoseFrame } from "@/lib/pose/types";
import { TracesOverlay } from "@/components/reveal/traces-overlay";

const PLAYBACK_RATE = 0.25;

export function AnnotatedPlayback({
  videoSrc,
  keypoints,
  phases,
  handedness,
  angle,
  input,
  capturePath = "upload",
  onFreeze,
}: {
  videoSrc: string;
  keypoints: PoseFrame[];
  phases: SwingPhases;
  handedness: "left" | "right";
  angle: "dtl" | "face_on";
  input: RevealInput;
  capturePath?: "upload" | "in-app" | "in_app" | "native_slomo";
  onFreeze?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [canvasFps, setCanvasFps] = useState(0);
  const frozenRef = useRef(false);
  const fpsSamplesRef = useRef<number[]>([]);

  const trim = phases.trim;
  const windowStart = trim?.valid ? trim.value.startMs / 1000 : 0;
  const windowEnd = trim?.valid
    ? trim.value.endMs / 1000
    : keypoints.at(-1)?.mediaTime ?? 1;
  const addressFrame = phases.address.valid
    ? keypoints[phases.address.frameIndex] ?? null
    : keypoints[0] ?? null;
  const tushLineX =
    addressFrame && angle === "dtl"
      ? tushLineXAtAddress(addressFrame, handedness)
      : null;
  const guiltyTimeSec =
    windowStart + input.firstGuiltyFrameMs / 1000;

  const wristReconstruction =
    angle === "dtl"
      ? reconstructLeadWristPath({
          frames: keypoints,
          phases,
          handedness,
          capturePath,
        })
      : null;

  const drawFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) {
      return;
    }
    resizeCanvasToVideo(canvas, video);
    const ctx = canvas.getContext("2d");
    const frame = nearestPoseFrame(keypoints, video.currentTime);
    if (!ctx || !frame) {
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const rect = contentRect(video);
    const timeMs = video.currentTime * 1000;

    drawSkeleton(ctx, frame, rect, { opacity: 0.85 });

    if (angle === "dtl" && tushLineX != null) {
      if (phases.address.valid && timeMs >= phases.address.timeMs - 50) {
        drawTushLine(ctx, frame, rect, tushLineX);
      }
      if (phases.impact.valid && timeMs >= phases.impact.timeMs - 30) {
        drawTushLine(ctx, frame, rect, tushLineX);
        const pelvis = pelvisCenter(frame, rect);
        if (pelvis) {
          ctx.fillStyle = "#ff6b6b";
          ctx.beginPath();
          ctx.arc(pelvis.x, pelvis.y, 8, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    if (angle === "face_on" && phases.top.valid && timeMs >= phases.top.timeMs - 50) {
      drawShoulderHipLines(ctx, frame, rect);
    }

    TracesOverlay.draw(ctx, {
      keypoints,
      phases,
      handedness,
      wristReconstruction,
      currentTime: video.currentTime,
      rect,
      frame,
    });
  }, [angle, handedness, keypoints, phases, tushLineX, wristReconstruction]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    video.playbackRate = PLAYBACK_RATE;
    video.currentTime = windowStart;
    setCurrentTime(windowStart);
  }, [windowStart, videoSrc]);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) {
      return;
    }
    let raf = 0;
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      if (dt > 0) {
        fpsSamplesRef.current.push(1000 / dt);
        if (fpsSamplesRef.current.length > 120) {
          fpsSamplesRef.current.shift();
        }
        const samples = fpsSamplesRef.current;
        if (samples.length > 0) {
          const avg =
            samples.reduce((a, b) => a + b, 0) / samples.length;
          setCanvasFps(avg);
        }
      }
      drawFrame();

      if (
        !frozenRef.current &&
        video.currentTime >= guiltyTimeSec
      ) {
        frozenRef.current = true;
        video.pause();
        setPlaying(false);
        onFreeze?.();
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [drawFrame, guiltyTimeSec, onFreeze]);

  async function togglePlay() {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    if (video.paused) {
      if (frozenRef.current) {
        frozenRef.current = false;
      }
      if (video.currentTime >= windowEnd - 0.02) {
        video.currentTime = windowStart;
      }
      await video.play();
      setPlaying(true);
    } else {
      video.pause();
      setPlaying(false);
    }
  }

  function seek(time: number) {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    frozenRef.current = false;
    video.currentTime = Math.min(Math.max(time, windowStart), windowEnd);
    setCurrentTime(video.currentTime);
  }

  return (
    <section data-testid="reveal-annotated-playback" data-canvas-fps={canvasFps.toFixed(1)}>
      <h2 className="text-[1.35rem] font-semibold tracking-tight">The reveal</h2>
      <p className="mt-1 text-sm text-white/60">
        {input.guiltyLabel} — {(input.firstGuiltyFrameMs / 1000).toFixed(2)}s before
        the strike.
      </p>
      <div className="relative mt-4 overflow-hidden rounded-2xl bg-black">
        <video
          ref={videoRef}
          className="aspect-[9/16] w-full object-contain"
          src={videoSrc}
          playsInline
          muted
          preload="auto"
          onTimeUpdate={(event) => {
            const time = event.currentTarget.currentTime;
            if (time >= windowEnd) {
              event.currentTarget.pause();
              setPlaying(false);
            }
            setCurrentTime(time);
          }}
        />
        <canvas
          ref={canvasRef}
          className="pointer-events-none absolute inset-0 h-full w-full"
        />
      </div>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          className="min-h-11 flex-1 rounded-full bg-[#c8f542] text-sm font-semibold text-[#0b1210]"
          onClick={() => void togglePlay()}
        >
          {playing ? "Pause" : "Play ¼×"}
        </button>
      </div>
      <RevealScrubber
        className="mt-4"
        windowStart={windowStart}
        windowEnd={windowEnd}
        currentTime={currentTime}
        phases={phases}
        guiltyTimeSec={guiltyTimeSec}
        onSeek={seek}
      />
    </section>
  );
}
