import type { PoseFrame } from "@/lib/pose/types";

export type CapturePath = "upload" | "in-app";

export type OrientationSample = {
  t: number;
  beta: number | null;
  gamma: number | null;
};

export type VideoResolution = {
  width: number;
  height: number;
};

export type FrameRateDetection = {
  detectedFrameRate: number;
  snappedFrameRate: number;
  minDeltaFps: number;
  isVariable: boolean;
  sloMoReexportedAt30: boolean;
};

export type IngestResult = {
  clip: Blob;
  clipUrl: string;
  frameTimestamps: number[];
  detectedFrameRate: number;
  snappedFrameRate: number;
  minDeltaFps: number;
  isVariableFrameRate: boolean;
  sloMoReexportedAt30: boolean;
  resolution: VideoResolution;
  capturePath: CapturePath;
  orientationSamples: OrientationSample[];
  durationSeconds: number;
  frameCount: number;
  audioSampleCount: number;
  audioPeakRms: number;
  audioRms: number[];
  keypoints: PoseFrame[];
  poseFpsProcessed: number;
  poseElapsedMs: number;
  poseBackend: "worker" | "main-thread" | "unavailable";
  poseDelegate: "GPU" | "CPU" | "unavailable";
  posePath:
    | "worker+GPU"
    | "worker+CPU"
    | "main-thread+GPU"
    | "main-thread+CPU"
    | "unavailable";
  poseWatchdogHit: boolean;
  grantedCamera?: MediaTrackSettings;
};

export const MAX_CLIP_SECONDS = 30;
export const RECORD_MAX_MS = MAX_CLIP_SECONDS * 1000;
export const SELF_TIMER_SECONDS = 10;
