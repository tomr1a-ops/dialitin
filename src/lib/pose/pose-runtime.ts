import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import type { PoseLandmark } from "@/lib/pose/types";

export const MEDIAPIPE_TASKS_VISION_VERSION = "1.0.1";

type WorkerMessage =
  | { type: "ready" }
  | { type: "result"; requestId: number; poses: PoseLandmark[][] }
  | { type: "error"; requestId?: number; message: string };

function assetPaths() {
  const origin = window.location.origin;
  return {
    wasmPath: `${origin}/mediapipe/wasm`,
    modelPath: `${origin}/mediapipe/pose_landmarker_lite.task`,
  };
}

async function createMainThreadLandmarker() {
  const { wasmPath, modelPath } = assetPaths();
  const vision = await FilesetResolver.forVisionTasks(wasmPath);
  try {
    return await PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: modelPath, delegate: "GPU" },
      runningMode: "VIDEO",
      numPoses: 2,
      minPoseDetectionConfidence: 0.4,
      minPosePresenceConfidence: 0.4,
      minTrackingConfidence: 0.4,
    });
  } catch {
    return PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: modelPath, delegate: "CPU" },
      runningMode: "VIDEO",
      numPoses: 2,
      minPoseDetectionConfidence: 0.4,
      minPosePresenceConfidence: 0.4,
      minTrackingConfidence: 0.4,
    });
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

function startWorker(): Promise<Worker> {
  return new Promise((resolve, reject) => {
    const worker = new Worker("/mediapipe/pose-worker.js", { type: "module" });
    const { wasmPath, modelPath } = assetPaths();
    const timer = window.setTimeout(() => {
      worker.terminate();
      reject(new Error("Pose worker timed out"));
    }, 20000);
    worker.addEventListener(
      "message",
      (event: MessageEvent<WorkerMessage>) => {
        if (event.data.type === "ready") {
          window.clearTimeout(timer);
          resolve(worker);
        }
        if (event.data.type === "error") {
          window.clearTimeout(timer);
          worker.terminate();
          reject(new Error(event.data.message));
        }
      },
      { once: true },
    );
    worker.addEventListener(
      "error",
      () => {
        window.clearTimeout(timer);
        worker.terminate();
        reject(new Error("Pose worker failed to load"));
      },
      { once: true },
    );
    worker.postMessage({ type: "init", wasmPath, modelPath });
  });
}

export async function createPoseRuntime(): Promise<{
  runtime: PoseRuntime;
  backend: "worker" | "main-thread";
}> {
  try {
    const worker = await startWorker();
    return { runtime: new WorkerPoseRuntime(worker), backend: "worker" };
  } catch {
    const landmarker = await createMainThreadLandmarker();
    return {
      runtime: new MainThreadPoseRuntime(landmarker),
      backend: "main-thread",
    };
  }
}
