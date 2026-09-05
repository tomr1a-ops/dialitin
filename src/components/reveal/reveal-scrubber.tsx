"use client";

import type { PhaseMark, SwingPhases } from "@/lib/engine/phases";

const PHASE_KEYS = [
  "address",
  "takeaway",
  "top",
  "impact",
  "finish",
] as const satisfies ReadonlyArray<
  keyof Pick<SwingPhases, "address" | "takeaway" | "top" | "impact" | "finish">
>;

export function RevealScrubber({
  windowStart,
  windowEnd,
  currentTime,
  phases,
  guiltyTimeSec,
  onSeek,
  className = "",
}: {
  windowStart: number;
  windowEnd: number;
  currentTime: number;
  phases: SwingPhases | null;
  guiltyTimeSec?: number | null;
  onSeek: (time: number) => void;
  className?: string;
}) {
  const duration = Math.max(windowEnd - windowStart, 0.001);
  const value = Math.min(Math.max(currentTime, windowStart), windowEnd);

  function phaseMarks(): Array<{ key: string; mark: PhaseMark }> {
    if (!phases) {
      return [];
    }
    return PHASE_KEYS.map((key) => ({ key, mark: phases[key] as PhaseMark }));
  }

  return (
    <div className={className}>
      <label className="text-sm text-white/60">
        {currentTime.toFixed(2)}s
        <input
          type="range"
          min={windowStart}
          max={windowEnd}
          step={0.01}
          value={value}
          onChange={(event) => onSeek(Number(event.target.value))}
          className="mt-2 w-full accent-[#c8f542]"
          data-testid="reveal-scrubber"
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
              aria-label={`${key} at ${(mark.timeMs / 1000).toFixed(2)}s`}
              title={key}
              className="absolute top-1 h-6 w-px bg-white/45"
              style={{
                left: `${((mark.timeMs / 1000 - windowStart) / duration) * 100}%`,
              }}
              onClick={() => onSeek(mark.timeMs / 1000)}
            />
          ) : null,
        )}
        {guiltyTimeSec != null ? (
          <button
            type="button"
            aria-label="First guilty frame"
            title="First guilty frame"
            className="absolute top-0 h-8 w-0.5 bg-[#ff6b6b]"
            style={{
              left: `${((guiltyTimeSec - windowStart) / duration) * 100}%`,
            }}
            onClick={() => onSeek(guiltyTimeSec)}
            data-testid="guilty-frame-tick"
          />
        ) : null}
      </div>
    </div>
  );
}
