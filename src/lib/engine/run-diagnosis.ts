import type { ClubFamily, Handedness, ShotIntent } from "@/lib/admin/test-swings";
import { explainDiagnosis } from "@/lib/coach/explain";
import { loadPublishedCoachingContent } from "@/lib/engine/content";
import { diagnose, type DiagnosisResult, type PriorDiagnosis } from "@/lib/engine/diagnose";
import { evaluateSwingMetrics } from "@/lib/engine/evaluate";
import type { StoredSwingMetrics } from "@/lib/engine/metrics/storage";
import type { SkillLevel } from "@/lib/engine/bands";
import type { SwingPhases } from "@/lib/engine/phases";
import {
  baselineSnapshotFromSwingMetrics,
  whatChangedSinceDisplay,
} from "@/lib/reveal/baseline-comparison";
import type { WhatChangedSinceDisplay } from "@/lib/reveal/types";
import { createSecretSupabaseClient } from "@/lib/supabase/admin";

export type RunDiagnosisInput = {
  metrics: StoredSwingMetrics | null;
  phases: SwingPhases;
  angle: "dtl" | "face_on";
  clubFamily: ClubFamily;
  intent?: ShotIntent | null;
  handedness: Handedness;
  level?: SkillLevel;
  statedSymptom?: string | null;
  mode?: "diagnose" | "retest";
  priorDiagnosis?: PriorDiagnosis | null;
  contentVersionId?: string | null;
  declaredFade?: boolean;
  reportedSliceBlockShank?: boolean;
  callCoach?: boolean;
  isFirstResult?: boolean;
  persist?: boolean;
  golferId?: string;
  storageRef?: string | null;
  capturePath?: "in_app" | "native_slomo" | "upload" | null;
  keypoints?: unknown;
  ball?: import("@/lib/engine/ball").BallAnalysis | null;
  strike?: import("@/lib/engine/strike").StrikeAnalysis | null;
  shotRecord?: import("@/lib/engine/ball").ShotRecordOutcome | null;
  strikeFeatures?: import("@/lib/engine/strike").StrikeFeatures | null;
};

export type RunDiagnosisResult = {
  diagnosis: DiagnosisResult;
  evaluations: ReturnType<typeof evaluateSwingMetrics>;
  contentVersionId: string | null;
  coachOutput: Awaited<ReturnType<typeof explainDiagnosis>> | null;
  swingId: string | null;
  diagnosisId: string | null;
  whatChangedSince?: WhatChangedSinceDisplay;
  isFirstResult: boolean;
};

async function resolveIsFirstResult(golferId: string | undefined): Promise<boolean> {
  if (!golferId) {
    return true;
  }
  const secret = createSecretSupabaseClient();
  const { count } = await secret
    .from("swings")
    .select("id", { count: "exact", head: true })
    .eq("golfer_id", golferId);
  return (count ?? 0) === 0;
}

async function loadBaselineForComparison(input: {
  golferId: string;
  clubFamily: ClubFamily;
  angle: "dtl" | "face_on";
  intent: ShotIntent;
  level: SkillLevel;
  bands: Awaited<ReturnType<typeof loadPublishedCoachingContent>>["bands"];
}) {
  const secret = createSecretSupabaseClient();
  const { data: baselineRow } = await secret
    .from("baselines")
    .select("swing_id, saved_at, club_family, angle, intent")
    .eq("golfer_id", input.golferId)
    .eq("club_family", input.clubFamily)
    .eq("angle", input.angle)
    .eq("intent", input.intent)
    .maybeSingle();

  if (!baselineRow?.swing_id) {
    return null;
  }

  const { data: swing } = await secret
    .from("swings")
    .select("metrics")
    .eq("id", baselineRow.swing_id)
    .maybeSingle();

  if (!swing?.metrics) {
    return null;
  }

  const baselineEvaluations = evaluateSwingMetrics({
    metrics: swing.metrics as StoredSwingMetrics,
    classification: input.angle,
    level: input.level,
    clubFamily: input.clubFamily,
    intent: input.intent,
    bands: input.bands,
  });

  return baselineSnapshotFromSwingMetrics({
    evaluations: baselineEvaluations,
    clubFamily: baselineRow.club_family as string,
    angle: baselineRow.angle as string,
    intent: baselineRow.intent as string,
    savedAt: baselineRow.saved_at as string,
  });
}

