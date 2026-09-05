import type { PoseStatus } from "@/lib/pose/status";

export type ProcessingStage = {
  message: string;
  progress: number;
};

/** Maps real pipeline stages to processing theater copy — never fake timers. */
export function processingStageFromPose(status: PoseStatus | null): ProcessingStage {
  if (!status) {
    return { message: "Finding the hit…", progress: 0.05 };
  }
  if (status.phase === "loading-model") {
    const pct =
      status.totalBytes > 0
        ? status.loadedBytes / status.totalBytes
        : 0;
    return {
      message: "Reading your setup…",
      progress: 0.1 + pct * 0.25,
    };
  }
  if (status.phase === "reading-body") {
    const pct =
      status.totalFrames > 0 ? status.frame / status.totalFrames : 0;
    return {
      message: "Measuring…",
      progress: 0.35 + pct * 0.55,
    };
  }
  return { message: "Swing found", progress: 1 };
}
