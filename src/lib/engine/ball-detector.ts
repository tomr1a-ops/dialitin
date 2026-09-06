/**
 * YOLO-nano ONNX Runtime Web placeholder — same interface as future detector.
 * Admin labels via click-to-label feed `ball_labels` jsonb; no training in 2e.
 */

export type BallBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
};

export type BallLabelsByFrame = Record<string, BallBox>;

export type BallDetectorInput = {
  /** RGBA pixel buffer for one video frame (full frame, top-left origin). */
  imageData: ImageData;
  frameIndex: number;
  /** Optional admin labels keyed by frame index string. */
  labels?: BallLabelsByFrame | null;
};

export type BallDetectorResult = {
  boxes: BallBox[];
  source: "yolo" | "labels" | "unavailable";
};

/** Placeholder — ONNX model not loaded until labeled training set exists. */
export async function detectBallYolo(
  _input: BallDetectorInput,
): Promise<BallDetectorResult> {
  return { boxes: [], source: "unavailable" };
}

/** When admin labels exist for this frame, return them as pseudo-detections. */
export function detectBallFromLabels(
  input: BallDetectorInput,
): BallDetectorResult {
  const label = input.labels?.[String(input.frameIndex)];
  if (!label) {
    return { boxes: [], source: "labels" };
  }
  return {
    boxes: [{ ...label, confidence: 1 }],
    source: "labels",
  };
}

export async function detectBall(
  input: BallDetectorInput,
): Promise<BallDetectorResult> {
  const fromLabels = detectBallFromLabels(input);
  if (fromLabels.boxes.length > 0) {
    return fromLabels;
  }
  return detectBallYolo(input);
}
