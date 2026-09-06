"use client";

import type { PhaseMark, SwingPhases } from "@/lib/engine/phases";
import { nearestPoseFrame } from "@/lib/pose/nearest-frame";
import type { PoseFrame } from "@/lib/pose/types";

const PHASE_KEYS = [
  "address",
  "takeaway",
  "top",
  "impact",
  "finish",
] as const satisfies ReadonlyArray<
  keyof Pick<SwingPhases, "address" | "takeaway" | "top" | "impact" | "finish">
>;

function frameIndexAtTime(keypoints: PoseFrame[], timeSec: number): number {
  const frame = nearestPoseFrame(keypoints, timeSec);
  if (!frame) {
    return 0;
  }
  const index = keypoints.indexOf(frame);
  return index >= 0 ? index : 0;
}

export function RevealScrubber({
  windowStart,
  windowEnd,
  currentTime,
  phases,
  keypoints,
  guiltyTimeSec,
  timingUnreliable = false,
  onSeek,
  className = "",
}: {
  windowStart: number;
  windowEnd: number;
  currentTime: number;
  phases: SwingPhases | null;
  keypoints?: PoseFrame[];
  guiltyTimeSec?: number | null;
  timingUnreliable?: boolean;
  onSeek: (time: number) => void;
  className?: string;
}) {
  const duration = Math.max(windowEnd - windowStart, 0.001);
  const value = Math.min(Math.max(currentTime, windowStart), windowEnd);
  const showFrames = timingUnreliable && keypoints && keypoints.length > 0;
  const positionLabel = showFrames
    ? `Frame ${frameIndexAtTime(keypoints, currentTime)}`
    : `${currentTime.toFixed(2)}s`;

  function phaseMarks(): Array<{ key: string; mark: PhaseMark }> {
    if (!phases) {
      return [];
    }
    return PHASE_KEYS.map((key) => ({ key, mark: phases[key] as PhaseMark }));
  }

  function markPosition(timeSec: number): string {
    return `${((timeSec - windowStart) / duration) * 100}%`;
  }

  function markLabel(key: string, mark: PhaseMark): string {
    if (showFrames && keypoints) {
      return `${key} frame ${frameIndexAtTime(keypoints, mark.timeMs / 1000)}`;
    }
    return `${key} at ${(mark.timeMs / 1000).toFixed(2)}s`;
  }

  return (
    <div className={className}>
      <label className="text-sm text-white/60">
        {positionLabel}
        <input
          type="range"
          min={windowStart}
          max={windowEnd}
          step={0.01}
          value={value}
          onChange={(event) => onSeek(Number(event.target.value))}
          className="mt-2 w-full accent-[#c8f542]"
          data-testid="reveal-scrubber"
          data-scrubber-mode={showFrames ? "frames" : "seconds"}
        />
      </label>
      <div
        className="relative mt-2 h-8 overflow-hidden rounded-md bg-white/8"
        data-testid="reveal-phase-rail"
      >
        {phaseMarks().map(({ key, mark }) =>
          mark.valid ? (
            <button
              key={key}
              type="button"
              aria-label={markLabel(key, mark)}
              title={key}
              className="absolute top-1 h-6 w-px bg-white/45"
              style={{ left: markPosition(mark.timeMs / 1000) }}
              onClick={() => onSeek(mark.timeMs / 1000)}
            />
          ) : null,
        )}
        {guiltyTimeSec != null ? (
          <button
            type="button"
            aria-label={
              showFrames && keypoints
                ? `First guilty frame ${frameIndexAtTime(keypoints, guiltyTimeSec)}`
                : "First guilty frame"
            }
            title="First guilty frame"
            className="absolute top-0 h-8 w-0.5 bg-[#ff6b6b]"
            style={{ left: markPosition(guiltyTimeSec) }}
            onClick={() => onSeek(guiltyTimeSec)}
            data-testid="guilty-frame-tick"
          />
        ) : null}
      </div>
    </div>
  );
}
