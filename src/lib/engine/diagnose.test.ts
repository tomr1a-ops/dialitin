import { describe, expect, test } from "vitest";
import { buildBandsTable } from "@/lib/engine/bands";
import { buildCoachingContent } from "@/lib/engine/content";
import {
  diagnose,
  gateClearanceNeverVetoesTush,
  gateFadeNotOTT,
  gateHipTurnIsSway,
  gateOTTRequiresFaceOn,
  gateWeightProxyHonesty,
  type DiagnoseInput,
} from "@/lib/engine/diagnose";
import { derived } from "@/lib/engine/derived";
import type { MetricEvaluation } from "@/lib/engine/evaluate";
import type { SwingPhases } from "@/lib/engine/phases";
import type { BallAnalysis } from "@/lib/engine/ball";

const emptyPhases: SwingPhases = {
  address: { valid: false, frameIndex: 0, timeMs: 0, confidence: 0, reason: "test" },
  takeaway: { valid: false, frameIndex: 0, timeMs: 0, confidence: 0, reason: "test" },
  top: { valid: false, frameIndex: 0, timeMs: 0, confidence: 0, reason: "test" },
  impact: { valid: true, frameIndex: 10, timeMs: 500, confidence: 0.9, reason: "test" },
  finish: { valid: false, frameIndex: 0, timeMs: 0, confidence: 0, reason: "test" },
  trim: {
    valid: true,
    frameIndex: 0,
    timeMs: 0,
    confidence: 1,
    reason: null,
    value: { startMs: 0, endMs: 1000 },
  },
} as SwingPhases;

function ev(
  partial: Partial<MetricEvaluation> & { value?: number | null },
): MetricEvaluation {
  return {
    value: partial.value ?? null,
    band: partial.band ?? null,
    inBand: partial.inBand ?? null,
    deviation: partial.deviation ?? null,
    confidence: partial.confidence ?? 0.9,
    valid: partial.valid ?? true,
    reason: partial.reason ?? null,
    status: partial.status ?? "fail",
  };
}

function failAbove(value: number, deviation = 1.2): MetricEvaluation {
  return ev({
    value,
    status: "fail",
    inBand: false,
    deviation,
    band: {
      low: 0,
      high: 5,
      tolerance: { beginner: 1, intermediate: 0.8, advanced: 0.6 },
    },
  });
}

function passMetric(value: number): MetricEvaluation {
  return ev({
    value,
    status: "pass",
    inBand: true,
    deviation: 0,
    band: {
      low: 0,
      high: 10,
      tolerance: { beginner: 1, intermediate: 0.8, advanced: 0.6 },
    },
  });
}

const hipSlideFault = {
  id: "f1",
  key: "hip_slide_down",
  name: "Hip slide toward target",
  family: "hip_lateral",
  tier: "downswing" as const,
  severity_weight: 1,
  causal_leverage: 1,
  changeability: 1,
  metric_rules: {
    primary_metric: "hip_slide_down",
    metrics: [
      {
        engine_key: "hip_slide_down",
        catalog_key: "hip_lateral_movement",
        direction: "above" as const,
        weight: 1,
      },
    ],
    requires_angle: "face_on" as const,
  },
};

const ottFault = {
  id: "f2",
  key: "over_the_top",
  name: "Over the top",
  family: "hand_path",
  tier: "downswing" as const,
  severity_weight: 1,
  causal_leverage: 1,
  changeability: 1,
  metric_rules: {
    metrics: [{ engine_key: "delivery_slot", direction: "above" as const }],
    requires_angle: "dtl" as const,
  },
};

const bands = buildBandsTable({
  metrics: [
    { object_id: "m1", key: "hip_lateral_movement", angle: "face_on" },
    { object_id: "m2", key: "downswing_hand_path", angle: "dtl" },
    { object_id: "m3", key: "pelvis_vs_tush_line", angle: "dtl" },
  ],
  bands: [
    {
      id: "b1",
      metric_object_id: "m1",
      club_family: "wedge",
      intent: "stock",
      functional_low: 0,
      functional_high: 5,
      tolerance_beginner: 1,
      tolerance_intermediate: 0.8,
      tolerance_advanced: 0.6,
    },
  ],
  snapshot: { bands: { o1: "b1" } },
});

