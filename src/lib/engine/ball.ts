import type { StoredAngle } from "@/lib/engine/angle";
import { derived, invalidDerived, type Derived } from "@/lib/engine/derived";
import type { MetricRecord } from "@/lib/engine/metrics/types";
import { ballPositionInferred } from "@/lib/engine/metrics/faceOn";
import type { SwingPhases } from "@/lib/engine/phases";
import type { Handedness } from "@/lib/admin/test-swings";
import {
  LEFT_HEEL,
  LEFT_WRIST,
  RIGHT_HEEL,
  RIGHT_WRIST,
  type PoseFrame,
} from "@/lib/pose/types";
import { detectBall, type BallLabelsByFrame } from "@/lib/engine/ball-detector";

export type StartLine = "left" | "straight" | "right";

export type BallCentroid = {
  x: number;
  y: number;
};

export type BallAnalysis = {
  ball_position_seen: MetricRecord;
  start_line: Derived<StartLine>;
  launch_direction_confidence: Derived<number>;
  /** Normalized centroid at address when seen — for reveal ring overlay. */
  address_centroid: BallCentroid | null;
  blob_found: boolean;
};

export type BallAnalysisInput = {
  frames: PoseFrame[];
  phases: SwingPhases;
  angle: StoredAngle | null;
  handedness: Handedness;
  imageWidth: number;
  imageHeight: number;
  /** Per-frame RGBA buffers aligned to `frames` indices (optional — blob needs pixels). */
  framePixels?: (ImageData | null)[];
  ballLabels?: BallLabelsByFrame | null;
  alignmentSetupCandidate?: boolean;
};

const VIS = 0.35;
const MIN_BLOB_RADIUS_RATIO = 0.008;
const MAX_BLOB_RADIUS_RATIO = 0.12;
const MIN_TRACK_FRAMES = 4;
const LAUNCH_TRACK_FRAMES = 15;
const START_LINE_THRESHOLD = 0.015;

function sides(handedness: Handedness) {
  const right = handedness !== "left";
  return {
    leadHeel: right ? LEFT_HEEL : RIGHT_HEEL,
    trailHeel: right ? RIGHT_HEEL : LEFT_HEEL,
    leadWrist: right ? LEFT_WRIST : RIGHT_WRIST,
    trailWrist: right ? RIGHT_WRIST : LEFT_WRIST,
  };
}

function joint(frame: PoseFrame, index: number) {
  const p = frame.landmarks[index];
  if (!p || p.visibility < VIS) {
    return null;
  }
  return p;
}

function handCentroid(frame: PoseFrame, side: ReturnType<typeof sides>) {
  const lw = joint(frame, side.leadWrist);
  const tw = joint(frame, side.trailWrist);
  if (lw && tw) {
    return { x: (lw.x + tw.x) / 2, y: (lw.y + tw.y) / 2 };
  }
  return lw ?? tw;
}

function stanceWidthPx(frame: PoseFrame, side: ReturnType<typeof sides>, width: number) {
  const lead = joint(frame, side.leadHeel);
  const trail = joint(frame, side.trailHeel);
  if (!lead || !trail) {
    return null;
  }
  return Math.abs(trail.x - lead.x) * width;
}

function isBallColor(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;
  const white = min > 180 && sat < 0.15;
  const yellow = r > 180 && g > 160 && b < 140 && r - b > 40;
  return white || yellow;
}

export type BlobSearchResult =
  | { status: "found"; centroid: BallCentroid; radiusPx: number; quality: number }
  | { status: "not_found"; reason: string };

