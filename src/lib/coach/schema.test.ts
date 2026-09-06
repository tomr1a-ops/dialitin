import { describe, expect, test } from "vitest";
import {
  COACH_RETRY_INSTRUCTION,
  coachOutputValidation,
  fallbackCoachOutput,
  validateCoachOutput,
} from "@/lib/coach/schema";

describe("coach output validator", () => {
  test("rejects em dash and en dash", () => {
    expect(validateCoachOutput("Your hips slid — toward target").valid).toBe(
      false,
    );
    expect(validateCoachOutput("Band 0–5 percent").valid).toBe(false);
  });

  test("rejects semicolons and parentheses in why", () => {
    expect(validateCoachOutput("One idea; another idea").valid).toBe(false);
    expect(validateCoachOutput("Your hips (at impact) slid").valid).toBe(
      false,
    );
  });

  test("accepts period and comma prose", () => {
    const good = {
      headline: "You stood up through impact.",
      why: "Your pelvis moved toward the ball. That shifts your low point.",
      feel_cue: "Brush the turf past the tee.",
      drill: {
        name: "Stick drill",
        protocol_seconds: 60 as const,
        reps_slow: 3,
        reps_rehearsal: 1,
        reps_live: 1,
        constraint: "Stick behind hips",
      },
    };
    expect(coachOutputValidation(good).valid).toBe(true);
  });

  test("fallback uses pro voice verbatim fields", () => {
    const fb = fallbackCoachOutput(
      {
        fault_key: "hip_slide_down",
        feel_cue: "Bump without sliding",
        ball_flight_cost: "Thin contact",
        explanation: "Your hips slid toward the target before your hands caught up.",
        signed_by: "Pro",
      },
      {
        id: "p1",
        fault_key: "hip_slide_down",
        name: "Hip bump",
        constraint_text: "Stick outside trail foot",
        reps_slow: 3,
        reps_rehearsal: 1,
        reps_live: 1,
        ball: "none",
        progression: "",
        success_criterion: "Hips stay on line",
      },
    );
    expect(fb.why).toBe(
      "Your hips slid toward the target before your hands caught up.",
    );
    expect(fb.grip_and_face_line).not.toMatch(/[—–]/);
  });

  test("retry instruction mentions dashes", () => {
    expect(COACH_RETRY_INSTRUCTION).toContain("dashes");
  });
});
