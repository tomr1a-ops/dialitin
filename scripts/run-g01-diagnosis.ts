#!/usr/bin/env npx tsx
/**
 * G01 diagnosis flow test (Phase 2 E):
 * 1. Empty tables → insufficient_data, no Claude call
 * 2. Seed hip_slide_down → real coach output
 */
import { execFileSync } from "node:child_process";
import WebSocket from "ws";
import { listTestSwings } from "../src/lib/admin/queries";
import { loadPublishedCoachingContent, buildCoachingContent } from "../src/lib/engine/content";
import { buildBandsTable } from "../src/lib/engine/bands";
import { evaluateSwingMetrics } from "../src/lib/engine/evaluate";
import { diagnose } from "../src/lib/engine/diagnose";
import { explainDiagnosis } from "../src/lib/coach/explain";
import { createSecretSupabaseClient } from "../src/lib/supabase/admin";
import { phasesFromUnknown } from "../src/lib/engine/phases";
import type { StoredSwingMetrics } from "../src/lib/engine/metrics/storage";

if (!globalThis.WebSocket) {
  globalThis.WebSocket = WebSocket as unknown as typeof WebSocket;
}

async function loadG01() {
  const swings = await listTestSwings();
  const g01 = swings.find((s) => s.golfer_label === "G01" && s.keypoints?.metrics);
  if (!g01?.keypoints?.metrics || !g01.keypoints.phases) {
    throw new Error("G01 with metrics not found — run scorer first");
  }
  return g01;
}

async function runEmptyTablesTest(metrics: StoredSwingMetrics, phases: ReturnType<typeof phasesFromUnknown>) {
  const emptyContent = buildCoachingContent({
    bands: buildBandsTable({ metrics: [], bands: [], snapshot: { bands: {} } }),
    faults: [],
    hasSignedBands: false,
    hasSignedFaults: false,
  });

  const evaluations = evaluateSwingMetrics({
    metrics,
    classification: "face_on",
    level: "intermediate",
    clubFamily: "wedge",
    bands: emptyContent.bands,
  });

  const diagnosis = diagnose({
    evaluations,
    phases,
    angle: "face_on",
    clubFamily: "wedge",
    handedness: "right",
    level: "intermediate",
    content: emptyContent,
  });

  const coach = await explainDiagnosis({
    diagnosis,
    content: emptyContent,
    level: "intermediate",
    persist: false,
  });

  return { diagnosis, coach };
}

