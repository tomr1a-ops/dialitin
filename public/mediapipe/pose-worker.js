import { FilesetResolver, PoseLandmarker } from "./vision_bundle.mjs";

/** @type {PoseLandmarker | null} */
let landmarker = null;

function workerHasOffscreenCanvas() {
  if (typeof OffscreenCanvas === "undefined") {
    return false;
  }
  try {
    return new OffscreenCanvas(1, 1).getContext("2d") !== null;
  } catch {
    return false;
  }
}

function workerHasWebGL() {
  if (typeof OffscreenCanvas === "undefined") {
    return false;
  }
  try {
    const canvas = new OffscreenCanvas(1, 1);
    return Boolean(
      canvas.getContext("webgl2") ||
        canvas.getContext("webgl") ||
        canvas.getContext("experimental-webgl"),
    );
  } catch {
    return false;
  }
}

/**
 * @param {"GPU" | "CPU"} delegate
 * @param {string} wasmPath
 * @param {string} modelPath
 */
async function createLandmarker(delegate, wasmPath, modelPath) {
  if (delegate === "GPU") {
    if (!workerHasOffscreenCanvas()) {
      throw new Error("OffscreenCanvas unsupported in worker");
    }
    if (!workerHasWebGL()) {
      throw new Error("WebGL context failure in worker");
    }
  }
  const vision = await FilesetResolver.forVisionTasks(wasmPath);
  return PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: modelPath,
      delegate,
    },
    runningMode: "VIDEO",
    numPoses: 2,
    minPoseDetectionConfidence: 0.4,
    minPosePresenceConfidence: 0.4,
    minTrackingConfidence: 0.4,
  });
}

self.onmessage = async (event) => {
  const data = event.data;
  try {
    if (data.type === "init") {
      const delegate = data.delegate === "CPU" ? "CPU" : "GPU";
      landmarker = await createLandmarker(
        delegate,
        data.wasmPath,
        data.modelPath,
      );
      self.postMessage({ type: "ready", delegate });
      return;
    }

    if (data.type === "detect" && landmarker) {
      const result = landmarker.detectForVideo(data.bitmap, data.timestampMs);
      data.bitmap.close();
      const poses = result.landmarks.map((pose) =>
        pose.map((landmark) => ({
          x: landmark.x,
          y: landmark.y,
          visibility: landmark.visibility ?? 0,
        })),
      );
      self.postMessage({ type: "result", requestId: data.requestId, poses });
      return;
    }

    if (data.type === "close") {
      landmarker?.close();
      landmarker = null;
    }
  } catch (error) {
    if (data.bitmap) {
      data.bitmap.close();
    }
    self.postMessage({
      type: "error",
      requestId: data.requestId,
      message: error instanceof Error ? error.message : "Pose worker failed",
    });
  }
};
