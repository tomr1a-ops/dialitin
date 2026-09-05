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
const FIRST_HOLD_MS = 1500;
const REPLAY_HOLD_MS = 500;

type PlaybackPhase = "playing" | "holding" | "paused";

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
  const playbackPhaseRef = useRef<PlaybackPhase>("paused");
  const guiltyTriggeredRef = useRef(false);
  const hasCompletedFirstHoldRef = useRef(false);
  const holdStartRef = useRef(0);
  const holdDurationRef = useRef(FIRST_HOLD_MS);
  const fpsSamplesRef = useRef<number[]>([]);

  const [playbackPhase, setPlaybackPhase] = useState<PlaybackPhase>("paused");
  const [holdProgress, setHoldProgress] = useState(0);
  const [scrubTime, setScrubTime] = useState(0);
  const [canvasFps, setCanvasFps] = useState(0);

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

  const setPhase = useCallback((phase: PlaybackPhase) => {
    playbackPhaseRef.current = phase;
    setPlaybackPhase(phase);
  }, []);

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

  const resumeFromHold = useCallback(async () => {
    const video = videoRef.current;
    if (!video || playbackPhaseRef.current !== "holding") {
      return;
    }
    hasCompletedFirstHoldRef.current = true;
    setHoldProgress(0);
    setPhase("playing");
    await video.play();
  }, [setPhase]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    video.playbackRate = PLAYBACK_RATE;
    video.currentTime = windowStart;
    setScrubTime(windowStart);
    guiltyTriggeredRef.current = false;
    setPhase("paused");
    setHoldProgress(0);
  }, [setPhase, windowStart, videoSrc]);

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

      const phase = playbackPhaseRef.current;

      if (
        phase === "playing" &&
        !guiltyTriggeredRef.current &&
        video.currentTime >= guiltyTimeSec
      ) {
        guiltyTriggeredRef.current = true;
        video.pause();
        video.currentTime = guiltyTimeSec;
        setScrubTime(guiltyTimeSec);
        holdDurationRef.current = hasCompletedFirstHoldRef.current
          ? REPLAY_HOLD_MS
          : FIRST_HOLD_MS;
        holdStartRef.current = now;
        setHoldProgress(0);
        setPhase("holding");
        onFreeze?.();
      }

      if (phase === "holding") {
        const elapsed = now - holdStartRef.current;
        const progress = Math.min(elapsed / holdDurationRef.current, 1);
        setHoldProgress(progress);
        if (progress >= 1) {
          void resumeFromHold();
        }
      }

      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [drawFrame, guiltyTimeSec, onFreeze, resumeFromHold, setPhase]);

  async function togglePlay() {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    if (playbackPhaseRef.current === "holding") {
      hasCompletedFirstHoldRef.current = true;
      setHoldProgress(0);
      setPhase("paused");
      return;
    }
    if (video.paused) {
      if (video.currentTime >= windowEnd - 0.02) {
        video.currentTime = windowStart;
        setScrubTime(windowStart);
        guiltyTriggeredRef.current = false;
      }
      setPhase("playing");
      await video.play();
    } else {
      video.pause();
      setPhase("paused");
    }
  }

  function seek(time: number) {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    const clamped = Math.min(Math.max(time, windowStart), windowEnd);
    guiltyTriggeredRef.current = clamped >= guiltyTimeSec;
    setHoldProgress(0);
    setPhase("paused");
    video.currentTime = clamped;
    setScrubTime(clamped);
  }

  function handleFrameTap() {
    if (playbackPhaseRef.current === "holding") {
      void resumeFromHold();
    }
  }

  const buttonLabel =
    playbackPhase === "holding"
      ? "Holding…"
      : playbackPhase === "playing"
        ? "Pause"
        : "Play ¼×";

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
            if (playbackPhaseRef.current !== "holding") {
              setScrubTime(time);
            }
            if (time >= windowEnd) {
              event.currentTarget.pause();
              setPhase("paused");
            }
          }}
        />
        <canvas
          ref={canvasRef}
          className="pointer-events-none absolute inset-0 h-full w-full"
        />
        {playbackPhase === "holding" ? (
          <button
            type="button"
            className="absolute inset-0 flex cursor-pointer items-center justify-center bg-transparent"
            aria-label="Resume from guilty frame hold"
            data-testid="guilty-frame-hold-overlay"
            onClick={handleFrameTap}
          >
            <svg
              className="h-16 w-16"
              viewBox="0 0 64 64"
              aria-hidden="true"
              data-testid="guilty-frame-hold-ring"
            >
              <circle
                cx="32"
                cy="32"
                r="28"
                fill="none"
                stroke="rgba(255,255,255,0.2)"
                strokeWidth="3"
              />
              <circle
                cx="32"
                cy="32"
                r="28"
                fill="none"
                stroke="#c8f542"
                strokeWidth="3"
                strokeLinecap="round"
                transform="rotate(-90 32 32)"
                strokeDasharray={`${2 * Math.PI * 28}`}
                strokeDashoffset={`${2 * Math.PI * 28 * (1 - holdProgress)}`}
              />
            </svg>
            <span
              className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#ff6b6b]"
              data-testid="guilty-frame-hold-label"
            >
              first guilty frame
            </span>
          </button>
        ) : null}
      </div>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          className="min-h-11 flex-1 rounded-full bg-[#c8f542] text-sm font-semibold text-[#0b1210] disabled:opacity-70"
          disabled={playbackPhase === "holding"}
          data-testid="reveal-playback-toggle"
          onClick={() => void togglePlay()}
        >
          {buttonLabel}
        </button>
      </div>
      <RevealScrubber
        className="mt-4"
        windowStart={windowStart}
        windowEnd={windowEnd}
        currentTime={scrubTime}
        phases={phases}
        guiltyTimeSec={guiltyTimeSec}
        onSeek={seek}
      />
    </section>
  );
}
