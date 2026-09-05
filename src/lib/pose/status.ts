import { bytesToMb } from "@/lib/pose/assets";
import type { PosePathId } from "@/lib/pose/capabilities";

export type PoseStatus =
  | {
      phase: "loading-model";
      loadedBytes: number;
      totalBytes: number;
    }
  | {
      phase: "reading-body";
      frame: number;
      totalFrames: number;
      path?: PosePathId;
    }
  | { phase: "done"; path?: PosePathId };

export function formatPoseStatus(status: PoseStatus): string {
  if (status.phase === "loading-model") {
    return `Loading model… (${bytesToMb(status.loadedBytes)} of ${bytesToMb(status.totalBytes)} MB)`;
  }
  if (status.phase === "reading-body") {
    const path = status.path ? `${status.path} · ` : "";
    return `Reading your body… ${path}frame ${status.frame} of ${status.totalFrames}`;
  }
  if (status.path) {
    return `Pose path: ${status.path}`;
  }
  return "";
}
