import {
  CROP_MARGIN,
  LEFT_HIP,
  POSE_LANDMARK_COUNT,
  RIGHT_HIP,
  type CropBox,
  type PoseLandmark,
} from "@/lib/pose/types";

function landmarkAt(pose: PoseLandmark[], index: number): PoseLandmark | null {
  const point = pose[index];
  if (!point || point.visibility < 0.2) {
    return null;
  }
  return point;
}

export function hipMidpoint(pose: PoseLandmark[]): PoseLandmark | null {
  const left = landmarkAt(pose, LEFT_HIP);
  const right = landmarkAt(pose, RIGHT_HIP);
  if (left && right) {
    return {
      x: (left.x + right.x) / 2,
      y: (left.y + right.y) / 2,
      visibility: Math.min(left.visibility, right.visibility),
    };
  }
  return left ?? right;
}

export function poseBounds(pose: PoseLandmark[]): CropBox | null {
  const visible = pose.filter((point) => point.visibility >= 0.2);
  if (visible.length < 4) {
    return null;
  }
  const xs = visible.map((point) => point.x);
  const ys = visible.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    width: Math.max(Math.max(...xs) - x, 0.02),
    height: Math.max(Math.max(...ys) - y, 0.02),
  };
}

export function scorePerson(pose: PoseLandmark[]): number {
  const box = poseBounds(pose);
  const hip = hipMidpoint(pose);
  if (!box || !hip) {
    return 0;
  }
  const area = box.width * box.height;
  const centerDistance = Math.hypot(hip.x - 0.5, hip.y - 0.5);
  return area * (1.2 - Math.min(centerDistance, 1));
}

export function pickLargestCentralPerson(
  poses: PoseLandmark[][],
): PoseLandmark[] | null {
  let best: PoseLandmark[] | null = null;
  let bestScore = 0;
  for (const pose of poses) {
    if (pose.length < POSE_LANDMARK_COUNT) {
      continue;
    }
    const score = scorePerson(pose);
    if (score > bestScore) {
      best = pose;
      bestScore = score;
    }
  }
  return best;
}

export function cropFromPerson(
  pose: PoseLandmark[],
  frameWidth: number,
  frameHeight: number,
  margin = CROP_MARGIN,
): CropBox | null {
  const box = poseBounds(pose);
  if (!box) {
    return null;
  }
  const padX = box.width * margin;
  const padY = box.height * margin;
  return clampCrop(
    {
      x: (box.x - padX) * frameWidth,
      y: (box.y - padY) * frameHeight,
      width: (box.width + padX * 2) * frameWidth,
      height: (box.height + padY * 2) * frameHeight,
    },
    frameWidth,
    frameHeight,
  );
}

export function recenterCropOnHips(
  crop: CropBox,
  poseInCrop: PoseLandmark[],
  frameWidth: number,
  frameHeight: number,
): CropBox {
  const hip = hipMidpoint(poseInCrop);
  if (!hip) {
    return crop;
  }
  const hipX = crop.x + hip.x * crop.width;
  const hipY = crop.y + hip.y * crop.height;
  return clampCrop(
    {
      x: hipX - crop.width / 2,
      y: hipY - crop.height / 2,
      width: crop.width,
      height: crop.height,
    },
    frameWidth,
    frameHeight,
  );
}

export function clampCrop(
  crop: CropBox,
  frameWidth: number,
  frameHeight: number,
): CropBox {
  const width = Math.min(Math.max(crop.width, 32), frameWidth);
  const height = Math.min(Math.max(crop.height, 32), frameHeight);
  const x = Math.min(Math.max(crop.x, 0), frameWidth - width);
  const y = Math.min(Math.max(crop.y, 0), frameHeight - height);
  return { x, y, width, height };
}

export function fullFrameCrop(
  frameWidth: number,
  frameHeight: number,
): CropBox {
  return { x: 0, y: 0, width: frameWidth, height: frameHeight };
}

export function padLandmarks(pose: PoseLandmark[] | undefined): PoseLandmark[] {
  const next = pose ? pose.slice(0, POSE_LANDMARK_COUNT) : [];
  while (next.length < POSE_LANDMARK_COUNT) {
    next.push({ x: 0, y: 0, visibility: 0 });
  }
  return next;
}
