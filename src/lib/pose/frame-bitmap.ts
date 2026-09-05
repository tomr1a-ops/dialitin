import { POSE_SHORT_SIDE, type CropBox } from "@/lib/pose/types";

export type PoseWorkFrame = {
  canvas: OffscreenCanvas;
  width: number;
  height: number;
  scale: number;
  frameWidth: number;
  frameHeight: number;
};

export function poseDownscaleSize(width: number, height: number) {
  const short = Math.min(width, height);
  const scale = Math.min(1, POSE_SHORT_SIDE / Math.max(short, 1));
  return {
    width: Math.max(2, Math.round(width * scale)),
    height: Math.max(2, Math.round(height * scale)),
    scale,
  };
}

export function drawVideoToPoseCanvas(
  video: HTMLVideoElement,
  canvas: OffscreenCanvas,
): PoseWorkFrame {
  const frameWidth = video.videoWidth;
  const frameHeight = video.videoHeight;
  const size = poseDownscaleSize(frameWidth, frameHeight);
  if (canvas.width !== size.width || canvas.height !== size.height) {
    canvas.width = size.width;
    canvas.height = size.height;
  }
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("OffscreenCanvas is unavailable.");
  }
  context.drawImage(video, 0, 0, size.width, size.height);
  return {
    canvas,
    width: size.width,
    height: size.height,
    scale: size.scale,
    frameWidth,
    frameHeight,
  };
}

export function grabCanvasBitmap(
  canvas: OffscreenCanvas,
  crop: CropBox | null,
): ImageBitmap {
  const source = crop ?? {
    x: 0,
    y: 0,
    width: canvas.width,
    height: canvas.height,
  };
  const dest = new OffscreenCanvas(
    Math.max(2, Math.round(source.width)),
    Math.max(2, Math.round(source.height)),
  );
  const context = dest.getContext("2d");
  if (!context) {
    throw new Error("OffscreenCanvas is unavailable.");
  }
  context.drawImage(
    canvas,
    source.x,
    source.y,
    source.width,
    source.height,
    0,
    0,
    dest.width,
    dest.height,
  );
  return dest.transferToImageBitmap();
}
