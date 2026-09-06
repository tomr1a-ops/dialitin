import type { ClubFamily } from "@/lib/admin/test-swings";
import { catalogKeyForEngineKey } from "@/lib/engine/metric-catalog";
import type { MetricAngle } from "@/lib/engine/metric-catalog";
import { DTL_TIMING_METRIC_KEYS } from "@/lib/engine/metrics/dtl";
import { FACE_ON_TIMING_METRIC_KEYS } from "@/lib/engine/metrics/timing-gate";
import type { StoredSwingMetrics } from "@/lib/engine/metrics/storage";
import { activeMetricSet } from "@/lib/engine/metrics/storage";
import type { StoredAngle } from "@/lib/engine/angle";
import type { SwingPhases } from "@/lib/engine/phases";
import { isSloMoReexport } from "@/lib/engine/metrics/timing-gate";

export type MetricSample = {
  swingId: string;
  metricKey: string;
  catalogKey: string;
  clubFamily: ClubFamily;
  angle: "dtl" | "face_on";
  value: number;
  sloMo: boolean;
};

export type SeedCell = {
  metricObjectId: string;
  metricKey: string;
  catalogKey: string;
  clubFamily: ClubFamily;
  angle: MetricAngle;
  values: number[];
  p5: number | null;
  p95: number | null;
  n: number;
};

const TIMING_KEYS = new Set<string>([
  ...FACE_ON_TIMING_METRIC_KEYS,
  ...DTL_TIMING_METRIC_KEYS,
]);

export function isTimingMetricKey(key: string): boolean {
  return TIMING_KEYS.has(key);
}

export function extractMetricSamples(input: {
  swingId: string;
  clubFamily: ClubFamily | null;
  metrics: StoredSwingMetrics | null;
  angle: StoredAngle | null;
  phases: SwingPhases | null;
}): MetricSample[] {
  if (!input.metrics || !input.angle?.classification.valid) {
    return [];
  }
  const classification = input.angle.classification.value;
  if (classification === "refuse") {
    return [];
  }
  const club = input.clubFamily;
  if (!club) {
    return [];
  }
  const set = activeMetricSet(input.metrics, classification);
  if (!set) {
    return [];
  }
  const bucket = set === "face_on" ? input.metrics.face_on : input.metrics.dtl;
  if (!bucket) {
    return [];
  }
  const sloMo = input.phases ? isSloMoReexport(input.phases) : false;
  const samples: MetricSample[] = [];
  for (const [key, record] of Object.entries(bucket)) {
    if (!record.valid) {
      continue;
    }
    if (sloMo && isTimingMetricKey(key)) {
      continue;
    }
    samples.push({
      swingId: input.swingId,
      metricKey: key,
      catalogKey: catalogKeyForEngineKey(key),
      clubFamily: club,
      angle: classification,
      value: record.value,
      sloMo,
    });
  }
  return samples;
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) {
    return null;
  }
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) {
    return sorted[lower]!;
  }
  const weight = index - lower;
  return sorted[lower]! * (1 - weight) + sorted[upper]! * weight;
}

export function buildSeedCells(input: {
  samples: MetricSample[];
  metrics: Array<{ object_id: string; key: string; angle: MetricAngle }>;
}): SeedCell[] {
  const metricByCatalog = new Map(
    input.metrics.map((row) => [`${row.key}:${row.angle}`, row]),
  );
  const grouped = new Map<string, number[]>();

  for (const sample of input.samples) {
    const metric =
      metricByCatalog.get(`${sample.catalogKey}:${sample.angle}`) ??
      metricByCatalog.get(`${sample.catalogKey}:either`);
    if (!metric) {
      continue;
    }
    const cellKey = `${metric.object_id}:${sample.clubFamily}:${metric.angle}`;
    const values = grouped.get(cellKey) ?? [];
    values.push(sample.value);
    grouped.set(cellKey, values);
  }

  const cells: SeedCell[] = [];
  for (const [cellKey, values] of grouped) {
    const [metricObjectId, clubFamily, angle] = cellKey.split(":");
    const metric = input.metrics.find((row) => row.object_id === metricObjectId);
    if (!metric || values.length < 3) {
      continue;
    }
    const sorted = [...values].sort((a, b) => a - b);
    cells.push({
      metricObjectId,
      metricKey: metric.key,
      catalogKey: metric.key,
      clubFamily: clubFamily as ClubFamily,
      angle: angle as MetricAngle,
      values: sorted,
      p5: percentile(sorted, 0.05),
      p95: percentile(sorted, 0.95),
      n: sorted.length,
    });
  }
  return cells.sort((a, b) =>
    `${a.metricKey}:${a.clubFamily}:${a.angle}`.localeCompare(
      `${b.metricKey}:${b.clubFamily}:${b.angle}`,
    ),
  );
}

export type ScatterPoint = {
  swingId: string;
  value: number;
};

export function scatterForCell(
  samples: MetricSample[],
  cell: Pick<SeedCell, "catalogKey" | "clubFamily" | "angle">,
): ScatterPoint[] {
  return samples
    .filter(
      (sample) =>
        sample.catalogKey === cell.catalogKey &&
        sample.clubFamily === cell.clubFamily &&
        (cell.angle === "either" || sample.angle === cell.angle),
    )
    .map((sample) => ({ swingId: sample.swingId, value: sample.value }));
}
