import { describe, expect, test } from "vitest";
import { estimateCameraAngle, angleFromUnknown } from "@/lib/engine/angle";
import {
  computeFaceOnMetrics,
  type FaceOnMetricKey,
} from "@/lib/engine/metrics/faceOn";
import { phasesFromUnknown } from "@/lib/engine/phases";
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

const METRIC_KEYS: FaceOnMetricKey[] = [
  "shoulder_rotation_top",
  "hip_rotation_top",
  "trail_knee_flexion_change",
  "hip_sway_back",
  "hip_slide_down",
  "head_sway",
  "head_lift",
  "weight_transfer_proxy",
  "width_at_top",
  "lead_elbow_separation",
  "sequence_proxy",
  "tempo_ratio",
  "ball_position_inferred",
];

describe.skipIf(!hasSupabase)("G01 face-on metrics report", () => {
  test(
    "reports all 12 face-on metrics for G01 pro clip",
    async () => {
      const swings = await rest<TestSwingRow[]>(
        "test_swings",
        "select=id,golfer_label,angle,handedness,club_family,intent&golfer_label=eq.G01&order=created_at.desc",
      );
      expect(swings.length).toBeGreaterThan(0);

      let faceOn = swings[0]!;
      let row: KeypointRow | undefined;
      let angle: ReturnType<typeof angleFromUnknown> = null;
      let phases = null as ReturnType<typeof phasesFromUnknown>;
      let frames = [] as ReturnType<typeof framesFromStoredKeypoints>;
      let normalized = null as ReturnType<typeof framesFromStoredKeypoints> | null;

      for (const candidate of swings) {
        const kpRows = await rest<KeypointRow[]>(
          "test_swing_keypoints",
          `select=id,keypoints,normalized_keypoints,phases,angle,metrics&test_swing_id=eq.${candidate.id}&order=created_at.desc&limit=1`,
        );
        const kp = kpRows[0];
        if (!kp?.keypoints || !kp.phases) {
          continue;
        }
        const candidatePhases = phasesFromUnknown(kp.phases);
        if (!candidatePhases) {
          continue;
        }
        const candidateFrames = framesFromStoredKeypoints(kp.keypoints);
        let candidateAngle = angleFromUnknown(kp.angle);
        let candidateNormalized = kp.normalized_keypoints
          ? framesFromStoredKeypoints(kp.normalized_keypoints)
          : null;
        if (!candidateAngle) {
          const angleResult = estimateCameraAngle({
            frames: candidateFrames,
            phases: candidatePhases,
            imageWidth: 1080,
            imageHeight: 1920,
            capturePath: "native_slomo",
            verticalRoll: null,
            handedness: (candidate.handedness === "left"
              ? "left"
              : "right") as Handedness,
          });
          candidateAngle = angleResult.angle;
          candidateNormalized = angleResult.normalizedFrames;
          await patchKeypoints(kp.id, {
            angle: candidateAngle,
            normalized_keypoints: candidateNormalized,
          });
        }
        if (candidateAngle?.classification.value === "face_on") {
          faceOn = candidate;
          row = kp;
          angle = candidateAngle;
          phases = candidatePhases;
          frames = candidateFrames;
          normalized = candidateNormalized;
          break;
        }
        faceOn = candidate;
        row = kp;
        angle = candidateAngle;
        phases = candidatePhases;
        frames = candidateFrames;
        normalized = candidateNormalized;
      }

      expect(row?.keypoints).toBeTruthy();
      expect(phases).toBeTruthy();
      expect(angle).toBeTruthy();

      const metrics = computeFaceOnMetrics({
        frames,
        normalizedFrames: normalized,
        phases: phases!,
        angle,
        handedness: faceOn.handedness === "left" ? "left" : "right",
        clubFamily: faceOn.club_family as ClubFamily | null,
        intent: faceOn.intent as ShotIntent | null,
      });

      await patchKeypoints(row!.id, { metrics });

      const report: Record<string, unknown> = {
        golfer: faceOn.golfer_label,
        labeled_angle: faceOn.angle,
        classified: angle?.classification.value,
        handedness: faceOn.handedness,
      };

      for (const key of METRIC_KEYS) {
        const m = metrics[key];
        report[key] = {
          value: m.value,
          unit: m.unit,
          confidence: m.confidence,
          valid: m.valid,
          reason: m.reason,
        };
      }

      console.info(
        "\n--- G01 FACE-ON METRICS ---\n" + JSON.stringify(report, null, 2),
      );

      expect(angle?.classification.value).toBe("face_on");
      for (const key of METRIC_KEYS) {
        expect(metrics[key]).toBeDefined();
        expect(typeof metrics[key].value).toBe("number");
      }
    },
    120_000,
  );
});
