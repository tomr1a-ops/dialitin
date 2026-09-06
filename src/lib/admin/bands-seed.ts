import {
  buildSeedCells,
  extractMetricSamples,
  scatterForCell,
  type MetricSample,
} from "@/lib/harvest/seed-bands";
import { createSecretSupabaseClient } from "@/lib/supabase/admin";
import { phasesFromUnknown } from "@/lib/engine/phases";
import { angleFromUnknown } from "@/lib/engine/angle";
import { swingMetricsFromUnknown } from "@/lib/engine/metrics/storage";
import type { ClubFamily } from "@/lib/admin/test-swings";

export type BandsSeedCell = ReturnType<typeof buildSeedCells>[number] & {
  scatter: Array<{ swingId: string; value: number }>;
};

export type BandsSeedPreview = {
  cells: BandsSeedCell[];
  clipCount: number;
  sampleCount: number;
};

function isKnownClub(value: unknown): value is ClubFamily {
  return (
    value === "driver" ||
    value === "wood_hybrid" ||
    value === "long_iron" ||
    value === "short_iron" ||
    value === "wedge"
  );
}

export async function loadBandsSeedPreview(): Promise<BandsSeedPreview> {
  const secret = createSecretSupabaseClient();
  const { data: swings } = await secret
    .from("test_swings")
    .select("id, club_family, tier, excluded, parent_id")
    .eq("tier", "reference")
    .eq("excluded", false)
    .is("parent_id", null);

  const eligible = (swings ?? []).filter(
    (row) => isKnownClub(row.club_family) && !row.parent_id,
  );
  const ids = eligible.map((row) => row.id);
  if (ids.length === 0) {
    return { cells: [], clipCount: 0, sampleCount: 0 };
  }

  const { data: kpRows } = await secret
    .from("test_swing_keypoints")
    .select("test_swing_id, metrics, angle, phases")
    .in("test_swing_id", ids)
    .order("created_at", { ascending: false });

  const latest = new Map<string, NonNullable<typeof kpRows>[number]>();
  for (const row of kpRows ?? []) {
    if (!latest.has(row.test_swing_id)) {
      latest.set(row.test_swing_id, row);
    }
  }

  const samples: MetricSample[] = [];
  for (const swing of eligible) {
    const kp = latest.get(swing.id);
    if (!kp) {
      continue;
    }
    samples.push(
      ...extractMetricSamples({
        swingId: swing.id,
        clubFamily: swing.club_family as ClubFamily,
        metrics: swingMetricsFromUnknown(kp.metrics),
        angle: angleFromUnknown(kp.angle),
        phases: phasesFromUnknown(kp.phases),
      }),
    );
  }

  const { data: metrics } = await secret
    .from("metrics")
    .select("object_id, key, angle, name")
    .order("key");

  const cells = buildSeedCells({
    samples,
    metrics: (metrics ?? []).map((row) => ({
      object_id: row.object_id as string,
      key: row.key as string,
      angle: row.angle as "dtl" | "face_on" | "either",
    })),
  }).map((cell) => ({
    ...cell,
    scatter: scatterForCell(samples, cell),
  }));

  return { cells, clipCount: eligible.length, sampleCount: samples.length };
}

export async function seedBandsFromReference(input: {
  userId: string;
  email: string;
}): Promise<{ inserted: number; cells: BandsSeedPreview["cells"] }> {
  const secret = createSecretSupabaseClient();
  const preview = await loadBandsSeedPreview();
  if (preview.cells.length === 0) {
    throw new Error(
      "No seed cells — need reference-tier clips that passed the angle gate with known club families.",
    );
  }

  const { randomUUID } = await import("node:crypto");
  let inserted = 0;
  for (const cell of preview.cells) {
    if (cell.p5 == null || cell.p95 == null) {
      continue;
    }
    const { error } = await secret.from("bands").insert({
      object_id: randomUUID(),
      version: 1,
      status: "seeded_unsigned",
      created_by: input.userId,
      created_by_email: input.email,
      metric_object_id: cell.metricObjectId,
      club_family: cell.clubFamily,
      intent: "stock",
      functional_low: cell.p5,
      functional_high: cell.p95,
      tolerance_beginner: null,
      tolerance_intermediate: null,
      tolerance_advanced: null,
    });
    if (!error) {
      inserted += 1;
    }
  }

  return { inserted, cells: preview.cells };
}
