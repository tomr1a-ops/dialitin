import {
  hipMidpoint,
  padLandmarks,
  pickLargestCentralPerson,
  poseBounds,
} from "@/lib/pose/isolate";
import {
  LEFT_SHOULDER,
  RIGHT_SHOULDER,
  type CropBox,
  type PoseLandmark,
} from "@/lib/pose/types";

export const TRACK_HIP_JUMP_TORSO_FRACTION = 0.25;
export const TRACK_SCALE_CHANGE_FRACTION = 0.3;

export type TorsoMetrics = {
  hipCenter: { x: number; y: number };
  torsoHeight: number;
  torsoScale: number;
};

function visibleLandmark(pose: PoseLandmark[], index: number) {
  const point = pose[index];
  if (!point || point.visibility < 0.2) {
    return null;
  }
  return point;
}

function toCanvasPoint(
  crop: CropBox,
  x: number,
  y: number,
): { x: number; y: number } {
  return {
    x: crop.x + x * crop.width,
    y: crop.y + y * crop.height,
  };
}

/** Metrics in work-canvas pixels so recentering the crop does not look like a jump. */
export function torsoMetrics(
  pose: PoseLandmark[],
  crop: CropBox,
): TorsoMetrics | null {
  const hip = hipMidpoint(pose);
  if (!hip) {
    return null;
  }
  const ls = visibleLandmark(pose, LEFT_SHOULDER);
  const rs = visibleLandmark(pose, RIGHT_SHOULDER);
  const hipCanvas = toCanvasPoint(crop, hip.x, hip.y);
  const shoulderY =
    ls && rs ? (ls.y + rs.y) / 2 : ls?.y ?? rs?.y ?? hip.y - 0.2;
  const shoulderCanvas = toCanvasPoint(crop, ls?.x ?? rs?.x ?? hip.x, shoulderY);
  const torsoHeight = Math.max(
    Math.hypot(
      hipCanvas.x - shoulderCanvas.x,
      hipCanvas.y - shoulderCanvas.y,
    ),
    crop.height * 0.02,
  );
  const box = poseBounds(pose);
  const torsoScale = box
    ? Math.max(box.height * crop.height, torsoHeight)
    : torsoHeight;
  return {
    hipCenter: hipCanvas,
    torsoHeight,
    torsoScale,
  };
}

export function isTrackingLost(
  previous: TorsoMetrics | null,
  next: TorsoMetrics | null,
  seedScale: number | null = null,
): boolean {
  if (!previous || !next) {
    return false;
  }
  const hipJump = Math.hypot(
    next.hipCenter.x - previous.hipCenter.x,
    next.hipCenter.y - previous.hipCenter.y,
  );
  if (hipJump > previous.torsoHeight * TRACK_HIP_JUMP_TORSO_FRACTION) {
    return true;
  }
  const referenceScale = seedScale ?? previous.torsoScale;
  if (referenceScale <= 0) {
    return false;
  }
  const scaleDelta = Math.abs(next.torsoScale - referenceScale) / referenceScale;
  return scaleDelta > TRACK_SCALE_CHANGE_FRACTION;
}

export function pickTrackedPerson(
  poses: PoseLandmark[][],
  crop: CropBox,
  previous: TorsoMetrics | null,
): PoseLandmark[] | null {
  const candidates = poses
    .map((pose) => padLandmarks(pose))
    .filter((pose) => torsoMetrics(pose, crop));
  if (candidates.length === 0) {
    return null;
  }
  if (!previous) {
    return pickLargestCentralPerson(candidates);
  }
  let best: PoseLandmark[] | null = null;
  let bestDistance = Infinity;
  for (const pose of candidates) {
    const metrics = torsoMetrics(pose, crop);
    if (!metrics) {
      continue;
    }
    const distance = Math.hypot(
      metrics.hipCenter.x - previous.hipCenter.x,
      metrics.hipCenter.y - previous.hipCenter.y,
    );
    if (distance < bestDistance) {
      bestDistance = distance;
      best = pose;
    }
  }
  return best;
}

export function invalidateLandmarks(landmarks: PoseLandmark[]): PoseLandmark[] {
  return landmarks.map((point) => ({
    x: point.x,
    y: point.y,
    visibility: 0,
  }));
}