/** Color/size blob search below hand centroid at address window. */
export function findBallBlobAtAddress(input: {
  image: ImageData;
  handNorm: BallCentroid;
  stanceWidthPx: number;
  imageWidth: number;
  imageHeight: number;
}): BlobSearchResult {
  const { image, handNorm, stanceWidthPx, imageWidth, imageHeight } = input;
  if (stanceWidthPx < 8) {
    return { status: "not_found", reason: "stance width too small" };
  }

  const handX = Math.round(handNorm.x * imageWidth);
  const handY = Math.round(handNorm.y * imageHeight);
  const halfSearch = Math.round(stanceWidthPx * 0.55);
  const x0 = Math.max(0, handX - halfSearch);
  const x1 = Math.min(imageWidth - 1, handX + halfSearch);
  const y0 = Math.min(imageHeight - 1, handY + Math.round(stanceWidthPx * 0.02));
  const y1 = Math.min(imageHeight - 1, handY + Math.round(stanceWidthPx * 0.45));

  let bestScore = 0;
  let bestCx = 0;
  let bestCy = 0;
  let bestCount = 0;

  const data = image.data;
  const step = 2;
  for (let y = y0; y <= y1; y += step) {
    for (let x = x0; x <= x1; x += step) {
      const i = (y * imageWidth + x) * 4;
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;
      if (!isBallColor(r, g, b)) {
        continue;
      }
      let neighbors = 0;
      let sx = 0;
      let sy = 0;
      const rMax = Math.min(
        MAX_BLOB_RADIUS_RATIO * imageWidth,
        stanceWidthPx * 0.12,
      );
      for (let dy = -rMax; dy <= rMax; dy += step) {
        for (let dx = -rMax; dx <= rMax; dx += step) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < x0 || nx > x1 || ny < y0 || ny > y1) {
            continue;
          }
          if (dx * dx + dy * dy > rMax * rMax) {
            continue;
          }
          const ni = (ny * imageWidth + nx) * 4;
          if (isBallColor(data[ni]!, data[ni + 1]!, data[ni + 2]!)) {
            neighbors += 1;
            sx += nx;
            sy += ny;
          }
        }
      }
      const minPixels = Math.max(4, Math.round((stanceWidthPx * 0.02) ** 2));
      if (neighbors < minPixels) {
        continue;
      }
      const cx = sx / neighbors;
      const cy = sy / neighbors;
      const radius = Math.sqrt(neighbors) * step * 0.5;
      const radiusRatio = radius / stanceWidthPx;
      if (
        radiusRatio < MIN_BLOB_RADIUS_RATIO ||
        radiusRatio > MAX_BLOB_RADIUS_RATIO
      ) {
        continue;
      }
      const circularity = neighbors / (Math.PI * radius * radius + 1);
      const score = circularity * Math.min(1, neighbors / (minPixels * 3));
      if (score > bestScore) {
        bestScore = score;
        bestCx = cx;
        bestCy = cy;
        bestCount = neighbors;
      }
    }
  }

  if (bestScore < 0.08) {
    return { status: "not_found", reason: "no ball-colored blob below hands" };
  }

  const quality = Math.min(1, bestScore * 1.2 + bestCount / 200);
  return {
    status: "found",
    centroid: {
      x: bestCx / imageWidth,
      y: bestCy / imageHeight,
    },
    radiusPx: Math.sqrt(bestCount) * step * 0.45,
    quality,
  };
}

function fractionBetweenHeels(
  ballX: number,
  leadHeelX: number,
  trailHeelX: number,
): number | null {
  const span = trailHeelX - leadHeelX;
  if (Math.abs(span) < 1e-4) {
    return null;
  }
  return Math.min(1, Math.max(0, (ballX - leadHeelX) / span));
}

function trackBlobCentroid(
  image: ImageData,
  seed: BallCentroid,
  imageWidth: number,
  imageHeight: number,
  searchRadiusPx: number,
): BallCentroid | null {
  const cx = Math.round(seed.x * imageWidth);
  const cy = Math.round(seed.y * imageHeight);
  let sx = 0;
  let sy = 0;
  let count = 0;
  const r = Math.max(4, searchRadiusPx);
  const data = image.data;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r) {
        continue;
      }
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= imageWidth || y >= imageHeight) {
        continue;
      }
      const i = (y * imageWidth + x) * 4;
      if (isBallColor(data[i]!, data[i + 1]!, data[i + 2]!)) {
        sx += x;
        sy += y;
        count += 1;
      }
    }
  }
  if (count < 3) {
    return null;
  }
  return { x: sx / count / imageWidth, y: sy / count / imageHeight };
}

