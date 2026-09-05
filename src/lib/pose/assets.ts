export const TASKS_VISION_VERSION = "1.0.1";

export type PinnedAsset = {
  url: string;
  bytes: number;
};

export const POSE_WASM_DIR = "/mediapipe/wasm";

export const POSE_MODEL: PinnedAsset = {
  url: "/mediapipe/pose_landmarker_lite.task",
  bytes: 5_777_746,
};

export const PINNED_POSE_ASSETS: readonly PinnedAsset[] = [
  POSE_MODEL,
  { url: "/mediapipe/wasm/vision_wasm_internal.js", bytes: 323_377 },
  { url: "/mediapipe/wasm/vision_wasm_internal.wasm", bytes: 11_756_954 },
  { url: "/mediapipe/wasm/vision_wasm_nosimd_internal.js", bytes: 323_180 },
  {
    url: "/mediapipe/wasm/vision_wasm_nosimd_internal.wasm",
    bytes: 10_960_242,
  },
  { url: "/mediapipe/wasm/vision_wasm_module_internal.js", bytes: 323_415 },
  {
    url: "/mediapipe/wasm/vision_wasm_module_internal.wasm",
    bytes: 11_756_972,
  },
  { url: "/mediapipe/vision_bundle.mjs", bytes: 155_439 },
];

/** Gitignored binaries plus the ESM/classic wasm glue the module worker loads. */
export const SERWIST_POSE_PRECACHE = [
  POSE_MODEL,
  { url: "/mediapipe/wasm/vision_wasm_internal.js", bytes: 323_377 },
  { url: "/mediapipe/wasm/vision_wasm_internal.wasm", bytes: 11_756_954 },
  { url: "/mediapipe/wasm/vision_wasm_nosimd_internal.js", bytes: 323_180 },
  {
    url: "/mediapipe/wasm/vision_wasm_nosimd_internal.wasm",
    bytes: 10_960_242,
  },
  { url: "/mediapipe/wasm/vision_wasm_module_internal.js", bytes: 323_415 },
  {
    url: "/mediapipe/wasm/vision_wasm_module_internal.wasm",
    bytes: 11_756_972,
  },
  { url: "/mediapipe/vision_bundle.mjs", bytes: 155_439 },
].map((asset) => ({
  url: asset.url,
  revision: `tasks-vision-${TASKS_VISION_VERSION}`,
}));

export function bytesToMb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

export function assetUrl(path: string): string {
  if (typeof window === "undefined") {
    return path;
  }
  return `${window.location.origin}${path}`;
}
