import { describe, expect, test } from "vitest";
import { diagnosisToRevealInput } from "@/lib/reveal/map-diagnosis";
import type { DiagnosisResult } from "@/lib/engine/diagnose";

describe("diagnosisToRevealInput", () => {
  test("never attaches placeholder whatChangedSince", () => {
    const diagnosis: DiagnosisResult = {
      outcome: "fault",
      headline_fault: "You stood up through impact",
      fault_key: "early_extension",
      family: "pelvis",
      evidence: [
        {
          metric: "tush_line_pelvis",
          value: 11,
          band: { low: 0, high: 6, tolerance: { beginner: 1, intermediate: 1, advanced: 1 } },
          deviation: 1.2,
          confidence: 0.82,
        },
      ],
      first_guilty_frame: 10,
      protocol_id: null,
      mode: "diagnose",
      reasons: ["above band by 1.20 tolerance units"],
      delta_pct_stance: null,
      score_internal: 70,
    };

    const input = diagnosisToRevealInput({
      diagnosis,
      angle: "dtl",
      coach: {
        headline: "You stood up through impact.",
        why: "Your pelvis moved toward the ball.",
        feel_cue: "Brush the turf past the tee.",
        drill: {
          name: "Stick drill",
          protocol_seconds: 60,
          reps_slow: 3,
          reps_rehearsal: 1,
          reps_live: 1,
          constraint: "Stick behind hips",
        },
      },
    });

    expect(input.whatChangedSince).toBeUndefined();
    expect(input.headline).toBe("You stood up through impact.");
    expect(input.metric.confidence).toBeGreaterThanOrEqual(0.5);
  });

  test("refuse outcome clears metric confidence", () => {
    const diagnosis: DiagnosisResult = {
      outcome: "refuse",
      headline_fault: "We couldn't read this clip reliably enough to diagnose.",
      fault_key: null,
      family: null,
      evidence: [],
      first_guilty_frame: null,
      protocol_id: null,
      mode: "diagnose",
      reasons: ["no metric cleared confidence gate"],
      delta_pct_stance: null,
      score_internal: null,
    };

    const input = diagnosisToRevealInput({ diagnosis, angle: "dtl" });
    expect(input.insufficientData).toBe(true);
    expect(input.metric.confidence).toBe(0);
    expect(input.metric.value).toBe(0);
  });
});
