/// <reference lib="webworker" />

import { detectVerticalRollFromImageData } from "@/lib/engine/vertical-hough";

declare const self: DedicatedWorkerGlobalScope;

type VerticalRollMessage = {
  type: "vertical_roll";
  requestId: number;
  bitmap: ImageBitmap;
};

self.onmessage = (event: MessageEvent<VerticalRollMessage>) => {
  const data = event.data;
  if (data.type !== "vertical_roll") {
    return;
  }
  try {
    const canvas = new OffscreenCanvas(data.bitmap.width, data.bitmap.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      data.bitmap.close();
      self.postMessage({
        type: "vertical_roll_result",
        requestId: data.requestId,
        result: {
          rollDeg: 0,
          confidence: 0,
          valid: false,
          reason: "OffscreenCanvas unavailable in angle worker",
        },
      });
      return;
    }
    ctx.drawImage(data.bitmap, 0, 0);
    data.bitmap.close();
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const result = detectVerticalRollFromImageData(image);
    self.postMessage({
      type: "vertical_roll_result",
      requestId: data.requestId,
      result,
    });
  } catch {
    data.bitmap.close();
    self.postMessage({
      type: "vertical_roll_result",
      requestId: data.requestId,
      result: {
        rollDeg: 0,
        confidence: 0,
        valid: false,
        reason: "angle worker vertical Hough failed",
      },
    });
  }
};
