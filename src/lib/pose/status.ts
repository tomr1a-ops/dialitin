import { bytesToMb } from "@/lib/pose/assets";

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
    }
  | { phase: "done" };

export function formatPoseStatus(status: PoseStatus): string {
  if (status.phase === "loading-model") {
    return `Loading model… (${bytesToMb(status.loadedBytes)} of ${bytesToMb(status.totalBytes)} MB)`;
  }
  if (status.phase === "reading-body") {
    return `Reading your body… frame ${status.frame} of ${status.totalFrames}`;
  }
  return "";
}
