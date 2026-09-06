import { describe, expect, test } from "vitest";
import { explainPoseFailure } from "@/lib/pose/errors";

describe("explainPoseFailure", () => {
  test("uses plain words plus the technical reason for a dropped model download", () => {
    const explained = explainPoseFailure(new Error("Failed to fetch"));
    expect(explained.userMessage).toBe(
      "Couldn't load the pose model. Connection dropped",
    );
    expect(explained.technicalReason).toBe("Failed to fetch");
  });

  test("surfaces a start failure without swallowing the original message", () => {
    const explained = explainPoseFailure(
      new Error("OffscreenCanvas is unavailable."),
    );
    expect(explained.userMessage).toBe(
      "Pose failed to start: OffscreenCanvas is unavailable.",
    );
    expect(explained.technicalReason).toBe("OffscreenCanvas is unavailable.");
  });
});
