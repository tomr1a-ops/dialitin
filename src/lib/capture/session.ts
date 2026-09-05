import type {
  CapturePath,
  IngestResult,
  OrientationSample,
} from "@/lib/capture/types";
import type { PoseUserError } from "@/lib/pose/errors";

export type CaptureSession = {
  clip: Blob;
  clipUrl: string;
  capturePath: CapturePath;
  orientationSamples: OrientationSample[];
  grantedCamera?: MediaTrackSettings;
  fileName?: string;
  audioContext?: AudioContext;
  result: IngestResult | null;
  poseError: PoseUserError | null;
};

let current: CaptureSession | null = null;

export function setCaptureSession(session: CaptureSession) {
  if (current && current.clipUrl !== session.clipUrl) {
    URL.revokeObjectURL(current.clipUrl);
  }
  current = session;
}

export function updateCaptureSession(patch: Partial<CaptureSession>) {
  if (!current) {
    return;
  }
  current = { ...current, ...patch };
}

export function getCaptureSession(): CaptureSession | null {
  return current;
}

export function clearCaptureSession() {
  if (current) {
    URL.revokeObjectURL(current.clipUrl);
  }
  current = null;
}

export function sessionFromIngestResult(result: IngestResult): CaptureSession {
  return {
    clip: result.clip,
    clipUrl: result.clipUrl,
    capturePath: result.capturePath,
    orientationSamples: result.orientationSamples,
    grantedCamera: result.grantedCamera,
    result,
    poseError: null,
  };
}