export async function runDiagnosisPipeline(
  input: RunDiagnosisInput,
): Promise<RunDiagnosisResult> {
  const content = await loadPublishedCoachingContent(input.contentVersionId);
  const level = input.level ?? "intermediate";
  const intent = input.intent ?? "stock";
  const isFirstResult =
    input.isFirstResult ?? (await resolveIsFirstResult(input.golferId));

  const evaluations = evaluateSwingMetrics({
    metrics: input.metrics,
    classification: input.angle,
    level,
    clubFamily: input.clubFamily,
    intent,
    bands: content.bands,
  });

  const diagnosis = diagnose({
    evaluations,
    phases: input.phases,
    angle: input.angle,
    clubFamily: input.clubFamily,
    intent,
    handedness: input.handedness,
    level,
    statedSymptom: input.statedSymptom,
    priorDiagnosis: input.priorDiagnosis,
    mode: input.mode,
    content,
    declaredFade: input.declaredFade,
    reportedSliceBlockShank: input.reportedSliceBlockShank,
    ball: input.ball,
    strike: input.strike,
  });

  let swingId: string | null = null;
  let diagnosisId: string | null = null;
  let coachOutput: Awaited<ReturnType<typeof explainDiagnosis>> | null = null;

  if (input.persist !== false && input.golferId) {
    const secret = createSecretSupabaseClient();
    const { data: swing, error: swingError } = await secret
      .from("swings")
      .insert({
        golfer_id: input.golferId,
        storage_ref: input.storageRef ?? null,
        phases: input.phases,
        angle: input.angle,
        metrics: input.metrics,
        content_version_id: content.contentVersionId,
        capture_path: input.capturePath ?? "upload",
        club_family: input.clubFamily,
        intent,
        handedness: input.handedness,
        level,
        stated_symptom: input.statedSymptom ?? null,
        keypoints: input.keypoints ?? null,
        strike_features: input.strikeFeatures ?? null,
        shot_record: input.shotRecord ?? null,
      })
      .select("id")
      .single();
    if (!swingError && swing) {
      swingId = swing.id as string;
    }

    if (swingId) {
      const { data: dx } = await secret
        .from("diagnoses")
        .insert({
          swing_id: swingId,
          outcome: diagnosis.outcome,
          headline_fault: diagnosis.headline_fault,
          fault_key: diagnosis.fault_key,
          family: diagnosis.family,
          evidence: diagnosis.evidence,
          protocol_id: diagnosis.protocol_id,
          mode: diagnosis.mode,
          coach_output: null,
          score_internal: diagnosis.score_internal,
          reasons: diagnosis.reasons,
          first_guilty_frame: diagnosis.first_guilty_frame,
          delta_pct_stance: diagnosis.delta_pct_stance,
        })
        .select("id")
        .single();
      diagnosisId = (dx?.id as string) ?? null;
    }
  }

  if (input.callCoach !== false && diagnosis.outcome === "fault") {
    coachOutput = await explainDiagnosis({
      diagnosis,
      content,
      level,
      symptom: input.statedSymptom,
      isFirstResult,
      diagnosisId,
      persist: input.persist,
    });

    if (input.persist !== false && diagnosisId && coachOutput.output) {
      const secret = createSecretSupabaseClient();
      await secret
        .from("diagnoses")
        .update({ coach_output: coachOutput.output })
        .eq("id", diagnosisId);
    }
  }

  let whatChangedSince: WhatChangedSinceDisplay | undefined;
  if (input.golferId) {
    const baseline = await loadBaselineForComparison({
      golferId: input.golferId,
      clubFamily: input.clubFamily,
      angle: input.angle,
      intent,
      level,
      bands: content.bands,
    });
    whatChangedSince = whatChangedSinceDisplay({
      evaluations,
      baseline,
      angle: input.angle,
      clubFamily: input.clubFamily,
      intent,
      diagnosisOrder: diagnosis.evidence.map((e) => e.metric),
    });
  }

  return {
    diagnosis,
    evaluations,
    contentVersionId: content.contentVersionId,
    coachOutput,
    swingId,
    diagnosisId,
    whatChangedSince,
    isFirstResult,
  };
}