const contentWithFault = buildCoachingContent({
  bands,
  faults: [hipSlideFault],
  hasSignedBands: true,
  hasSignedFaults: true,
  voice: [
    {
      fault_key: "hip_slide_down",
      feel_cue: "Bump without sliding",
      ball_flight_cost: "Thin and heel strikes",
      explanation: "Your hips slid toward the target before your hands caught up.",
      signed_by: "Pro",
    },
  ],
  protocols: [
    {
      id: "p1",
      fault_key: "hip_slide_down",
      name: "Hip bump without slide",
      constraint_text: "Stick outside trail foot",
      reps_slow: 3,
      reps_rehearsal: 1,
      reps_live: 1,
      ball: "none",
      progression: "",
      success_criterion: "Hips stay on address line",
    },
  ],
});

const emptyContent = buildCoachingContent({
  bands: buildBandsTable({
    metrics: [],
    bands: [],
    snapshot: { bands: {} },
  }),
  faults: [],
  hasSignedBands: false,
  hasSignedFaults: false,
});

function baseInput(
  overrides: Partial<DiagnoseInput> = {},
): DiagnoseInput {
  return {
    evaluations: {},
    phases: emptyPhases,
    angle: "face_on",
    clubFamily: "wedge",
    intent: "stock",
    handedness: "right",
    level: "intermediate",
    content: contentWithFault,
    ...overrides,
  };
}

describe("diagnose empty tables", () => {
  test("fixture 1: empty bands and faults → insufficient_data, no error", () => {
    const result = diagnose(
      baseInput({ content: emptyContent, evaluations: {} }),
    );
    expect(result.outcome).toBe("insufficient_data");
    expect(result.headline_fault).toContain("Not enough signed data");
    expect(result.evidence).toEqual([]);
  });
});

describe("confidence gate (6.4)", () => {
  test("fixture 2: not-read metrics never contribute", () => {
    const result = diagnose(
      baseInput({
        evaluations: {
          hip_slide_down: ev({
            value: 12,
            status: "not-read",
            confidence: 0.3,
            inBand: null,
          }),
        },
      }),
    );
    expect(result.outcome).toBe("refuse");
  });

  test("low confidence hip slide excluded from fault", () => {
    const result = diagnose(
      baseInput({
        evaluations: {
          hip_slide_down: ev({
            value: 12,
            status: "not-read",
            confidence: 0.4,
          }),
        },
      }),
    );
    expect(result.outcome).not.toBe("fault");
  });
});

describe("interpretation gates (6.1)", () => {
  test("fixture 3: declared fade + out-to-in is not OTT", () => {
    expect(
      gateFadeNotOTT(
        { delivery_slot: failAbove(2, -0.5) },
        "fade",
      ),
    ).toBe(true);
  });

  test("fixture 4: OTT never from DTL alone without face-on context", () => {
    expect(
      gateOTTRequiresFaceOn("dtl", { delivery_slot: failAbove(3) }),
    ).toBe(true);
    expect(
      gateOTTRequiresFaceOn("dtl", {
        delivery_slot: failAbove(3),
        shoulder_rotation_top: passMetric(0.5),
      }),
    ).toBe(false);
  });

  test("hip turn with trail knee + head sway → sway pattern", () => {
    expect(
      gateHipTurnIsSway({
        hip_rotation_top: failAbove(1.4),
        trail_knee_flexion_change: failAbove(0.2, 0.5),
        head_sway: failAbove(8),
      }),
    ).toBe(true);
  });

  test("low-confidence clearance never vetoes clean tush line", () => {
    expect(
      gateClearanceNeverVetoesTush({
        tush_line_pelvis: passMetric(2),
        lead_hip_clearance_impact: ev({
          value: 1,
          status: "fail",
          confidence: 0.3,
          inBand: false,
          deviation: 1,
        }),
      }),
    ).toBe(true);
  });

  test("weight proxy honesty gate flagged", () => {
    expect(gateWeightProxyHonesty("weight_transfer_proxy")).toBe(true);
    expect(gateWeightProxyHonesty("hip_slide_down")).toBe(false);
  });

  test("OTT on DTL without face-on does not become fault headline", () => {
    const result = diagnose(
      baseInput({
        angle: "dtl",
        content: buildCoachingContent({
          bands,
          faults: [ottFault],
          hasSignedBands: true,
          hasSignedFaults: true,
        }),
        evaluations: {
          delivery_slot: failAbove(4),
        },
      }),
    );
    expect(result.outcome).not.toBe("fault");
  });
});

