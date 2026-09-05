"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getCaptureSession } from "@/lib/capture/session";
import type { IngestResult } from "@/lib/capture/types";
import { POSE_CONNECTIONS } from "@/lib/pose/connections";
import { nearestPoseFrame } from "@/lib/pose/nearest-frame";
import type { PoseFrame } from "@/lib/pose/types";

const SKELETON = "#c8f542";
const FLASH_SECONDS = 1.5;
const REST_OPACITY = 0.3;

function readSession() {
  if (typeof window === "undefined") {
    return null;
  }
  return getCaptureSession();
}

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
    visibility: point.visibility,
  };
}

function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  frame: PoseFrame,
  rect: ReturnType<typeof contentRect>,
  opacity: number,
) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.strokeStyle = SKELETON;
  ctx.fillStyle = SKELETON;
  ctx.globalAlpha = opacity;

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

  ctx.globalAlpha = 1;
}

export function RevealView() {
  const [result] = useState<IngestResult | null>(readSession);
  const [playing, setPlaying] = useState(false);
  const [slowMo, setSlowMo] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const loadAtRef = useRef<number | null>(null);

  useEffect(() => {
    loadAtRef.current = performance.now();
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !result) {
      return;
    }

    let raf = 0;
    const tick = () => {
      const width = video.clientWidth;
      const height = video.clientHeight;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const frame = nearestPoseFrame(result.keypoints, video.currentTime);
      const ctx = canvas.getContext("2d");
      if (ctx && frame) {
        const started = loadAtRef.current ?? performance.now();
        const elapsed = (performance.now() - started) / 1000;
        const opacity = elapsed < FLASH_SECONDS ? 1 : REST_OPACITY;
        drawSkeleton(ctx, frame, contentRect(video), opacity);
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [result]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    video.playbackRate = slowMo ? 0.25 : 1;
  }, [slowMo]);

  if (!result) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center px-6">
        <p className="text-center text-white/70">
          No clip in this tab yet. Capture a swing first.
        </p>
        <Link
          href="/capture"
          className="mt-6 min-h-12 rounded-full bg-[#c8f542] px-6 py-3 text-[1.05rem] font-semibold text-[#0b1210]"
        >
          Start over
        </Link>
      </main>
    );
  }

  const duration = Math.max(result.durationSeconds, 0.001);

  async function togglePlay() {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    if (video.paused) {
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
    video.currentTime = Math.min(Math.max(time, 0), duration);
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[22rem] flex-col px-5 py-5">
      <Link
        href="/capture"
        className="self-start text-sm text-white/55 underline-offset-4 hover:underline"
      >
        Start over
      </Link>
      <h1 className="mt-4 text-[1.35rem] font-semibold tracking-tight">
        Swing found
      </h1>
      <div className="relative mt-4 overflow-hidden rounded-2xl bg-black">
        <video
          ref={videoRef}
          className="aspect-[9/16] w-full object-contain"
          src={result.clipUrl}
          playsInline
          preload="auto"
          onTimeUpdate={(event) =>
            setCurrentTime(event.currentTarget.currentTime)
          }
          onEnded={() => setPlaying(false)}
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
          {playing ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          className={`min-h-11 flex-1 rounded-full border text-sm font-semibold ${
            slowMo
              ? "border-[#c8f542] bg-[#c8f542]/15 text-[#c8f542]"
              : "border-white/20 text-white"
          }`}
          onClick={() => setSlowMo((value) => !value)}
        >
          0.25×
        </button>
      </div>

      <label className="mt-4 text-sm text-white/60">
        {currentTime.toFixed(2)}s / {duration.toFixed(2)}s
        <input
          type="range"
          min={0}
          max={duration}
          step={0.01}
          value={Math.min(currentTime, duration)}
          onChange={(event) => seek(Number(event.target.value))}
          className="mt-2 w-full"
        />
      </label>

      <div className="relative mt-3 h-8 overflow-hidden rounded-md bg-white/8">
        {result.frameTimestamps.map((time, index) => (
          <button
            key={`${time}-${index}`}
            type="button"
            aria-label={`${time.toFixed(3)} seconds`}
            className="absolute top-1 h-6 w-px bg-white/45"
            style={{ left: `${(time / duration) * 100}%` }}
            onClick={() => seek(time)}
          />
        ))}
      </div>

      <footer
        className="mt-5 space-y-1 text-[0.72rem] leading-relaxed text-white/50"
        data-pose-fps={result.poseFpsProcessed.toFixed(2)}
        data-resolution={`${result.resolution.width}x${result.resolution.height}`}
        data-capture-path={result.capturePath}
      >
        <p>
          {result.capturePath} · {result.resolution.width}×
          {result.resolution.height} · {result.poseFpsProcessed.toFixed(2)}{" "}
          fps-processed
        </p>
        <p>
          {result.frameCount} timestamps · {result.keypoints.length} pose frames
          · {result.poseBackend}
        </p>
      </footer>
    </main>
  );
}
