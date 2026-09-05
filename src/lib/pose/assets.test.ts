import { describe, expect, test } from "vitest";
import {
  PINNED_POSE_ASSETS,
  POSE_MODEL,
  POSE_WASM_DIR,
  SERWIST_POSE_PRECACHE,
  TASKS_VISION_VERSION,
  bytesToMb,
} from "@/lib/pose/assets";

describe("pinned MediaPipe asset URLs", () => {
  test("pins exact same-origin WASM and .task URLs for tasks-vision 1.0.1", () => {
    expect(TASKS_VISION_VERSION).toBe("1.0.1");
    expect(POSE_WASM_DIR).toBe("/mediapipe/wasm");
    expect(POSE_MODEL.url).toBe("/mediapipe/pose_landmarker_lite.task");
    expect(POSE_MODEL.bytes).toBe(5_777_746);

    expect(PINNED_POSE_ASSETS.map((asset) => asset.url)).toEqual([
      "/mediapipe/pose_landmarker_lite.task",
      "/mediapipe/wasm/vision_wasm_internal.js",
      "/mediapipe/wasm/vision_wasm_internal.wasm",
      "/mediapipe/wasm/vision_wasm_nosimd_internal.js",
      "/mediapipe/wasm/vision_wasm_nosimd_internal.wasm",
      "/mediapipe/wasm/vision_wasm_module_internal.js",
      "/mediapipe/wasm/vision_wasm_module_internal.wasm",
      "/mediapipe/vision_bundle.mjs",
    ]);
  });

  test("precaches the ESM wasm glue the module worker imports", () => {
    expect(SERWIST_POSE_PRECACHE.map((entry) => entry.url)).toEqual(
      expect.arrayContaining([
        "/mediapipe/wasm/vision_wasm_module_internal.js",
        "/mediapipe/wasm/vision_wasm_module_internal.wasm",
        "/mediapipe/vision_bundle.mjs",
      ]),
    );
    for (const entry of SERWIST_POSE_PRECACHE) {
      expect(entry.revision).toBe("tasks-vision-1.0.1");
    }
  });

  test("formats download size in megabytes for the loading status", () => {
    expect(bytesToMb(POSE_MODEL.bytes)).toBe("5.5");
    expect(bytesToMb(1_048_576)).toBe("1.0");
  });
});
