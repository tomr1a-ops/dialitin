import { POSE_MAX_EDGE, type CropBox } from "@/lib/pose/types";

function scaledSize(width: number, height: number) {
  const scale = Math.min(1, POSE_MAX_EDGE / Math.max(width, height, 1));
  return {
    width: Math.max(2, Math.round(width * scale)),
    height: Math.max(2, Math.round(height * scale)),
  };
}

export function grabVideoBitmap(
  video: HTMLVideoElement,
  crop: CropBox | null,
): ImageBitmap {
  const frameWidth = video.videoWidth;
  const frameHeight = video.videoHeight;
  const source = crop ?? {
    x: 0,
    y: 0,
    width: frameWidth,
    height: frameHeight,
  };
  const size = scaledSize(source.width, source.height);
  const canvas = new OffscreenCanvas(size.width, size.height);
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("OffscreenCanvas is unavailable.");
  }
  context.drawImage(
    video,
    source.x,
    source.y,
    source.width,
    source.height,
    0,
    0,
    size.width,
    size.height,
  );
  return canvas.transferToImageBitmap();
}
