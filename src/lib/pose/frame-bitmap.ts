import { POSE_SHORT_SIDE, type CropBox } from "@/lib/pose/types";

export type PoseWorkCanvas = OffscreenCanvas | HTMLCanvasElement;

export type PoseWorkFrame = {
  canvas: PoseWorkCanvas;
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

export function createPoseWorkCanvas(): PoseWorkCanvas {
  if (typeof OffscreenCanvas !== "undefined") {
    try {
      const canvas = new OffscreenCanvas(2, 2);
      if (canvas.getContext("2d")) {
        return canvas;
      }
    } catch {
      // Safari can expose the constructor without a usable 2D context.
    }
  }
  if (typeof document === "undefined") {
    throw new Error("OffscreenCanvas is unavailable.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 2;
  if (!canvas.getContext("2d")) {
    throw new Error("OffscreenCanvas is unavailable.");
  }
  return canvas;
}

function canvas2d(
  canvas: PoseWorkCanvas,
): OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D {
  const context = canvas.getContext("2d");
  if (!context || !("drawImage" in context)) {
    throw new Error("OffscreenCanvas is unavailable.");
  }
  return context;
}

export function drawVideoToPoseCanvas(
  video: HTMLVideoElement,
  canvas: PoseWorkCanvas,
): PoseWorkFrame {
  const frameWidth = video.videoWidth;
  const frameHeight = video.videoHeight;
  const size = poseDownscaleSize(frameWidth, frameHeight);
  if (canvas.width !== size.width || canvas.height !== size.height) {
    canvas.width = size.width;
    canvas.height = size.height;
  }
  canvas2d(canvas).drawImage(video, 0, 0, size.width, size.height);
  return {
    canvas,
    width: size.width,
    height: size.height,
    scale: size.scale,
    frameWidth,
    frameHeight,
  };
}

export async function grabCanvasBitmap(
  canvas: PoseWorkCanvas,
  crop: CropBox | null,
): Promise<ImageBitmap> {
  const source = crop ?? {
    x: 0,
    y: 0,
    width: canvas.width,
    height: canvas.height,
  };
  const dest = createPoseWorkCanvas();
  dest.width = Math.max(2, Math.round(source.width));
  dest.height = Math.max(2, Math.round(source.height));
  canvas2d(dest).drawImage(
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
  if ("transferToImageBitmap" in dest) {
    try {
      return dest.transferToImageBitmap();
    } catch {
      // iPhone Safari can reject transferToImageBitmap on some canvases.
    }
  }
  return createImageBitmap(dest);
}
