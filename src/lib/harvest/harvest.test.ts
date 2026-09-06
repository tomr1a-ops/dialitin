import { describe, expect, test } from "vitest";
import {
  HARVEST_MAX_DURATION_SEC,
  parseHarvestLines,
  parseIso8601Duration,
  passesHarvestFilters,
  textMatchesHarvestKeywords,
} from "@/lib/harvest/constants";
import { clubFamilyFromTitle } from "@/lib/harvest/club-family";
import { suggestedFaultFromTitle } from "@/lib/harvest/fault-keywords";
import { applyAngleGate } from "@/lib/harvest/angle-gate";
import type { StoredAngle } from "@/lib/engine/angle";
import { buildSeedCells, extractMetricSamples } from "@/lib/harvest/seed-bands";

describe("parseHarvestLines", () => {
  test("parses tier prefixes", () => {
    const lines = parseHarvestLines(
      "[answer_key] slice fix swing\n[reference] tour slow motion dtl",
    );
    expect(lines).toHaveLength(2);
    expect(lines[0]?.tier).toBe("answer_key");
    expect(lines[1]?.tier).toBe("reference");
  });
});

describe("passesHarvestFilters", () => {
  test("requires keyword and short duration", () => {
    expect(
      passesHarvestFilters({
        durationSec: 120,
        title: "Tiger Woods slow motion driver swing",
        description: "",
      }),
    ).toBe(true);
    expect(
      passesHarvestFilters({
        durationSec: HARVEST_MAX_DURATION_SEC + 1,
        title: "slow motion swing",
        description: "",
      }),
    ).toBe(false);
    expect(
      passesHarvestFilters({
        durationSec: 60,
        title: "random golf clip",
        description: "no keywords",
      }),
    ).toBe(false);
  });
});

describe("parseIso8601Duration", () => {
  test("parses PT minutes", () => {
    expect(parseIso8601Duration("PT2M30S")).toBe(150);
  });
});

describe("clubFamilyFromTitle", () => {
  test("detects driver and 7 iron", () => {
    expect(clubFamilyFromTitle("Rory driver slow motion")).toBe("driver");
    expect(clubFamilyFromTitle("7 iron face on")).toBe("long_iron");
    expect(clubFamilyFromTitle("putting stroke")).toBe("unknown");
  });
});

describe("suggestedFaultFromTitle", () => {
  test("maps slice and OTT", () => {
    expect(suggestedFaultFromTitle("Fix my slice today")).toBe("slice");
    expect(suggestedFaultFromTitle("Over the top swing")).toBe("over_the_top");
  });
});

describe("applyAngleGate", () => {
  test("passes dtl inside band", () => {
    const angle = {
      valid: true,
      reason: null,
      classification: { valid: true, value: "dtl", confidence: 1, reason: null },
    } as StoredAngle;
    expect(applyAngleGate(angle)).toEqual({ pass: true, classification: "dtl" });
  });
});

describe("buildSeedCells", () => {
  test("computes p5/p95 per cell", () => {
    const samples = Array.from({ length: 10 }, (_, index) => ({
      swingId: `s${index}`,
      metricKey: "hip_rotation_top",
      catalogKey: "hip_rotation_at_top",
      clubFamily: "driver" as const,
      angle: "face_on" as const,
      value: index + 1,
      sloMo: true,
    }));
    const cells = buildSeedCells({
      samples,
      metrics: [
        {
          object_id: "metric-1",
          key: "hip_rotation_at_top",
          angle: "face_on",
        },
      ],
    });
    expect(cells).toHaveLength(1);
    expect(cells[0]?.n).toBe(10);
    expect(cells[0]?.p5).toBeCloseTo(1.45, 1);
    expect(cells[0]?.p95).toBeCloseTo(9.55, 1);
  });
});

describe("extractMetricSamples", () => {
  test("skips timing metrics on slo-mo", () => {
    const metrics = {
      face_on: {
        hip_rotation_top: {
          value: 0.8,
          unit: "ratio",
          confidence: 0.9,
          valid: true,
          reason: null,
        },
        tempo_ratio: {
          value: 3,
          unit: "ratio",
          confidence: 0.9,
          valid: true,
          reason: null,
        },
      },
      dtl: null,
    };
    const angle = {
      classification: { valid: true, value: "face_on" },
    } as StoredAngle;
    const phases = {
      sloMoReexportedAt30: { value: true },
    } as Parameters<typeof extractMetricSamples>[0]["phases"];
    const samples = extractMetricSamples({
      swingId: "a",
      clubFamily: "driver",
      metrics,
      angle,
      phases,
    });
    expect(samples.some((sample) => sample.metricKey === "tempo_ratio")).toBe(
      false,
    );
    expect(samples.some((sample) => sample.metricKey === "hip_rotation_top")).toBe(
      true,
    );
  });
});

describe("textMatchesHarvestKeywords", () => {
  test("matches DTL shorthand", () => {
    expect(textMatchesHarvestKeywords("PGA DTL slow motion")).toBe(true);
  });
});
