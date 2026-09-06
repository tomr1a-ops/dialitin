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
  frame_rate: 120,
  camera_yaw_marker: 0,
  capture_path: "native_slomo",
  consecutive_group: "noise-a",
  pro_label_fault_1: "early_extension",
  pro_label_fault_2: "",
  handedness: "right",
  notes: "filming day 1",
};

describe("parseTestSwingLabels", () => {
  test("accepts a Rev 29 filming-day row", () => {
    const result = parseTestSwingLabels(valid);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.labels.capture_path).toBe("native_slomo");
      expect(result.labels.pro_label_fault_2).toBeNull();
    }
  });

  test("allows a nullable intent and yaw", () => {
    const result = parseTestSwingLabels({
      ...valid,
      intent: "",
      camera_yaw_marker: "",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.labels.intent).toBeNull();
      expect(result.labels.camera_yaw_marker).toBeNull();
    }
  });

  test("rejects the retired upload capture path", () => {
    const result = parseTestSwingLabels({ ...valid, capture_path: "upload" });
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
