"use client";

import { useEffect, useRef, useState } from "react";
import { RevealScrubber } from "@/components/reveal/reveal-scrubber";
import { SkeletonOverlay } from "@/components/pose/skeleton-overlay";
import type { RevealInput } from "@/lib/reveal/types";
import type { SwingPhases } from "@/lib/engine/phases";
import type { PoseFrame } from "@/lib/pose/types";

type CompareMode = "pair" | "triple";

export function BeforeAfterCompare({
  beforeVideoSrc,
  beforeKeypoints,
  beforePhases,
  afterVideoSrc,
  afterKeypoints,
  afterPhases: _afterPhases,
  bestVideoSrc,
  bestKeypoints,
  bestPhases: _bestPhases,
  input,
}: {
  beforeVideoSrc: string;
  beforeKeypoints: PoseFrame[];
  beforePhases: SwingPhases;
  afterVideoSrc: string;
  afterKeypoints: PoseFrame[];
  afterPhases: SwingPhases;
  bestVideoSrc?: string;
  bestKeypoints?: PoseFrame[];
  bestPhases?: SwingPhases;
  input: RevealInput;
}) {
  const [mode, setMode] = useState<CompareMode>("pair");
  const beforeRef = useRef<HTMLVideoElement>(null);
  const afterRef = useRef<HTMLVideoElement>(null);
  const bestRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(() =>
    beforePhases.impact.valid ? Math.max(0, beforePhases.impact.timeMs / 1000 - 0.4) : 0,
  );

  const impactSec = beforePhases.impact.valid
    ? beforePhases.impact.timeMs / 1000
    : 0;
  const syncOffset = impactSec;
  const windowStart = Math.max(0, syncOffset - 0.4);
  const windowEnd = syncOffset + 0.3;

  useEffect(() => {
    for (const video of [beforeRef.current, afterRef.current, bestRef.current]) {
      if (!video) {
        continue;
      }
      video.currentTime = windowStart;
    }
  }, [windowStart, beforeVideoSrc, afterVideoSrc, bestVideoSrc]);

  function seekAll(time: number) {
    const t = Math.min(Math.max(time, windowStart), windowEnd);
    for (const video of [beforeRef.current, afterRef.current, bestRef.current]) {
      if (video) {
        video.currentTime = t;
      }
    }
    setCurrentTime(t);
  }

  return (
    <section data-testid="reveal-before-after">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[1.35rem] font-semibold tracking-tight">
          Before | After
        </h2>
        {bestVideoSrc ? (
          <button
            type="button"
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              mode === "triple"
                ? "bg-[#c8f542] text-[#0b1210]"
                : "border border-white/20 text-white/70"
            }`}
            onClick={() => setMode(mode === "pair" ? "triple" : "pair")}
          >
            {mode === "triple" ? "3-up" : "+ Best"}
          </button>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-white/60">
        Synced at impact — that one ({input.bestSwingTimestamp}) didn&apos;t keep
        the tush line.
      </p>

      <div
        className={`mt-4 grid gap-3 ${mode === "triple" ? "grid-cols-3" : "grid-cols-2"}`}
      >
        <ComparePane
          label="Before"
          videoRef={beforeRef}
          videoSrc={beforeVideoSrc}
          keypoints={beforeKeypoints}
        />
        <ComparePane
          label="After"
          videoRef={afterRef}
          videoSrc={afterVideoSrc}
          keypoints={afterKeypoints}
        />
        {mode === "triple" && bestVideoSrc && bestKeypoints ? (
          <ComparePane
            label={`Best (${input.bestSwingTimestamp})`}
            videoRef={bestRef}
            videoSrc={bestVideoSrc}
            keypoints={bestKeypoints}
          />
        ) : null}
      </div>

      <RevealScrubber
        className="mt-4"
        windowStart={windowStart}
        windowEnd={windowEnd}
        currentTime={currentTime}
        phases={beforePhases}
        onSeek={seekAll}
      />
    </section>
  );
}

function ComparePane({
  label,
  videoRef,
  videoSrc,
  keypoints,
}: {
  label: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  videoSrc: string;
  keypoints: PoseFrame[];
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">
        {label}
      </p>
      <div className="relative overflow-hidden rounded-xl bg-black">
        <video
          ref={videoRef}
          className="aspect-[9/16] w-full object-contain"
          src={videoSrc}
          playsInline
          muted
          preload="auto"
        />
        <SkeletonOverlay videoRef={videoRef} keypoints={keypoints} />
      </div>
    </div>
  );
}
