import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import type { PoseLandmark } from "@/lib/pose/types";

export const MEDIAPIPE_TASKS_VISION_VERSION = "1.0.1";

export type PoseDelegate = "GPU" | "CPU";

type WorkerMessage =
  | { type: "ready"; delegate: PoseDelegate }
  | { type: "result"; requestId: number; poses: PoseLandmark[][] }
  | { type: "error"; requestId?: number; message: string };

function assetPaths() {
  const origin = window.location.origin;
  return {
    wasmPath: `${origin}/mediapipe/wasm`,
    modelPath: `${origin}/mediapipe/pose_landmarker_lite.task`,
  };
}

const LANDMARKER_OPTIONS = {
  runningMode: "VIDEO" as const,
  numPoses: 2,
  minPoseDetectionConfidence: 0.4,
  minPosePresenceConfidence: 0.4,
  minTrackingConfidence: 0.4,
};

async function createLandmarker(
  vision: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>,
  modelPath: string,
  delegate: PoseDelegate,
) {
  return PoseLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: modelPath, delegate },
    ...LANDMARKER_OPTIONS,
  });
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

async function createMainThreadLandmarker(): Promise<{
  landmarker: PoseLandmarker;
  delegate: PoseDelegate;
}> {
  const { wasmPath, modelPath } = assetPaths();
  const vision = await FilesetResolver.forVisionTasks(wasmPath);
  try {
    return {
      landmarker: await withTimeout(
        createLandmarker(vision, modelPath, "GPU"),
        4000,
        "GPU delegate timed out",
      ),
      delegate: "GPU",
    };
  } catch {
    return {
      landmarker: await createLandmarker(vision, modelPath, "CPU"),
      delegate: "CPU",
    };
  }
}

export type PoseRuntime = {
  detect(bitmap: ImageBitmap, timestampMs: number): Promise<PoseLandmark[][]>;
  close(): void;
};

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
    const { wasmPath, modelPath } = assetPaths();
    const timer = window.setTimeout(() => {
      worker.terminate();
      reject(new Error(`Pose worker ${delegate} timed out`));
    }, timeoutMs);
    const onError = () => {
      cleanup();
      worker.terminate();
      reject(new Error("Pose worker failed to load"));
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

export async function createPoseRuntime(): Promise<{
  runtime: PoseRuntime;
  backend: "worker" | "main-thread";
  delegate: PoseDelegate;
}> {
  let workerLoadFailed = false;
  for (const [delegate, timeoutMs] of [
    ["GPU", 5000],
    ["CPU", 8000],
  ] as const) {
    if (workerLoadFailed) {
      break;
    }
    try {
      const started = await startWorker(delegate, timeoutMs);
      console.info(`[swingread] pose runtime worker/${started.delegate}`);
      return {
        runtime: new WorkerPoseRuntime(started.worker),
        backend: "worker",
        delegate: started.delegate,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[swingread] pose worker ${delegate} unavailable`, message);
      if (message.includes("failed to load")) {
        workerLoadFailed = true;
      }
    }
  }
  const started = await createMainThreadLandmarker();
  console.info(`[swingread] pose runtime main-thread/${started.delegate}`);
  return {
    runtime: new MainThreadPoseRuntime(started.landmarker),
    backend: "main-thread",
    delegate: started.delegate,
  };
}
