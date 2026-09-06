import type { StoredAngle } from "@/lib/engine/angle";
import {
  analyzeBall,
  applyBallPositionSeen,
  shotRecordFromBall,
  type BallAnalysis,
} from "@/lib/engine/ball";
import { analyzeStrike, type StrikeAnalysis } from "@/lib/engine/strike";
import { computeFaceOnMetrics, faceOnMetricsFromUnknown } from "@/lib/engine/metrics/faceOn";
import {
  computeDtlMetrics,
  dtlMetricsFromUnknown,
} from "@/lib/engine/metrics/dtl";
import type { StoredSwingMetrics } from "@/lib/engine/metrics/types";
import type { SwingPhases } from "@/lib/engine/phases";
import type { ClubFamily, Handedness, ShotIntent } from "@/lib/admin/test-swings";
import type { BallLabelsByFrame } from "@/lib/engine/ball-detector";
import type { PoseFrame } from "@/lib/pose/types";
import type { StrikeFeatures } from "@/lib/engine/strike";
import type { ShotRecordOutcome } from "@/lib/engine/ball";

export type { StoredSwingMetrics } from "@/lib/engine/metrics/types";

export type SwingDiagnostics = {
  ball: BallAnalysis | null;
  strike: StrikeAnalysis | null;
  shot_record: ShotRecordOutcome | null;
  strike_features: StrikeFeatures | null;
};

export type ComputeSwingMetricsInput = {
  frames: PoseFrame[];
  normalizedFrames: PoseFrame[] | null;
  phases: SwingPhases;
  angle: StoredAngle | null;
  handedness: Handedness;
  clubFamily?: ClubFamily | null;
  intent?: ShotIntent | null;
  capturePath?: "in_app" | "native_slomo" | "upload" | "in-app" | null;
  audioTransientMs?: number | null;
  imageWidth?: number;
  imageHeight?: number;
  framePixels?: (ImageData | null)[];
  ballLabels?: BallLabelsByFrame | null;
  audioSamples?: Float32Array | null;
  audioSampleRate?: number;
};

export function computeSwingMetrics(
  input: ComputeSwingMetricsInput,
): StoredSwingMetrics {
  const faceOn = computeFaceOnMetrics(input);
  const dtl = computeDtlMetrics(input);
  return { face_on: faceOn, dtl };
}

export async function computeSwingMetricsWithDiagnostics(
  input: ComputeSwingMetricsInput,
): Promise<{ metrics: StoredSwingMetrics; diagnostics: SwingDiagnostics }> {
  const width = input.imageWidth ?? 1080;
  const height = input.imageHeight ?? 1920;

  const ball = await analyzeBall({
    frames: input.frames,
    phases: input.phases,
    angle: input.angle,
    handedness: input.handedness,
    imageWidth: width,
    imageHeight: height,
    framePixels: input.framePixels,
    ballLabels: input.ballLabels,
  });

  let faceOn = computeFaceOnMetrics(input);
  if (ball.ball_position_seen.valid && faceOn) {
    faceOn = applyBallPositionSeen(faceOn, ball) as typeof faceOn;
  }

  const onsetSec =
    input.audioTransientMs != null
      ? input.audioTransientMs / 1000
      : input.phases.impact.valid
        ? input.frames[input.phases.impact.frameIndex]?.mediaTime
        : null;

  const strike = analyzeStrike({
    samples: input.audioSamples ?? null,
    sampleRate: input.audioSampleRate ?? 44100,
    onsetHintSec: onsetSec ?? null,
    capturePath: input.capturePath,
    clubFamily: input.clubFamily,
  });

  return {
    metrics: { face_on: faceOn, dtl: computeDtlMetrics(input) },
    diagnostics: {
      ball,
      strike,
      shot_record: shotRecordFromBall(ball),
      strike_features: strike.features,
    },
  };
}

/** Accept bundled `{ face_on, dtl }` or legacy flat face-on object. */
export function swingMetricsFromUnknown(value: unknown): StoredSwingMetrics | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  if ("face_on" in record || "dtl" in record) {
    const faceOn = faceOnMetricsFromUnknown(record.face_on);
    const dtl = dtlMetricsFromUnknown(record.dtl);
    if (!faceOn && !dtl) {
      return null;
    }
    return { face_on: faceOn, dtl };
  }
  const legacyFaceOn = faceOnMetricsFromUnknown(value);
  if (legacyFaceOn) {
    return { face_on: legacyFaceOn, dtl: null };
  }
  return null;
}

export function activeMetricSet(
  metrics: StoredSwingMetrics | null,
  classification: "face_on" | "dtl" | "refuse" | null | undefined,
): "face_on" | "dtl" | null {
  if (!metrics || !classification || classification === "refuse") {
    return null;
  }
  if (classification === "face_on" && metrics.face_on) {
    return "face_on";
  }
  if (classification === "dtl" && metrics.dtl) {
    return "dtl";
  }
  return classification;
}
