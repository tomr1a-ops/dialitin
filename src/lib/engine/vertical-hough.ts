/**
 * Light Hough pass for near-vertical structure in the address frame (§5.1 Case B).
 * Runs on a downscaled grayscale image; pure CPU, no LLM.
 */

export type VerticalRollResult = {
  rollDeg: number;
  confidence: number;
  valid: boolean;
  reason: string | null;
};

const MIN_CONFIDENCE = 0.35;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

/** Downscale + grayscale into a compact buffer for Hough. */
export function rasterizeDownscaled(
  source: ImageData,
  targetWidth: number,
): { gray: Float32Array; width: number; height: number; scale: number } {
  const scale = targetWidth / source.width;
  const width = targetWidth;
  const height = Math.max(1, Math.round(source.height * scale));
  const gray = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sx = Math.min(source.width - 1, Math.round(x / scale));
      const sy = Math.min(source.height - 1, Math.round(y / scale));
      const i = (sy * source.width + sx) * 4;
      const r = source.data[i]!;
      const g = source.data[i + 1]!;
      const b = source.data[i + 2]!;
      gray[y * width + x] = 0.299 * r + 0.587 * g + 0.114 * b;
    }
  }
  return { gray, width, height, scale };
}

function sobelMagnitude(gray: Float32Array, width: number, height: number) {
  const mag = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const gx =
        -gray[idx - width - 1]! +
        gray[idx - width + 1]! -
        2 * gray[idx - 1]! +
        2 * gray[idx + 1]! -
        gray[idx + width - 1]! +
        gray[idx + width + 1]!;
      const gy =
        -gray[idx - width - 1]! -
        2 * gray[idx - width]! -
        gray[idx - width + 1]! +
        gray[idx + width - 1]! +
        2 * gray[idx + width]! +
        gray[idx + width + 1]!;
      mag[idx] = Math.hypot(gx, gy);
    }
  }
  return mag;
}

/**
 * Detect dominant near-vertical line; roll is deviation from plumb (degrees).
 */
export function detectVerticalRollFromImageData(
  image: ImageData,
  targetWidth = 160,
): VerticalRollResult {
  const { gray, width, height } = rasterizeDownscaled(image, targetWidth);
  const mag = sobelMagnitude(gray, width, height);
  let peak = 0;
  for (let i = 0; i < mag.length; i++) {
    peak = Math.max(peak, mag[i]!);
  }
  const threshold = peak * 0.35;
  if (peak < 8) {
    return {
      rollDeg: 0,
      confidence: 0,
      valid: false,
      reason: "no edges for vertical Hough",
    };
  }

  const angleBins = 41;
  const angleMin = -20;
  const angleMax = 20;
  const rhoMax = Math.ceil(Math.hypot(width, height));
  const rhoBins = rhoMax * 2 + 1;
  const accumulator = new Float32Array(angleBins * rhoBins);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const m = mag[y * width + x]!;
      if (m < threshold) {
        continue;
      }
      for (let ai = 0; ai < angleBins; ai++) {
        const thetaDeg = angleMin + (ai / (angleBins - 1)) * (angleMax - angleMin);
        const theta = (thetaDeg * Math.PI) / 180;
        const rho = x * Math.cos(theta) + y * Math.sin(theta);
        const ri = Math.round(rho + rhoMax);
        if (ri >= 0 && ri < rhoBins) {
          accumulator[ai * rhoBins + ri]! += m;
        }
      }
    }
  }

  let bestAi = 0;
  let bestVote = 0;
  let secondVote = 0;
  const angleTotals = new Float32Array(angleBins);
  for (let ai = 0; ai < angleBins; ai++) {
    let sum = 0;
    for (let ri = 0; ri < rhoBins; ri++) {
      sum += accumulator[ai * rhoBins + ri]!;
    }
    angleTotals[ai] = sum;
    if (sum > bestVote) {
      secondVote = bestVote;
      bestVote = sum;
      bestAi = ai;
    } else if (sum > secondVote) {
      secondVote = sum;
    }
  }

  if (bestVote <= 0) {
    return {
      rollDeg: 0,
      confidence: 0,
      valid: false,
      reason: "no vertical Hough peak",
    };
  }

  const rollDeg =
    angleMin + (bestAi / (angleBins - 1)) * (angleMax - angleMin);
  const ratio = secondVote / bestVote;
  const confidence = clamp(1 - ratio * 0.85, 0, 1);
  if (confidence < MIN_CONFIDENCE) {
    return {
      rollDeg,
      confidence,
      valid: false,
      reason: "weak vertical Hough confidence",
    };
  }

  return {
    rollDeg,
    confidence,
    valid: true,
    reason: "background vertical Hough",
  };
}