export function classifyStartLine(input: {
  track: BallCentroid[];
  angle: StoredAngle | null;
  imageWidth: number;
}): { line: StartLine; confidence: number; reason: string } {
  const { track, angle, imageWidth } = input;
  if (track.length < MIN_TRACK_FRAMES) {
    return {
      line: "straight",
      confidence: 0,
      reason: `tracked ${track.length} frames (< ${MIN_TRACK_FRAMES})`,
    };
  }

  const start = track[0]!;
  const end = track[track.length - 1]!;
  let dx = (end.x - start.x) * input.imageWidth;

  if (angle?.valid && angle.case === "A" && angle.yaw.valid) {
    const yawRad = (angle.yaw.value * Math.PI) / 180;
    dx = dx * Math.cos(yawRad) - (end.y - start.y) * input.imageWidth * Math.sin(yawRad);
  }

  const classification =
    angle?.classification.value === "face_on" &&
    Math.abs(end.x - start.x) < START_LINE_THRESHOLD * 2
      ? "face_on_axis"
      : "normal";

  let confidence = Math.min(1, 0.4 + track.length / LAUNCH_TRACK_FRAMES);
  if (classification === "face_on_axis") {
    confidence *= 0.35;
  }

  const normDx = dx / Math.max(1, input.imageWidth * START_LINE_THRESHOLD);
  let line: StartLine = "straight";
  if (normDx < -1) {
    line = "left";
  } else if (normDx > 1) {
    line = "right";
  }

  const reason =
    classification === "face_on_axis"
      ? "face-on: ball leaves along camera axis"
      : `track ${track.length} frames, dx=${dx.toFixed(1)}px`;

  return { line, confidence, reason };
}