describe("fault detection", () => {
  test("hip_slide_down with published band → fault outcome", () => {
    const result = diagnose(
      baseInput({
        evaluations: {
          hip_slide_down: failAbove(12),
        },
      }),
    );
    expect(result.outcome).toBe("fault");
    expect(result.fault_key).toBe("hip_slide_down");
    expect(result.protocol_id).toBe("p1");
    expect(result.evidence.length).toBeGreaterThan(0);
  });

  test("all in band → dont_fix_it", () => {
    const result = diagnose(
      baseInput({
        evaluations: {
          hip_slide_down: passMetric(3),
        },
      }),
    );
    expect(result.outcome).toBe("dont_fix_it");
  });
});

describe("retest mode", () => {
  test("reports prior fault first with delta in pct stance", () => {
    const result = diagnose(
      baseInput({
        mode: "retest",
        priorDiagnosis: {
          fault_key: "hip_slide_down",
          headline_fault: "Hip slide",
          family: "hip_lateral",
          evidence: [],
          metric_key: "hip_slide_down",
          prior_value: 14,
        },
        evaluations: {
          hip_slide_down: failAbove(9),
        },
      }),
    );
    expect(result.mode).toBe("retest");
    expect(result.fault_key).toBe("hip_slide_down");
    expect(result.delta_pct_stance).toBe(-5);
    expect(result.reasons.some((r) => r.includes("delta"))).toBe(true);
  });
});

describe("problem mode symptom-first", () => {
  test("symptom map reorders search", () => {
    const content = buildCoachingContent({
      bands,
      faults: [hipSlideFault, ottFault],
      symptomMap: [
        { symptom: "slice", fault_key: "hip_slide_down", weight: 2, order: 1 },
        { symptom: "slice", fault_key: "over_the_top", weight: 1, order: 2 },
      ],
      hasSignedBands: true,
      hasSignedFaults: true,
    });
    const result = diagnose(
      baseInput({
        angle: "face_on",
        statedSymptom: "slice",
        content,
        evaluations: {
          hip_slide_down: failAbove(10),
        },
      }),
    );
    expect(result.mode).toBe("problem");
    expect(result.fault_key).toBe("hip_slide_down");
  });
});

describe("start_line slice observation (6.10)", () => {
  test("left start with stated slice adds pull-slice observation path", () => {
    const ball: BallAnalysis = {
      ball_position_seen: {
        value: 0.5,
        unit: "pct_stance",
        confidence: 0.8,
        valid: true,
        reason: "seen",
      },
      start_line: derived("left", 0.75, true, "track"),
      launch_direction_confidence: derived(0.75, 0.75, true, "track"),
      address_centroid: { x: 0.5, y: 0.7 },
      blob_found: true,
    };
    const result = diagnose(
      baseInput({
        statedSymptom: "slice",
        ball,
        evaluations: { hip_slide_down: passMetric() },
      }),
    );
    expect(result.mode).toBe("problem");
  });
});

describe("score internal never required in output shape", () => {
  test("score_internal computed but separate from headline", () => {
    const result = diagnose(
      baseInput({
        evaluations: { hip_slide_down: failAbove(12) },
      }),
    );
    expect(result.score_internal).not.toBeNull();
    expect(result.headline_fault).not.toMatch(/\d\/100/);
  });
});
