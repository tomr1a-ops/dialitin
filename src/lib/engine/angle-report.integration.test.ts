import { describe, expect, test } from "vitest";
import { estimateCameraAngle } from "@/lib/engine/angle";
import { phasesFromUnknown } from "@/lib/engine/phases";
import { framesFromStoredKeypoints } from "@/lib/preview/coverage";

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
  capture_path: string | null;
};

type KeypointRow = {
  keypoints: unknown;
  phases: unknown;
  orientation: unknown;
};

describe.skipIf(!hasSupabase)("test set angle report", () => {
  test(
    "reports angle for all filming-day clips",
    async () => {
      const swings = await rest<TestSwingRow[]>(
        "test_swings",
        "select=id,golfer_label,angle,capture_path&order=golfer_label.asc",
      );
      expect(swings.length).toBeGreaterThan(0);

      const report: Record<string, unknown>[] = [];
      for (const swing of swings) {
        const kpRows = await rest<KeypointRow[]>(
          "test_swing_keypoints",
          `select=keypoints,phases,orientation&test_swing_id=eq.${swing.id}&order=created_at.desc&limit=1`,
        );
        const row = kpRows[0];
        if (!row?.keypoints || !row.phases) {
          report.push({
            golfer: swing.golfer_label,
            case: "—",
            classification: "—",
            labeled: swing.angle,
            yaw: null,
            confidence: null,
            refused: "no keypoints",
            elapsedMs: null,
          });
          continue;
        }

        const phases = phasesFromUnknown(row.phases);
        if (!phases) {
          continue;
        }

        const result = estimateCameraAngle({
          frames: framesFromStoredKeypoints(row.keypoints),
          phases,
          imageWidth: 1080,
          imageHeight: 1920,
          capturePath: swing.capture_path as "in_app" | "native_slomo" | null,
          orientationSamples: Array.isArray(row.orientation)
            ? row.orientation
            : [],
          verticalRoll: null,
        });

        const a = result.angle;
        report.push({
          golfer: swing.golfer_label,
          case: a.case,
          classification: a.classification.value,
          labeled: swing.angle,
          yaw: a.yaw.valid ? a.yaw.value : null,
          confidence: a.confidence,
          refused: a.valid ? "no" : "yes",
          elapsedMs: a.elapsedMs,
        });
      }

      console.info("\n--- ANGLE REPORT ---\n" + JSON.stringify(report, null, 2));
      expect(report.length).toBe(swings.length);
    },
    120_000,
  );
});
