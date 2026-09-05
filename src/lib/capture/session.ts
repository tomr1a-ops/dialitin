import type { IngestResult } from "@/lib/capture/types";

let current: IngestResult | null = null;

export function setCaptureSession(result: IngestResult) {
  if (current && current.clipUrl !== result.clipUrl) {
    URL.revokeObjectURL(current.clipUrl);
  }
  current = result;
}

export function getCaptureSession(): IngestResult | null {
  return current;
}

export function clearCaptureSession() {
  if (current) {
    URL.revokeObjectURL(current.clipUrl);
  }
  current = null;
}
