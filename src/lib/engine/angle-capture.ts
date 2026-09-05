import type { VerticalRollResult } from "@/lib/engine/vertical-hough";
import { detectVerticalRollFromImageData } from "@/lib/engine/vertical-hough";

export type { VerticalRollResult };

type VerticalRollResponse = {
  type: "vertical_roll_result";
  requestId: number;
  result: VerticalRollResult;
};

let worker: Worker | null = null;
let workerFailed = false;

function getWorker(): Worker | null {
  if (workerFailed || typeof Worker === "undefined") {
    return null;
  }
  if (!worker) {
    try {
      worker = new Worker(new URL("../pose/angle.worker.ts", import.meta.url), {
        type: "module",
      });
    } catch {
      workerFailed = true;
      return null;
    }
  }
  return worker;
}

export async function detectVerticalRollFromBitmap(
  bitmap: ImageBitmap,
): Promise<VerticalRollResult> {
  const w = getWorker();
  if (w) {
    const worker = w;
    return new Promise((resolve) => {
      const requestId = Math.floor(Math.random() * 1_000_000);
      const timeout = window.setTimeout(() => {
        worker.removeEventListener("message", onMessage);
        resolve({
          rollDeg: 0,
          confidence: 0,
          valid: false,
          reason: "vertical roll worker timed out",
        });
      }, 4000);

      function onMessage(event: MessageEvent<VerticalRollResponse>) {
        const data = event.data;
        if (data.type !== "vertical_roll_result" || data.requestId !== requestId) {
          return;
        }
        window.clearTimeout(timeout);
        worker.removeEventListener("message", onMessage);
        resolve(data.result);
      }

      worker.addEventListener("message", onMessage);
      worker.postMessage({ type: "vertical_roll", requestId, bitmap }, [bitmap]);
    });
  }

  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close?.();
      return {
        rollDeg: 0,
        confidence: 0,
        valid: false,
        reason: "no 2d context for vertical Hough",
      };
    }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close?.();
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return detectVerticalRollFromImageData(image);
  } catch {
    bitmap.close?.();
    return {
      rollDeg: 0,
      confidence: 0,
      valid: false,
      reason: "vertical Hough failed on main thread",
    };
  }
}

/** Grab a video frame at timeMs and run background-vertical roll detection. */
export async function detectVerticalRollFromVideo(
  video: HTMLVideoElement,
  timeMs: number,
): Promise<VerticalRollResult> {
  const seek = () =>
    new Promise<void>((resolve, reject) => {
      const onSeeked = () => {
        video.removeEventListener("seeked", onSeeked);
        resolve();
      };
      video.addEventListener("seeked", onSeeked);
      video.currentTime = timeMs / 1000;
      if (Math.abs(video.currentTime - timeMs / 1000) < 0.001) {
        video.removeEventListener("seeked", onSeeked);
        resolve();
      }
      video.addEventListener("error", () => reject(new Error("seek failed")), {
        once: true,
      });
    });

  if (video.readyState < 2) {
    await new Promise<void>((resolve) => {
      video.addEventListener("loadeddata", () => resolve(), { once: true });
    });
  }
  await seek();

  const shortSide = 320;
  const scale = shortSide / Math.max(video.videoWidth, video.videoHeight);
  const width = Math.max(1, Math.round(video.videoWidth * scale));
  const height = Math.max(1, Math.round(video.videoHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return {
      rollDeg: 0,
      confidence: 0,
      valid: false,
      reason: "no canvas for address frame",
    };
  }
  ctx.drawImage(video, 0, 0, width, height);
  const image = ctx.getImageData(0, 0, width, height);
  return detectVerticalRollFromImageData(image);
}

export async function detectVerticalRollFromClip(
  clip: Blob,
  timeMs: number,
): Promise<VerticalRollResult> {
  const url = URL.createObjectURL(clip);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  try {
    return await detectVerticalRollFromVideo(video, timeMs);
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.remove();
    URL.revokeObjectURL(url);
  }
}
