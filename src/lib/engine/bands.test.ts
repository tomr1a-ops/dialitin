import { describe, expect, test } from "vitest";
import { buildBandsTable, lookupBand } from "@/lib/engine/bands";

const metrics = [
  {
    object_id: "m1",
    key: "tempo_ratio",
    angle: "either" as const,
  },
  {
    object_id: "m2",
    key: "pelvis_vs_tush_line",
    angle: "dtl" as const,
  },
];

describe("buildBandsTable", () => {
  test("empty snapshot yields no bands with reason", () => {
    const table = buildBandsTable({
      metrics,
      bands: [],
      snapshot: { bands: {} },
    });
    const result = lookupBand(table, {
      engineMetricKey: "tempo_ratio",
      clubFamily: "driver",
      swingAngle: "face_on",
    });
    expect(result.band).toBeNull();
    expect(result.reason).toContain("no band");
  });

  test("loads pinned band rows from snapshot", () => {
    const table = buildBandsTable({
      metrics,
      bands: [
        {
          id: "b1",
          metric_object_id: "m1",
          club_family: "driver",
          intent: "stock",
          functional_low: 2.5,
          functional_high: 3.5,
          tolerance_beginner: 0.4,
          tolerance_intermediate: 0.3,
          tolerance_advanced: 0.2,
        },
      ],
      snapshot: { bands: { "obj-1": "b1" } },
    });
    const result = lookupBand(table, {
      engineMetricKey: "tempo_ratio",
      clubFamily: "driver",
      swingAngle: "dtl",
    });
    expect(result.band).toEqual({
      low: 2.5,
      high: 3.5,
      tolerance: {
        beginner: 0.4,
        intermediate: 0.3,
        advanced: 0.2,
      },
    });
  });

  test("maps engine key to catalog key", () => {
    const table = buildBandsTable({
      metrics,
      bands: [
        {
          id: "b2",
          metric_object_id: "m2",
          club_family: "short_iron",
          intent: "stock",
          functional_low: 0,
          functional_high: 0.05,
          tolerance_beginner: 0.02,
          tolerance_intermediate: 0.015,
          tolerance_advanced: 0.01,
        },
      ],
      snapshot: { bands: { "obj-2": "b2" } },
    });
    const result = lookupBand(table, {
      engineMetricKey: "tush_line_pelvis",
      clubFamily: "short_iron",
      swingAngle: "dtl",
    });
    expect(result.band?.high).toBe(0.05);
  });
});
