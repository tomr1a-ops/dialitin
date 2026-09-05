import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import { POSE_MODEL, POSE_WASM_DIR, assetUrl } from "@/lib/pose/assets";
import {
  detectPoseCapabilities,
  isWorkerScriptLoadFailure,
  posePathsToTry,
  type PosePathId,
  type PosePathPlan,
} from "@/lib/pose/capabilities";
import { loadPoseAssets } from "@/lib/pose/load-assets";
import type { PoseLandmark } from "@/lib/pose/types";

export const MEDIAPIPE_TASKS_VISION_VERSION = "1.0.1";

export type PoseDelegate = "GPU" | "CPU";

export type PoseRuntime = {
  detect(bitmap: ImageBitmap, timestampMs: number): Promise<PoseLandmark[][]>;
  close(): void;
};

export type PoseRuntimeStart = {
  runtime: PoseRuntime;
  backend: "worker" | "main-thread";
  delegate: PoseDelegate;
  path: PosePathId;
};

type WorkerMessage =
  | { type: "ready"; delegate: PoseDelegate }
  | { type: "result"; requestId: number; poses: PoseLandmark[][] }
  | { type: "error"; requestId?: number; message: string };

const LANDMARKER_OPTIONS = {
  runningMode: "VIDEO" as const,
  numPoses: 2,
  minPoseDetectionConfidence: 0.4,
  minPosePresenceConfidence: 0.4,
  minTrackingConfidence: 0.4,
};

function pinnedFileset() {
  return {
    wasmPath: assetUrl(POSE_WASM_DIR),
    modelPath: assetUrl(POSE_MODEL.url),
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function createMainThreadLandmarker() {
  const { wasmPath, modelPath } = pinnedFileset();
  const vision = await FilesetResolver.forVisionTasks(wasmPath);
  return PoseLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: modelPath, delegate: "CPU" },
    ...LANDMARKER_OPTIONS,
  });
}

class WorkerPoseRuntime implements PoseRuntime {
  private nextId = 1;
  private lastTimestamp = -1;
  private pending = new Map<
    number,
    {
      resolve: (poses: PoseLandmark[][]) => void;
      reject: (error: Error) => void;
    }
  >();

  constructor(private worker: Worker) {
    this.worker.addEventListener(
      "message",
      (event: MessageEvent<WorkerMessage>) => {
        const data = event.data;
        if (data.type === "result") {
          this.pending.get(data.requestId)?.resolve(data.poses);
          this.pending.delete(data.requestId);
        }
        if (data.type === "error" && data.requestId !== undefined) {
          this.pending.get(data.requestId)?.reject(new Error(data.message));
          this.pending.delete(data.requestId);
        }
      },
    );
  }

  detect(bitmap: ImageBitmap, timestampMs: number): Promise<PoseLandmark[][]> {
    const requestId = this.nextId;
    this.nextId += 1;
    let stamp = timestampMs;
    if (stamp <= this.lastTimestamp) {
      stamp = this.lastTimestamp + 1;
    }
    this.lastTimestamp = stamp;
    const result = new Promise<PoseLandmark[][]>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
    });
    this.worker.postMessage(
      { type: "detect", requestId, bitmap, timestampMs: stamp },
      [bitmap],
    );
    return result;
  }

  close() {
    this.worker.postMessage({ type: "close" });
    this.worker.terminate();
  }
}

class MainThreadPoseRuntime implements PoseRuntime {
  private lastTimestamp = -1;

  constructor(private landmarker: PoseLandmarker) {}

  detect(bitmap: ImageBitmap, timestampMs: number): Promise<PoseLandmark[][]> {
    let stamp = timestampMs;
    if (stamp <= this.lastTimestamp) {
      stamp = this.lastTimestamp + 1;
    }
    this.lastTimestamp = stamp;
    const result = this.landmarker.detectForVideo(bitmap, stamp);
    bitmap.close();
    return Promise.resolve(
      result.landmarks.map((pose) =>
        pose.map((landmark) => ({
          x: landmark.x,
          y: landmark.y,
          visibility: landmark.visibility ?? 0,
        })),
      ),
    );
  }

  close() {
    this.landmarker.close();
  }
}

function startWorker(
  delegate: PoseDelegate,
  timeoutMs: number,
): Promise<{ worker: Worker; delegate: PoseDelegate }> {
  return new Promise((resolve, reject) => {
    const worker = new Worker("/mediapipe/pose-worker.js", { type: "module" });
    const { wasmPath, modelPath } = pinnedFileset();
    const timer = window.setTimeout(() => {
      worker.terminate();
      reject(new Error(`Pose worker ${delegate} timed out`));
    }, timeoutMs);
    const onError = (event: ErrorEvent) => {
      cleanup();
      worker.terminate();
      reject(new Error(event.message || "Pose worker failed to load"));
    };
    const onMessage = (event: MessageEvent<WorkerMessage>) => {
      if (event.data.type === "ready") {
        cleanup();
        resolve({
          worker,
          delegate: event.data.delegate === "CPU" ? "CPU" : delegate,
        });
        return;
      }
      if (event.data.type === "error") {
        cleanup();
        worker.terminate();
        reject(new Error(event.data.message));
      }
    };
    const cleanup = () => {
      window.clearTimeout(timer);
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
    };
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    worker.postMessage({ type: "init", wasmPath, modelPath, delegate });
  });
}

async function startPath(plan: PosePathPlan): Promise<PoseRuntimeStart> {
  if (plan.backend === "worker") {
    const timeoutMs = plan.delegate === "GPU" ? 5000 : 8000;
    const started = await startWorker(plan.delegate, timeoutMs);
    return {
      runtime: new WorkerPoseRuntime(started.worker),
      backend: "worker",
      delegate: started.delegate,
      path: plan.id,
    };
  }

  const landmarker = await withTimeout(
    createMainThreadLandmarker(),
    15000,
    "Main-thread pose init timed out",
  );
  return {
    runtime: new MainThreadPoseRuntime(landmarker),
    backend: "main-thread",
    delegate: "CPU",
    path: "main-thread+CPU",
  };
}

export async function createPoseRuntime(options?: {
  onModelProgress?: (loadedBytes: number, totalBytes: number) => void;
}): Promise<PoseRuntimeStart> {
  await loadPoseAssets(options?.onModelProgress);

  const paths = posePathsToTry(detectPoseCapabilities());
  const failures: string[] = [];
  let skipRemainingWorkers = false;

  for (const plan of paths) {
    if (skipRemainingWorkers && plan.backend === "worker") {
      continue;
    }
    try {
      const started = await startPath(plan);
      console.info(`[swingread] pose path ${started.path}`);
      return started;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[swingread] pose path ${plan.id} failed`, message);
      failures.push(`${plan.id}: ${message}`);
      if (plan.backend === "worker" && isWorkerScriptLoadFailure(message)) {
        skipRemainingWorkers = true;
      }
    }
  }

  throw new Error(
    failures.length > 0
      ? failures.join(" → ")
      : "No pose backend is available on this browser",
  );
}