async function seedHipSlideDown() {
  const secret = createSecretSupabaseClient();

  const { data: metricRow } = await secret
    .from("metrics")
    .select("object_id")
    .eq("key", "hip_lateral_movement")
    .eq("status", "published")
    .maybeSingle();

  if (!metricRow?.object_id) {
    throw new Error("hip_lateral_movement metric not seeded");
  }

  const faultObjectId = "40000000-0000-4000-8000-000000000001";
  const bandObjectId = "40000000-0000-4000-8000-000000000002";
  const voiceObjectId = "40000000-0000-4000-8000-000000000003";
  const protocolObjectId = "40000000-0000-4000-8000-000000000004";

  async function publish(
    table: string,
    objectId: string,
    row: Record<string, unknown>,
  ) {
    await secret.from(table).update({ status: "draft" }).eq("object_id", objectId);
    const { data: existing } = await secret
      .from(table)
      .select("version")
      .eq("object_id", objectId)
      .order("version", { ascending: false })
      .limit(1);
    const version = ((existing?.[0]?.version as number) ?? 0) + 1;
    const { error } = await secret.from(table).insert({
      object_id: objectId,
      version,
      status: "published",
      created_by_email: "phase2-test",
      ...row,
    });
    if (error) {
      throw new Error(`${table} insert: ${error.message}`);
    }
  }

  await publish("faults", faultObjectId, {
    key: "hip_slide_down",
    name: "Hip slide toward target",
    family: "hip_lateral",
    tier: "downswing",
    severity_weight: 1,
    causal_leverage: 1,
    changeability: 1,
    metric_rules: {
      primary_metric: "hip_slide_down",
      metrics: [
        {
          engine_key: "hip_slide_down",
          catalog_key: "hip_lateral_movement",
          direction: "above",
          weight: 1,
        },
      ],
      requires_angle: "face_on",
    },
  });

  await publish("bands", bandObjectId, {
    metric_object_id: metricRow.object_id,
    club_family: "wedge",
    intent: "stock",
    functional_low: 0,
    functional_high: 5,
    tolerance_beginner: 1,
    tolerance_intermediate: 0.8,
    tolerance_advanced: 0.6,
  });

  await publish("voice", voiceObjectId, {
    fault_key: "hip_slide_down",
    feel_cue: "Bump without sliding toward the target",
    ball_flight_cost: "Thin contact and heel strikes",
    explanation:
      "Your hips slid toward the target before your hands caught up.",
    signed_by: "Phase 2 test pro",
  });

  await publish("protocols", protocolObjectId, {
    fault_key: "hip_slide_down",
    name: "Hip bump without slide",
    constraint_text: "Alignment stick outside trail foot",
    reps_slow: 3,
    reps_rehearsal: 1,
    reps_live: 1,
    ball: "none",
    progression: "",
    success_criterion: "Hips stay on address line at impact",
  });

  const { data: snapId, error: snapError } = await secret.rpc(
    "admin_snapshot_published",
    { p_created_by: null, p_created_by_email: "phase2-test" },
  );
  if (snapError) {
    throw new Error(`snapshot: ${snapError.message}`);
  }
  console.log("Published content version:", snapId);
}

async function runSeededTest(
  metrics: StoredSwingMetrics,
  phases: ReturnType<typeof phasesFromUnknown>,
) {
  const content = await loadPublishedCoachingContent();
  const evaluations = evaluateSwingMetrics({
    metrics,
    classification: "face_on",
    level: "intermediate",
    clubFamily: "wedge",
    bands: content.bands,
  });

  const diagnosis = diagnose({
    evaluations,
    phases,
    angle: "face_on",
    clubFamily: "wedge",
    handedness: "right",
    level: "intermediate",
    content,
  });

  const coach = await explainDiagnosis({
    diagnosis,
    content,
    level: "intermediate",
    isFirstResult: true,
    persist: true,
  });

  let coachCallRow = null;
  if (coach.coachCallId) {
    const secret = createSecretSupabaseClient();
    const { data } = await secret
      .from("coach_calls")
      .select("id, cost_usd, validation_result, output")
      .eq("id", coach.coachCallId)
      .maybeSingle();
    coachCallRow = data;
  }

  return { diagnosis, coach, coachCallRow, contentVersionId: content.contentVersionId };
}

async function main() {
  const g01 = await loadG01();
  const metrics = g01.keypoints!.metrics as StoredSwingMetrics;
  const phases = phasesFromUnknown(g01.keypoints!.phases);

  console.log("=== TEST 1: Empty tables (G01) ===");
  const empty = await runEmptyTablesTest(metrics, phases);
  console.log("Diagnosis:", JSON.stringify(empty.diagnosis, null, 2));
  console.log("Coach skipped:", empty.coach.skipped, empty.coach.skipReason);
  console.log("Coach output:", JSON.stringify(empty.coach.output, null, 2));

  console.log("\n=== Seeding hip_slide_down fault ===");
  await seedHipSlideDown();

  console.log("\n=== TEST 2: Seeded hip_slide_down (G01) ===");
  const seeded = await runSeededTest(metrics, phases);
  console.log("Diagnosis:", JSON.stringify(seeded.diagnosis, null, 2));
  console.log("Coach output:", JSON.stringify(seeded.coach.output, null, 2));
  console.log("Coach call row:", JSON.stringify(seeded.coachCallRow, null, 2));
  console.log("Cost USD:", seeded.coach.costUsd);
  console.log("Content version:", seeded.contentVersionId);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
