export type PosePathId =
  | "worker+GPU"
  | "worker+CPU"
  | "main-thread+GPU"
  | "main-thread+CPU";

export type PoseCapabilities = {
  moduleWorker: boolean;
  webgl: boolean;
  offscreenCanvas: boolean;
};

export type PosePathPlan = {
  id: PosePathId;
  backend: "worker" | "main-thread";
  delegate: "GPU" | "CPU";
};

export const POSE_FALLBACK_ORDER: readonly PosePathPlan[] = [
  { id: "worker+GPU", backend: "worker", delegate: "GPU" },
  { id: "worker+CPU", backend: "worker", delegate: "CPU" },
  { id: "main-thread+GPU", backend: "main-thread", delegate: "GPU" },
  { id: "main-thread+CPU", backend: "main-thread", delegate: "CPU" },
];

export function isWorkerScriptLoadFailure(message: string): boolean {
  return /failed to load|import scripts|syntaxerror/i.test(message);
}

export function posePathsToTry(capabilities: PoseCapabilities): PosePathPlan[] {
  return POSE_FALLBACK_ORDER.filter((path) => {
    if (path.backend === "worker" && !capabilities.moduleWorker) {
      return false;
    }
    if (path.delegate === "GPU" && !capabilities.webgl) {
      return false;
    }
    return true;
  });
}

export function detectPoseCapabilities(): PoseCapabilities {
  return {
    moduleWorker: typeof Worker !== "undefined",
    webgl: supportsWebGL(),
    offscreenCanvas: supportsOffscreenCanvas(),
  };
}

export function supportsOffscreenCanvas(): boolean {
  if (typeof OffscreenCanvas === "undefined") {
    return false;
  }
  try {
    const canvas = new OffscreenCanvas(2, 2);
    return canvas.getContext("2d") !== null;
  } catch {
    return false;
  }
}

export function supportsWebGL(): boolean {
  try {
    if (typeof OffscreenCanvas !== "undefined") {
      const offscreen = new OffscreenCanvas(1, 1);
      if (offscreen.getContext("webgl2") || offscreen.getContext("webgl")) {
        return true;
      }
    }
  } catch {
    // Main-thread canvas is the fallback probe.
  }

  if (typeof document === "undefined") {
    return false;
  }
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl"),
    );
  } catch {
    return false;
  }
}
