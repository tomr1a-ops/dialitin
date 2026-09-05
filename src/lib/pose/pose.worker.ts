/// <reference lib="webworker" />

import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

declare const self: DedicatedWorkerGlobalScope & {
  ModuleFactory?: unknown;
};

type PoseDelegate = "GPU" | "CPU";

type InitMessage = {
  type: "init";
  wasmPath: string;
  modelPath: string;
  delegate: PoseDelegate;
};

type DetectMessage = {
  type: "detect";
  requestId: number;
  bitmap: ImageBitmap;
  timestampMs: number;
};

type CloseMessage = {
  type: "close";
};

type WorkerIn = InitMessage | DetectMessage | CloseMessage;

const LANDMARKER_OPTIONS = {
  runningMode: "VIDEO" as const,
  numPoses: 2,
  minPoseDetectionConfidence: 0.4,
  minPosePresenceConfidence: 0.4,
  minTrackingConfidence: 0.4,
};

let landmarker: PoseLandmarker | null = null;

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
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

async function installEsmModuleFactory(wasmDir: string) {
  const url = `${wasmDir.replace(/\/$/, "")}/vision_wasm_module_internal.js`;
  const glue = (await import(/* webpackIgnore: true */ url)) as {
    default?: unknown;
  };
  if (glue.default) {
    self.ModuleFactory = glue.default;
  }
}

async function installClassicModuleFactory(jsUrl: string) {
  const response = await fetch(jsUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${jsUrl} (${response.status})`);
  }
  const source = await response.text();
  const blob = new Blob(
    [
      `${source}\nglobalThis.ModuleFactory = ModuleFactory;\nexport default ModuleFactory;\n`,
    ],
    { type: "text/javascript" },
  );
  const blobUrl = URL.createObjectURL(blob);
  try {
    await import(/* webpackIgnore: true */ blobUrl);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

/**
 * Module workers cannot importScripts() the classic wasm glue, which is
 * why Phase 0 fell through with "ModuleFactory not set." tasks-vision 1.0.1
 * ships an ESM loader (useModule=true) that assigns globalThis.ModuleFactory.
 */
async function createLandmarker(
  delegate: PoseDelegate,
  wasmPath: string,
  modelPath: string,
) {
  if (delegate === "GPU") {
    if (!workerHasOffscreenCanvas()) {
      throw new Error("OffscreenCanvas unsupported in worker");
    }
    if (!workerHasWebGL()) {
      throw new Error("WebGL context failure in worker");
    }
  }

  const wasmDir = wasmPath.replace(/\/$/, "");
  try {
    await installEsmModuleFactory(wasmDir);
    const vision = await FilesetResolver.forVisionTasks(wasmDir, true);
    return PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: modelPath, delegate },
      ...LANDMARKER_OPTIONS,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/ModuleFactory not set/i.test(message)) {
      throw error;
    }
    await installClassicModuleFactory(`${wasmDir}/vision_wasm_internal.js`);
    const vision = await FilesetResolver.forVisionTasks(wasmDir, false);
    return PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: modelPath, delegate },
      ...LANDMARKER_OPTIONS,
    });
  }
}

self.onmessage = async (event: MessageEvent<WorkerIn>) => {
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
    if ("bitmap" in data && data.bitmap) {
      data.bitmap.close();
    }
    self.postMessage({
      type: "error",
      requestId: "requestId" in data ? data.requestId : undefined,
      message: error instanceof Error ? error.message : "Pose worker failed",
    });
  }
};
