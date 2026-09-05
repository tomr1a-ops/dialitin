"use client";

import { useEffect, useRef } from "react";
import {
  contentRect,
  drawSkeleton,
  drawTushLine,
  pelvisCenter,
  resizeCanvasToVideo,
  tushLineXAtAddress,
  REVEAL_COLORS,
} from "@/lib/reveal/canvas-utils";
import type { RevealInput } from "@/lib/reveal/types";
import type { PoseFrame } from "@/lib/pose/types";

const RECEIPT_WIDTH = 390;
const RECEIPT_HEIGHT = 720;

export function FixReceipt({
  videoSrc,
  keypoints,
  frameIndex,
  handedness,
  input,
  showRetestDelta = false,
  onPngReady,
}: {
  videoSrc: string;
  keypoints: PoseFrame[];
  frameIndex: number;
  handedness: "left" | "right";
  input: RevealInput;
  showRetestDelta?: boolean;
  onPngReady?: (dataUrl: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const exportRef = useRef<HTMLCanvasElement>(null);

  const frame = keypoints[frameIndex] ?? keypoints[0];
  const addressFrame = keypoints[0] ?? frame;
  const tushLineX = tushLineXAtAddress(addressFrame, handedness);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !frame) {
      return;
    }
    video.currentTime = frame.mediaTime;
  }, [frame, videoSrc]);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const exportCanvas = exportRef.current;
    if (!video || !canvas || !exportCanvas || !frame) {
      return;
    }

    let raf = 0;
    const tick = () => {
      resizeCanvasToVideo(canvas, video);
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const rect = contentRect(video);
        drawSkeleton(ctx, frame, rect);
        if (tushLineX != null) {
          drawTushLine(ctx, frame, rect, tushLineX);
        }
        const pelvis = pelvisCenter(frame, rect);
        if (pelvis) {
          ctx.fillStyle = REVEAL_COLORS.fault;
          ctx.beginPath();
          ctx.arc(pelvis.x, pelvis.y, 7, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);

    const exportTimer = window.setTimeout(() => {
      renderReceiptPng(exportCanvas, video, frame, handedness, input, showRetestDelta);
      const dataUrl = exportCanvas.toDataURL("image/png");
      onPngReady?.(dataUrl);
    }, 600);

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(exportTimer);
    };
  }, [frame, handedness, input, onPngReady, showRetestDelta, tushLineX, videoSrc]);

  return (
    <section data-testid="reveal-fix-receipt">
      <h2 className="text-[1.35rem] font-semibold tracking-tight">Fix Receipt</h2>
      <p className="mt-1 text-sm text-white/60">
        Evidence you can screenshot — grade never appears.
      </p>
      <div className="relative mt-4 overflow-hidden rounded-2xl bg-black">
        <video
          ref={videoRef}
          className="aspect-[9/16] w-full object-contain opacity-0"
          src={videoSrc}
          playsInline
          muted
          preload="auto"
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full"
        />
      </div>
      <ReceiptCardPreview input={input} showRetestDelta={showRetestDelta} />
      <canvas ref={exportRef} className="hidden" width={RECEIPT_WIDTH} height={RECEIPT_HEIGHT} />
      <div
        className="mt-4 rounded-xl border border-dashed border-white/15 p-3 text-center text-xs text-white/40"
        aria-hidden
        data-testid="receipt-qr-placeholder"
      >
        QR / deep link — inert in Phase 2b
      </div>
    </section>
  );
}

function ReceiptCardPreview({
  input,
  showRetestDelta,
}: {
  input: RevealInput;
  showRetestDelta: boolean;
}) {
  return (
    <div className="mt-4 rounded-2xl border border-white/10 bg-[#0f1612] p-4">
      <p className="text-sm leading-relaxed text-white/85">{input.feelSentence}</p>
      <p className="mt-3 text-lg font-semibold text-[#f3c36a]">
        {input.metric.label}: {input.metric.value.toFixed(0)}% of stance width
      </p>
      <p className="mt-2 text-sm text-white/70">
        {input.drillName} · {input.drillDurationSec}s
      </p>
      {showRetestDelta ? (
        <div className="mt-4">
          <div className="flex justify-between text-xs text-white/50">
            <span>Before</span>
            <span>After</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-[#c8f542]"
              style={{ width: "62%" }}
            />
          </div>
          <p className="mt-2 text-xs text-white/60">
            This one kept the tush line. That one ({input.bestSwingTimestamp})
            didn&apos;t.
          </p>
        </div>
      ) : null}
      <p className="mt-4 text-xs text-white/40">dialitin.ai</p>
    </div>
  );
}

function renderReceiptPng(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  frame: PoseFrame,
  handedness: "left" | "right",
  input: RevealInput,
  showRetestDelta: boolean,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  ctx.fillStyle = "#0b1210";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const imgH = 280;
  ctx.drawImage(video, 20, 20, canvas.width - 40, imgH);

  const rect = {
    x: 20,
    y: 20,
    width: canvas.width - 40,
    height: imgH,
    videoWidth: video.videoWidth,
    videoHeight: video.videoHeight,
  };
  const addressFrame = frame;
  const tushLineX = tushLineXAtAddress(addressFrame, handedness);
  drawSkeleton(ctx, frame, rect, { opacity: 0.9 });
  if (tushLineX != null) {
    drawTushLine(ctx, frame, rect, tushLineX);
  }
  const pelvis = pelvisCenter(frame, rect);
  if (pelvis) {
    ctx.fillStyle = REVEAL_COLORS.fault;
    ctx.beginPath();
    ctx.arc(pelvis.x, pelvis.y, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "#ffffff";
  ctx.font = "16px system-ui, sans-serif";
  ctx.fillText(input.feelSentence, 24, imgH + 56, canvas.width - 48);

  ctx.fillStyle = "#f3c36a";
  ctx.font = "bold 18px system-ui, sans-serif";
  ctx.fillText(
    `${input.metric.label}: ${input.metric.value.toFixed(0)}% stance width`,
    24,
    imgH + 88,
  );

  ctx.fillStyle = "#cccccc";
  ctx.font = "14px system-ui, sans-serif";
  ctx.fillText(`${input.drillName} · ${input.drillDurationSec}s`, 24, imgH + 116);

  if (showRetestDelta) {
    ctx.fillStyle = "#c8f542";
    ctx.fillRect(24, imgH + 140, 200, 8);
    ctx.fillStyle = "#888888";
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText(
      `Before | After — paired with ${input.bestSwingTimestamp} swing`,
      24,
      imgH + 168,
    );
  }

  ctx.fillStyle = "#666666";
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillText("dialitin.ai", 24, canvas.height - 24);
}
