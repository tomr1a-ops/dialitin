#!/usr/bin/env npx tsx
/**
 * Phase 2e batch report: ball at address, start_line, strike features, reverberant flag.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import WebSocket from "ws";
import { listTestSwings } from "../src/lib/admin/queries";
import { estimateCameraAngle } from "../src/lib/engine/angle";
import { analyzeBall } from "../src/lib/engine/ball";
import { analyzeStrike } from "../src/lib/engine/strike";
import { findSwingPhases } from "../src/lib/engine/phases";
import {
  decodeAudioFromClip,
  extractBallFramePixels,
} from "../src/lib/ingest/extract-audio-window";
import { framesFromStoredKeypoints } from "../src/lib/preview/coverage";

if (!globalThis.WebSocket) {
  globalThis.WebSocket = WebSocket as unknown as typeof WebSocket;
}

function loadEnvFile(path: string) {
  try {
    const raw = readFileSync(path, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    /* optional */
  }
}

loadEnvFile(resolve(process.cwd(), ".env.development.local"));

async function main() {
  const swings = await listTestSwings();
  console.log("Phase 2e report — test swings\n");

  for (const swing of swings) {
    const label = swing.golfer_label ?? swing.id.slice(0, 8);
    const kp = swing.keypoints;
    if (!kp?.phases || !kp.keypoints?.length) {
      console.log(`${label}: skip — no keypoints`);
      continue;
    }

    const frames = framesFromStoredKeypoints(kp.keypoints);
    const phases =
      kp.phases ??
      findSwingPhases(frames, {
        handedness: swing.handedness === "left" ? "left" : "right",
        capturePath:
          swing.capture_path === "in_app" ? "in_app" : "native_slomo",
        labeledFrameRate: swing.frame_rate,
      });

    const angle =
      kp.angle ??
      estimateCameraAngle({
        frames,
        phases,
        imageWidth: 1080,
        imageHeight: 1920,
        capturePath: swing.capture_path,
        handedness: swing.handedness ?? "right",
      }).angle;

    let framePixels: (ImageData | null)[] | undefined;
    let audio: Awaited<ReturnType<typeof decodeAudioFromClip>> = null;

    if (swing.storage_path && swing.signed_url) {
      try {
        const res = await fetch(swing.signed_url);
        if (res.ok) {
          const clip = new Blob([await res.arrayBuffer()], {
            type: "video/mp4",
          });
          framePixels = await extractBallFramePixels({
            clip,
            frames,
            addressIndex: phases.address.frameIndex,
            impactIndex: phases.impact.frameIndex,
          });
          audio = await decodeAudioFromClip(clip);
        }
      } catch {
        /* browser APIs may be unavailable in node — try signed fetch only */
      }
    }

    const ball = await analyzeBall({
      frames,
      phases,
      angle,
      handedness: swing.handedness ?? "right",
      imageWidth: 1080,
      imageHeight: 1920,
      framePixels,
      ballLabels: (kp as { ball_labels?: Record<string, unknown> }).ball_labels ?? null,
    });

    const onsetSec =
      phases.impact.valid && frames[phases.impact.frameIndex]
        ? frames[phases.impact.frameIndex]!.mediaTime
        : null;

    const strike = analyzeStrike({
      samples: audio?.samples ?? null,
      sampleRate: audio?.sampleRate ?? 44100,
      onsetHintSec: onsetSec,
      capturePath: swing.capture_path,
      clubFamily: swing.club_family,
    });

    const storedFeatures = (kp as { strike_features?: unknown }).strike_features;
    const featuresPresent = Boolean(strike.features || storedFeatures);
    const reverberant = strike.features?.reverberant ?? false;

    console.log(
      [
        label,
        `ball@${phases.address.valid ? (ball.blob_found ? "seen" : "not_found") : "n/a"}`,
        `start_line=${ball.start_line.value} conf=${ball.launch_direction_confidence.value.toFixed(2)}`,
        `strike_features=${featuresPresent ? "yes" : "no"}`,
        `reverberant=${reverberant}`,
      ].join(" | "),
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
