import { describe, expect, test } from "vitest";
import { formatPoseStatus } from "@/lib/pose/status";

describe("formatPoseStatus", () => {
  test("shows model download progress in megabytes", () => {
    expect(
      formatPoseStatus({
        phase: "loading-model",
        loadedBytes: 1_048_576,
        totalBytes: 5_777_746,
      }),
    ).toBe("Loading model… (1.0 of 5.5 MB)");
  });

  test("shows body-reading frame progress", () => {
    expect(
      formatPoseStatus({
        phase: "reading-body",
        frame: 12,
        totalFrames: 90,
      }),
    ).toBe("Reading your body… frame 12 of 90");
  });
});
