import { describe, expect, test } from "vitest";
import {
  parseTestSwingLabels,
  safeClipFileName,
} from "@/lib/admin/test-swings";

const valid = {
  golfer_label: "G01",
  club_family: "driver",
  intent: "stock",
  angle: "dtl",
  frame_rate: 30,
  camera_yaw_marker: 0,
  capture_path: "upload",
  consecutive_group: "noise-a",
  pro_label_fault_1: "early_extension",
  pro_label_fault_2: "",
  handedness: "right",
  notes: "filming day 1",
};

describe("parseTestSwingLabels", () => {
  test("accepts a complete filming-day label row", () => {
    const result = parseTestSwingLabels(valid);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.labels.pro_label_fault_2).toBeNull();
      expect(result.labels.consecutive_group).toBe("noise-a");
    }
  });

  test("rejects a yaw that is not on the filming-day marker set", () => {
    const result = parseTestSwingLabels({ ...valid, camera_yaw_marker: 7 });
    expect(result.ok).toBe(false);
  });

  test("rejects a missing golfer label", () => {
    const result = parseTestSwingLabels({ ...valid, golfer_label: "  " });
    expect(result.ok).toBe(false);
  });
});

describe("safeClipFileName", () => {
  test("strips path characters", () => {
    expect(safeClipFileName("../../G01 face on.mov")).toBe(
      ".._.._G01_face_on.mov",
    );
  });
});
