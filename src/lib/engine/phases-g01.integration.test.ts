import { describe, expect, test } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { estimateCameraAngle, angleFromUnknown } from "@/lib/engine/angle";
import { computeFaceOnMetrics } from "@/lib/engine/metrics/faceOn";
import {
  AV_CLOCK_OFFSET_MS,
  AV_CLOCK_OFFSET_REASON,
  findSwingPhases,
  phasesFromUnknown,
  type ImpactDiagnostics,
} from "@/lib/engine/phases";
import { framesFromStoredKeypoints } from "@/lib/preview/coverage";
import type { ClubFamily, Handedness, ShotIntent } from "@/lib/admin/test-swings";

const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
const hasSupabase = Boolean(base && key);

async function rest<T>(path: string, query = ""): Promise<T> {
  const res = await fetch(`${base}/rest/v1/${path}?${query}`, {
    headers: {
      apikey: key!,
      Authorization: `Bearer ${key}`,
    },
  });
  if (!res.ok) {
    throw new Error(`${path}: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

type TestSwingRow = {
  id: string;
  golfer_label: string | null;
  angle: string | null;
  handedness: string | null;
  club_family: string | null;
  intent: string | null;
  capture_path: string | null;
  frame_rate: number | null;
  storage_path: string | null;
};

type KeypointRow = {
  id: string;
  keypoints: unknown;
  normalized_keypoints: unknown;
  phases: unknown;
  angle: unknown;
  metrics: unknown;
};

async function patchKeypoints(id: string, body: Record<string, unknown>) {
  const res = await fetch(`${base}/rest/v1/test_swing_keypoints?id=eq.${id}`, {
    method: "PATCH",
    headers: {
      apikey: key!,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`patch keypoints: ${res.status}`);
  }
}

async function signedClipUrl(storagePath: string) {
  const res = await fetch(
    `${base}/storage/v1/object/sign/test-swings/${storagePath}`,
    {
      method: "POST",
      headers: {
        apikey: key!,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expiresIn: 3600 }),
    },
  );
  if (!res.ok) {
    throw new Error(`sign clip: ${res.status}`);
  }
  const json = (await res.json()) as { signedURL: string };
  return `${base}/storage/v1${json.signedURL}`;
}

function audioSamplesFromClip(
  clipBytes: Buffer,
  timesMs: number[],
): Array<{ timeMs: number; rms: number }> {
  const dir = mkdtempSync(join(tmpdir(), "g01-audio-"));
  const clipPath = join(dir, "clip.mov");
  const wavPath = join(dir, "audio.raw");
  writeFileSync(clipPath, clipBytes);
  execFileSync(
    "ffmpeg",
    ["-y", "-i", clipPath, "-ac", "1", "-ar", "44100", "-f", "f32le", wavPath],
    { stdio: "ignore" },
  );
  const raw = readFileSync(wavPath);
  const sampleRate = 44100;
  const samples = new Float32Array(
    raw.buffer,
    raw.byteOffset,
    raw.byteLength / 4,
  );
  const windowMs = 33;
  return timesMs.map((timeMs) => {
    const center = Math.round((timeMs / 1000) * sampleRate);
    const half = Math.round((windowMs / 1000) * sampleRate);
    const from = Math.max(0, center - half);
    const to = Math.min(samples.length, center + half);
    let sum = 0;
    for (let i = from; i < to; i++) {
      const s = samples[i]!;
      sum += s * s;
    }
    const n = Math.max(1, to - from);
    return { timeMs, rms: Math.sqrt(sum / n) };
  });
}

describe.skipIf(!hasSupabase)("G01 phase recompute", () => {
  test(
    "recomputes phases and metrics for G01 face-on clip",
    async () => {
      const swings = await rest<TestSwingRow[]>(
        "test_swings",
        "select=id,golfer_label,angle,handedness,club_family,intent,capture_path,frame_rate,storage_path&golfer_label=eq.G01&order=created_at.desc",
      );
      expect(swings.length).toBeGreaterThan(0);

      const swing = swings[0]!;
      const kpRows = await rest<KeypointRow[]>(
        "test_swing_keypoints",
        `select=id,keypoints,normalized_keypoints,phases,angle,metrics&test_swing_id=eq.${swing.id}&order=created_at.desc&limit=1`,
      );
      const row = kpRows[0];
      expect(row?.keypoints).toBeTruthy();

      const frames = framesFromStoredKeypoints(row!.keypoints);
      const beforePhases = phasesFromUnknown(row!.phases);
      const diagnostics: ImpactDiagnostics = {
        audioTransientFrameIndex: null,
        motionPeakFrameIndex: null,
        motionImpactFrameIndex: null,
        measuredAvOffsetMs: null,
      };

      const capturePath =
        swing.capture_path === "in_app"
          ? "in_app"
          : swing.capture_path === "native_slomo"
            ? "native_slomo"
            : "upload";

      let audioSamples: Array<{ timeMs: number; rms: number }> | undefined;
      if (swing.storage_path) {
        try {
          const clipUrl = await signedClipUrl(swing.storage_path);
          const clipRes = await fetch(clipUrl);
          if (clipRes.ok) {
            const clipBytes = Buffer.from(await clipRes.arrayBuffer());
            audioSamples = audioSamplesFromClip(
              clipBytes,
              frames.map((frame) => frame.mediaTime * 1000),
            );
          }
        } catch {
          audioSamples = undefined;
        }
      }

      const phases = findSwingPhases(frames, {
        audioSamples,
        handedness: swing.handedness === "left" ? "left" : "right",
        capturePath,
        labeledFrameRate: swing.frame_rate,
        fileName: swing.storage_path ?? undefined,
        diagnostics,
      });

      let angle = angleFromUnknown(row!.angle);
      let normalized = row!.normalized_keypoints
        ? framesFromStoredKeypoints(row!.normalized_keypoints)
        : null;
      if (!angle) {
        const angleResult = estimateCameraAngle({
          frames,
          phases,
          imageWidth: 1080,
          imageHeight: 1920,
          capturePath: swing.capture_path ?? "upload",
          verticalRoll: null,
          handedness: (swing.handedness === "left"
            ? "left"
            : "right") as Handedness,
        });
        angle = angleResult.angle;
        normalized = angleResult.normalizedFrames;
      }

      const metrics = computeFaceOnMetrics({
        frames,
        normalizedFrames: normalized,
        phases,
        angle,
        handedness: swing.handedness === "left" ? "left" : "right",
        clubFamily: swing.club_family as ClubFamily | null,
        intent: swing.intent as ShotIntent | null,
      });

      await patchKeypoints(row!.id, {
        phases,
        angle,
        normalized_keypoints: normalized,
        metrics,
      });

      const report = {
        before: beforePhases
          ? {
              address: beforePhases.address.frameIndex,
              takeaway: beforePhases.takeaway.frameIndex,
              top: beforePhases.top.frameIndex,
              impact: beforePhases.impact.frameIndex,
              finish: beforePhases.finish.frameIndex,
            }
          : null,
        phase_frames: {
          address: phases.address.frameIndex,
          takeaway: phases.takeaway.frameIndex,
          top: phases.top.frameIndex,
          impact: phases.impact.frameIndex,
          finish: phases.finish.frameIndex,
        },
        audio_transient_frame: diagnostics.audioTransientFrameIndex,
        motion_strike_frame: diagnostics.motionImpactFrameIndex,
        motion_peak_frame: diagnostics.motionPeakFrameIndex,
        measured_av_offset_ms: diagnostics.measuredAvOffsetMs,
        av_clock_offset_ms: AV_CLOCK_OFFSET_MS[capturePath],
        av_clock_offset_reason: AV_CLOCK_OFFSET_REASON[capturePath],
        impact_candidate: phases.impactCandidate.value,
        slo_mo_reexport: phases.sloMoReexportedAt30.value,
      };

      console.info(
        "\n--- G01 PHASE RECOMPUTE ---\n" + JSON.stringify(report, null, 2),
      );

      expect(phases.impact.valid).toBe(true);
      expect(phases.top.valid).toBe(true);
      expect(phases.top.frameIndex).toBeLessThan(phases.impact.frameIndex);
      expect(
        phases.impact.frameIndex - phases.top.frameIndex,
      ).toBeGreaterThanOrEqual(4);
    },
    120_000,
  );
});