export async function analyzeBall(
  input: BallAnalysisInput,
): Promise<BallAnalysis> {
  const side = sides(input.handedness);

  if (!input.phases.address.valid || !input.phases.impact.valid) {
    return {
      ball_position_seen: {
        value: 0,
        unit: "pct_stance",
        confidence: 0,
        valid: false,
        reason: "address or impact invalid",
      },
      start_line: invalidDerived<StartLine>("straight", "address or impact invalid"),
      launch_direction_confidence: invalidDerived(0, "address or impact invalid"),
      address_centroid: null,
      blob_found: false,
    };
  }

  const addressIdx = input.phases.address.frameIndex;
  const addressFrame = input.frames[addressIdx];
  const inferred: MetricRecord = addressFrame
    ? ballPositionInferred(
        addressFrame,
        {
          ...side,
          leadShoulder: 0,
          trailShoulder: 0,
          leadHip: 0,
          trailHip: 0,
          leadAnkle: 0,
          trailAnkle: 0,
          leadElbow: 0,
          trailElbow: 0,
          leadKnee: 0,
          trailKnee: 0,
        },
        input.alignmentSetupCandidate ?? false,
      )
    : {
        value: 0,
        unit: "pct_stance",
        confidence: 0,
        valid: false,
        reason: "inferred, not seen",
      };

  if (!addressFrame) {
    return {
      ball_position_seen: inferred,
      start_line: invalidDerived<StartLine>("straight", "no address frame"),
      launch_direction_confidence: invalidDerived(0, "no address frame"),
      address_centroid: null,
      blob_found: false,
    };
  }

  const hand = handCentroid(addressFrame, side);
  const stancePx = stanceWidthPx(addressFrame, side, input.imageWidth);
  const addressPixels = input.framePixels?.[addressIdx] ?? null;

  let seenValue = inferred.value;
  let seenConfidence = 0;
  let seenValid = false;
  let seenReason = "not_found";
  let addressCentroid: BallCentroid | null = null;

  if (addressPixels && hand && stancePx) {
    const yolo = await detectBall({
      imageData: addressPixels,
      frameIndex: addressIdx,
      labels: input.ballLabels,
    });
    if (yolo.boxes[0]) {
      const box = yolo.boxes[0];
      addressCentroid = {
        x: (box.x + box.width / 2) / input.imageWidth,
        y: (box.y + box.height / 2) / input.imageHeight,
      };
      seenConfidence = box.confidence;
      seenValid = box.confidence >= 0.5;
      seenReason = "detector label";
    } else {
      const blob = findBallBlobAtAddress({
        image: addressPixels,
        handNorm: hand,
        stanceWidthPx: stancePx,
        imageWidth: input.imageWidth,
        imageHeight: input.imageHeight,
      });
      if (blob.status === "found") {
        addressCentroid = blob.centroid;
        seenConfidence = blob.quality;
        seenValid = blob.quality >= 0.5;
        seenReason = seenValid ? "blob seen at address" : "blob weak";
      } else {
        seenReason = blob.reason;
      }
    }

    const leadHeel = joint(addressFrame, side.leadHeel);
    const trailHeel = joint(addressFrame, side.trailHeel);
    if (addressCentroid && leadHeel && trailHeel) {
      const frac = fractionBetweenHeels(
        addressCentroid.x,
        leadHeel.x,
        trailHeel.x,
      );
      if (frac != null) {
        seenValue = frac;
      }
    }
  } else {
    seenReason = "no frame pixels for blob search";
  }

  const ball_position_seen: MetricRecord = {
    value: seenValue,
    unit: "pct_stance",
    confidence: seenConfidence,
    valid: seenValid,
    reason: seenValid ? seenReason : seenReason,
  };

  const impactIdx = input.phases.impact.frameIndex;
  const track: BallCentroid[] = [];
  let seed = addressCentroid;
  const searchR =
    stancePx != null ? Math.max(6, stancePx * 0.06) : 12;

  for (
    let i = impactIdx + 1;
    i < input.frames.length &&
    i <= impactIdx + LAUNCH_TRACK_FRAMES &&
    input.framePixels?.[i];
    i += 1
  ) {
    const pixels = input.framePixels[i]!;
    if (seed) {
      const next = trackBlobCentroid(
        pixels,
        seed,
        input.imageWidth,
        input.imageHeight,
        searchR,
      );
      if (next) {
        track.push(next);
        seed = next;
      }
    } else if (hand && stancePx) {
      const blob = findBallBlobAtAddress({
        image: pixels,
        handNorm: hand,
        stanceWidthPx: stancePx,
        imageWidth: input.imageWidth,
        imageHeight: input.imageHeight,
      });
      if (blob.status === "found") {
        track.push(blob.centroid);
        seed = blob.centroid;
      }
    }
  }

  const start = classifyStartLine({
    track,
    angle: input.angle,
    imageWidth: input.imageWidth,
  });

  return {
    ball_position_seen,
    start_line: derived(
      start.line,
      start.confidence,
      start.confidence >= 0.5,
      start.reason,
    ),
    launch_direction_confidence: derived(
      start.confidence,
      start.confidence,
      start.confidence > 0,
      start.reason,
    ),
    address_centroid: addressCentroid,
    blob_found: seenValid,
  };
}

/** When ball_position_seen is confident, replace inferred in the face-on bundle. */
export function applyBallPositionSeen(
  faceOn: Record<string, MetricRecord>,
  ball: BallAnalysis,
): Record<string, MetricRecord> {
  if (!ball.ball_position_seen.valid) {
    return faceOn;
  }
  return {
    ...faceOn,
    ball_position_inferred: {
      ...ball.ball_position_seen,
      reason: ball.ball_position_seen.reason ?? "seen at address",
    },
  };
}

export type ShotRecordOutcome = {
  start_line: StartLine | null;
  start_line_confidence: number;
  engine_measured: boolean;
};

export function shotRecordFromBall(ball: BallAnalysis): ShotRecordOutcome {
  return {
    start_line: ball.start_line.valid ? ball.start_line.value : null,
    start_line_confidence: ball.launch_direction_confidence.value,
    engine_measured: ball.start_line.valid,
  };
}
