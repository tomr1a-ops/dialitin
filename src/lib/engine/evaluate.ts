import type { ClubFamily, ShotIntent } from "@/lib/admin/test-swings";
import {
  lookupBand,
  type BandsTable,
  type FunctionalBand,
  type SkillLevel,
} from "@/lib/engine/bands";
import type { MetricRecord } from "@/lib/engine/metrics/types";
import type { StoredSwingMetrics } from "@/lib/engine/metrics/storage";
import { activeMetricSet } from "@/lib/engine/metrics/storage";

/** Sec 6.4 — below this, a metric is "not read", never "in band". */
export const METRIC_READ_CONFIDENCE_THRESHOLD = 0.5;

export type MetricEvaluationStatus =
  | "pass"
  | "fail"
  | "no-band"
  | "not-read"
  | "inactive";

export type MetricEvaluation = {
  value: number | null;
  band: FunctionalBand | null;
  inBand: boolean | null;
  deviation: number | null;
  confidence: number;
  valid: boolean;
  reason: string | null;
  status: MetricEvaluationStatus;
};

export type EvaluateInput = {
  metrics: StoredSwingMetrics | null;
  classification: "face_on" | "dtl" | "refuse" | null | undefined;
  level: SkillLevel;
  clubFamily: ClubFamily;
  intent?: ShotIntent | null;
  bands: BandsTable;
};

function toleranceForLevel(
  band: FunctionalBand,
  level: SkillLevel,
): number | null {
  return band.tolerance[level];
}

function evaluateOne(
  record: MetricRecord,
  bandLookup: ReturnType<typeof lookupBand>,
  level: SkillLevel,
): MetricEvaluation {
  const base = {
    value: record.valid ? record.value : null,
    confidence: record.confidence,
    valid: record.valid,
    reason: record.reason,
    band: bandLookup.band,
    inBand: null as boolean | null,
    deviation: null as number | null,
    status: "not-read" as MetricEvaluationStatus,
  };

  if (!record.valid) {
    return {
      ...base,
      status: "not-read",
      reason: record.reason ?? "invalid metric",
    };
  }

  if (record.confidence < METRIC_READ_CONFIDENCE_THRESHOLD) {
    return {
      ...base,
      status: "not-read",
      reason: `confidence ${record.confidence.toFixed(2)} below read threshold`,
    };
  }

  if (!bandLookup.band) {
    return {
      ...base,
      status: "no-band",
      reason: bandLookup.reason,
    };
  }

  const band = bandLookup.band;
  const tol = toleranceForLevel(band, level);
  if (tol === null || tol <= 0) {
    return {
      ...base,
      status: "no-band",
      reason: `no tolerance for level ${level}`,
    };
  }

  if (band.low === null && band.high === null) {
    return {
      ...base,
      status: "no-band",
      reason: "band range not set",
    };
  }

  const low = band.low ?? -Infinity;
  const high = band.high ?? Infinity;
  const value = record.value;

  if (value < low - tol) {
    const deviation = (low - value) / tol;
    return {
      ...base,
      inBand: false,
      deviation,
      status: "fail",
      reason: `below band by ${deviation.toFixed(2)} tolerance units`,
    };
  }

  if (value > high + tol) {
    const deviation = (value - high) / tol;
    return {
      ...base,
      inBand: false,
      deviation,
      status: "fail",
      reason: `above band by ${deviation.toFixed(2)} tolerance units`,
    };
  }

  let deviation = 0;
  if (value < low) {
    deviation = (low - value) / tol;
  } else if (value > high) {
    deviation = (value - high) / tol;
  }

  return {
    ...base,
    inBand: true,
    deviation,
    status: "pass",
    reason: deviation > 0 ? "within tolerance" : "in functional range",
  };
}

export function evaluateSwingMetrics(
  input: EvaluateInput,
): Record<string, MetricEvaluation> {
  const active = activeMetricSet(input.metrics, input.classification);
  const out: Record<string, MetricEvaluation> = {};

  if (!input.metrics || !active) {
    return out;
  }

  const bundle =
    active === "face_on" ? input.metrics.face_on : input.metrics.dtl;
  if (!bundle) {
    return out;
  }

  const swingAngle = active;

  for (const [engineKey, record] of Object.entries(bundle)) {
    const bandLookup = lookupBand(input.bands, {
      engineMetricKey: engineKey,
      clubFamily: input.clubFamily,
      swingAngle,
      intent: input.intent,
    });
    out[engineKey] = evaluateOne(record, bandLookup, input.level);
  }

  return out;
}

export function phaseFrameTolerance(frameRate: number): number {
  if (frameRate >= 200) {
    return 8;
  }
  if (frameRate >= 100) {
    return 4;
  }
  return 2;
}

export type PhaseName =
  | "address"
  | "takeaway"
  | "top"
  | "impact"
  | "finish";

export type PhaseMarkComparison = {
  detected: number | null;
  marked: number | null;
  deltaFrames: number | null;
  pass: boolean | null;
  status: "pass" | "fail" | "unmarked" | "invalid";
};

export function comparePhaseMark(
  detectedFrame: number | null,
  markedFrame: number | null,
  detectedValid: boolean,
  frameRate: number,
): PhaseMarkComparison {
  if (markedFrame === null || markedFrame === undefined) {
    return {
      detected: detectedValid ? detectedFrame : null,
      marked: null,
      deltaFrames: null,
      pass: null,
      status: "unmarked",
    };
  }

  if (!detectedValid || detectedFrame === null) {
    return {
      detected: null,
      marked: markedFrame,
      deltaFrames: null,
      pass: false,
      status: "invalid",
    };
  }

  const delta = Math.abs(detectedFrame - markedFrame);
  const tol = phaseFrameTolerance(frameRate);
  const pass = delta <= tol;

  return {
    detected: detectedFrame,
    marked: markedFrame,
    deltaFrames: delta,
    pass,
    status: pass ? "pass" : "fail",
  };
}
