import { describe, expect, test } from "vitest";
import { buildBandsTable } from "@/lib/engine/bands";
import {
  comparePhaseMark,
  evaluateSwingMetrics,
  METRIC_READ_CONFIDENCE_THRESHOLD,
  phaseFrameTolerance,
} from "@/lib/engine/evaluate";
import type { StoredSwingMetrics } from "@/lib/engine/metrics/storage";

const emptyBands = buildBandsTable({
  metrics: [
    { object_id: "m1", key: "tempo_ratio", angle: "either" },
  ],
  bands: [],
  snapshot: { bands: {} },
});

const sampleMetrics: StoredSwingMetrics = {
  face_on: {
    tempo_ratio: {
      value: 3,
      unit: "ratio",
      confidence: 0.9,
      valid: true,
      reason: null,
    },
  } as StoredSwingMetrics["face_on"],
  dtl: null,
};

describe("evaluateSwingMetrics", () => {
  test("empty bands → no-band, never error", () => {
    const result = evaluateSwingMetrics({
      metrics: sampleMetrics,
      classification: "face_on",
      level: "intermediate",
      clubFamily: "driver",
      bands: emptyBands,
    });
    expect(result.tempo_ratio?.status).toBe("no-band");
    expect(result.tempo_ratio?.inBand).toBeNull();
  });

  test("low confidence → not-read, never in-band", () => {
    const lowConf: StoredSwingMetrics = {
      face_on: {
        tempo_ratio: {
          value: 3,
          unit: "ratio",
          confidence: METRIC_READ_CONFIDENCE_THRESHOLD - 0.1,
          valid: true,
          reason: null,
        },
      } as StoredSwingMetrics["face_on"],
      dtl: null,
    };
    const table = buildBandsTable({
      metrics: [{ object_id: "m1", key: "tempo_ratio", angle: "either" }],
      bands: [
        {
          id: "b1",
          metric_object_id: "m1",
          club_family: "driver",
          intent: "stock",
          functional_low: 2,
          functional_high: 4,
          tolerance_beginner: 0.5,
          tolerance_intermediate: 0.3,
          tolerance_advanced: 0.2,
        },
      ],
      snapshot: { bands: { o: "b1" } },
    });
    const result = evaluateSwingMetrics({
      metrics: lowConf,
      classification: "face_on",
      level: "intermediate",
      clubFamily: "driver",
      bands: table,
    });
    expect(result.tempo_ratio?.status).toBe("not-read");
    expect(result.tempo_ratio?.inBand).toBeNull();
  });

  test("within band passes", () => {
    const table = buildBandsTable({
      metrics: [{ object_id: "m1", key: "tempo_ratio", angle: "either" }],
      bands: [
        {
          id: "b1",
          metric_object_id: "m1",
          club_family: "driver",
          intent: "stock",
          functional_low: 2.5,
          functional_high: 3.5,
          tolerance_beginner: 0.5,
          tolerance_intermediate: 0.3,
          tolerance_advanced: 0.2,
        },
      ],
      snapshot: { bands: { o: "b1" } },
    });
    const result = evaluateSwingMetrics({
      metrics: sampleMetrics,
      classification: "face_on",
      level: "intermediate",
      clubFamily: "driver",
      bands: table,
    });
    expect(result.tempo_ratio?.status).toBe("pass");
    expect(result.tempo_ratio?.inBand).toBe(true);
  });
});

describe("phaseFrameTolerance", () => {
  test("uses 2/4/8 frame windows by rate", () => {
    expect(phaseFrameTolerance(30)).toBe(2);
    expect(phaseFrameTolerance(60)).toBe(2);
    expect(phaseFrameTolerance(120)).toBe(4);
    expect(phaseFrameTolerance(240)).toBe(8);
  });
});

describe("comparePhaseMark", () => {
  test("unmarked when no ground truth", () => {
    const cmp = comparePhaseMark(10, null, true, 120);
    expect(cmp.status).toBe("unmarked");
    expect(cmp.pass).toBeNull();
  });

  test("passes within tolerance", () => {
    const cmp = comparePhaseMark(50, 52, true, 120);
    expect(cmp.status).toBe("pass");
    expect(cmp.deltaFrames).toBe(2);
  });
});
