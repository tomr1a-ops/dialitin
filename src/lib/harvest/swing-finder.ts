import { handCentroidSeries } from "@/lib/engine/phases";
import type { PoseFrame } from "@/lib/pose/types";

export type SwingSegment = {
  startFrameIndex: number;
  endFrameIndex: number;
  startMs: number;
  endMs: number;
  impactFrameIndex: number;
};

const MIN_SEGMENT_MS = 1200;
const MIN_GAP_MS = 1800;
const PEAK_FRACTION = 0.45;

function localMaxima(values: number[], minSeparation: number): number[] {
  const peaks: number[] = [];
  for (let i = 2; i < values.length - 2; i++) {
    const value = values[i] ?? 0;
    if (value <= 0) {
      continue;
    }
    const prev = values[i - 1] ?? 0;
    const next = values[i + 1] ?? 0;
    if (value >= prev && value >= next) {
      if (
        peaks.length === 0 ||
        (values[peaks[peaks.length - 1]!] ?? 0) > 0 &&
          i - peaks[peaks.length - 1]! >= minSeparation
      ) {
        peaks.push(i);
      } else if (value > (values[peaks[peaks.length - 1]!] ?? 0)) {
        peaks[peaks.length - 1] = i;
      }
    }
  }
  return peaks;
}

/** Multi-swing split: find impact peaks in hand speed, return frame ranges. */
export function findSwingSegments(
  frames: PoseFrame[],
  handedness: "right" | "left" = "right",
): SwingSegment[] {
  if (frames.length < 12) {
    return [];
  }
  const series = handCentroidSeries(frames, handedness);
  const finite = series.speed.filter((value) => value > 0);
  if (finite.length === 0) {
    return [];
  }
  const peakSpeed = Math.max(...finite);
  const threshold = peakSpeed * PEAK_FRACTION;
  const avgFrameMs =
    series.times.length > 1
      ? (series.times[series.times.length - 1]! - series.times[0]!) /
        (series.times.length - 1)
      : 33;
  const minSeparation = Math.max(3, Math.round(MIN_GAP_MS / avgFrameMs));

  const impactIndices = localMaxima(series.speed, minSeparation).filter(
    (index) => (series.speed[index] ?? 0) >= threshold,
  );
  if (impactIndices.length === 0) {
    return [];
  }

  const padFrames = Math.max(4, Math.round(500 / avgFrameMs));
  const segments: SwingSegment[] = [];

  for (const impactIndex of impactIndices) {
    const start = Math.max(0, impactIndex - padFrames * 4);
    const end = Math.min(frames.length - 1, impactIndex + padFrames * 3);
    const startMs = series.times[start] ?? 0;
    const endMs = series.times[end] ?? startMs;
    if (endMs - startMs < MIN_SEGMENT_MS) {
      continue;
    }
    segments.push({
      startFrameIndex: start,
      endFrameIndex: end,
      startMs,
      endMs,
      impactFrameIndex: impactIndex,
    });
  }

  if (segments.length <= 1) {
    return [];
  }
  return segments;
}

export function slicePoseFrames(
  frames: PoseFrame[],
  segment: SwingSegment,
): PoseFrame[] {
  const slice = frames.slice(segment.startFrameIndex, segment.endFrameIndex + 1);
  const baseTime = slice[0]?.mediaTime ?? 0;
  return slice.map((frame, index) => ({
    ...frame,
    mediaTime: frame.mediaTime - baseTime,
    frameIndex: index,
  }));
}
