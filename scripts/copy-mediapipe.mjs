import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcWasm = join(root, "node_modules/@mediapipe/tasks-vision/wasm");
const destDir = join(root, "public/mediapipe");
const destWasm = join(destDir, "wasm");
const modelUrl =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const modelPath = join(destDir, "pose_landmarker_lite.task");

mkdirSync(destWasm, { recursive: true });

for (const file of readdirSync(srcWasm)) {
  copyFileSync(join(srcWasm, file), join(destWasm, file));
}

copyFileSync(
  join(root, "node_modules/@mediapipe/tasks-vision/vision_bundle.mjs"),
  join(destDir, "vision_bundle.mjs"),
);

const existing = await fetch(modelUrl).then((response) => {
  if (!response.ok) {
    throw new Error(`Failed to download pose model: ${response.status}`);
  }
  return response.arrayBuffer();
});
const { writeFileSync } = await import("node:fs");
writeFileSync(modelPath, Buffer.from(existing));

console.log(
  "Copied MediaPipe wasm, bundle, and lite pose model to public/mediapipe",
);
