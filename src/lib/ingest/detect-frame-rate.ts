import type { FrameRateDetection } from "@/lib/capture/types";

const COMMON_RATES = [24, 25, 30, 48, 50, 60, 120, 240];

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

function snapFrameRate(fps: number): number {
  let best = COMMON_RATES[0]!;
  let bestErr = Infinity;
  for (const rate of COMMON_RATES) {
    const err = Math.abs(fps - rate);
    if (err < bestErr) {
      best = rate;
      bestErr = err;
    }
  }
  return best;
}

function looksLikeSloMoName(fileName: string | undefined): boolean {
  if (!fileName) {
    return false;
  }
  return /slo-?mo|slow.?mo|120fps|240fps|\b120\b|\b240\b/i.test(fileName);
}

export function detectFrameRate(
  timestamps: number[],
  fileName?: string,
): FrameRateDetection {
  if (timestamps.length < 3) {
    return {
      detectedFrameRate: 0,
      snappedFrameRate: 0,
      minDeltaFps: 0,
      isVariable: false,
      sloMoReexportedAt30: looksLikeSloMoName(fileName),
    };
  }

  const deltas: number[] = [];
  for (let i = 1; i < timestamps.length; i++) {
    const delta = timestamps[i]! - timestamps[i - 1]!;
    if (delta > 1e-5 && delta < 0.2) {
      deltas.push(delta);
    }
  }

  if (deltas.length === 0) {
    return {
      detectedFrameRate: 0,
      snappedFrameRate: 0,
      minDeltaFps: 0,
      isVariable: false,
      sloMoReexportedAt30: looksLikeSloMoName(fileName),
    };
  }

  const medianDelta = median(deltas);
  const minDelta = Math.min(...deltas);
  const detectedFrameRate = 1 / medianDelta;
  const minDeltaFps = 1 / minDelta;
  const snappedFrameRate = snapFrameRate(detectedFrameRate);
  const relativeSpread =
    (Math.max(...deltas) - minDelta) / Math.max(medianDelta, 1e-6);
  const isVariable = relativeSpread > 0.35;

  const sloMoReexportedAt30 =
    looksLikeSloMoName(fileName) &&
    (snappedFrameRate === 24 ||
      snappedFrameRate === 25 ||
      snappedFrameRate === 30);

  return {
    detectedFrameRate,
    snappedFrameRate,
    minDeltaFps,
    isVariable,
    sloMoReexportedAt30,
  };
}
