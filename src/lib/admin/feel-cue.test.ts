import { describe, expect, test } from "vitest";
import { validateFeelCue } from "@/lib/admin/feel-cue";

describe("validateFeelCue", () => {
  test("accepts a short external cue", () => {
    const result = validateFeelCue("Brush the turf two inches past the tee");
    expect(result.ok).toBe(true);
    expect(result.wordCount).toBe(8);
  });

  test("rejects more than 12 words", () => {
    const result = validateFeelCue(
      "one two three four five six seven eight nine ten eleven twelve thirteen",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("13 words");
      expect(result.rule).toContain("6.4");
    }
  });

  test("rejects an internal body-part cue and shows the rule", () => {
    const result = validateFeelCue("Keep your lead hip back");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("hip");
      expect(result.rule).toContain("External-cue rule (6.4)");
    }
  });

  test("allows chip and ahead because they are not body-part words", () => {
    expect(validateFeelCue("chip it low under the branch").ok).toBe(true);
    expect(validateFeelCue("stay ahead of the ball").ok).toBe(true);
  });

  test("rejects plural body-part words", () => {
    const result = validateFeelCue("Turn the shoulders harder");
    expect(result.ok).toBe(false);
  });
});
