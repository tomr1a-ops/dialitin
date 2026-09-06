import type { ClubFamily, Handedness, ShotIntent } from "@/lib/admin/test-swings";
import { explainDiagnosis } from "@/lib/coach/explain";
import { loadPublishedCoachingContent } from "@/lib/engine/content";
import { diagnose, type DiagnosisResult, type PriorDiagnosis } from "@/lib/engine/diagnose";
import { evaluateSwingMetrics } from "@/lib/engine/evaluate";
import type { StoredSwingMetrics } from "@/lib/engine/metrics/storage";
import type { SkillLevel } from "@/lib/engine/bands";
import type { SwingPhases } from "@/lib/engine/phases";
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
};

export type RunDiagnosisResult = {
  diagnosis: DiagnosisResult;
  evaluations: ReturnType<typeof evaluateSwingMetrics>;
  contentVersionId: string | null;
  coachOutput: Awaited<ReturnType<typeof explainDiagnosis>> | null;
  swingId: string | null;
  diagnosisId: string | null;
};

export async function runDiagnosisPipeline(
  input: RunDiagnosisInput,
): Promise<RunDiagnosisResult> {
  const content = await loadPublishedCoachingContent(input.contentVersionId);
  const level = input.level ?? "intermediate";

  const evaluations = evaluateSwingMetrics({
    metrics: input.metrics,
    classification: input.angle,
    level,
    clubFamily: input.clubFamily,
    intent: input.intent,
    bands: content.bands,
  });

  const diagnosis = diagnose({
    evaluations,
    phases: input.phases,
    angle: input.angle,
    clubFamily: input.clubFamily,
    intent: input.intent,
    handedness: input.handedness,
    level,
    statedSymptom: input.statedSymptom,
    priorDiagnosis: input.priorDiagnosis,
    mode: input.mode,
    content,
    declaredFade: input.declaredFade,
    reportedSliceBlockShank: input.reportedSliceBlockShank,
  });

  let swingId: string | null = null;
  let diagnosisId: string | null = null;

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
        intent: input.intent ?? "stock",
        handedness: input.handedness,
        level,
        stated_symptom: input.statedSymptom ?? null,
        keypoints: input.keypoints ?? null,
      })
      .select("id")
      .single();
    if (!swingError && swing) {
      swingId = swing.id as string;
    }
  }

  let coachOutput: Awaited<ReturnType<typeof explainDiagnosis>> | null = null;

  if (input.callCoach !== false && diagnosis.outcome === "fault") {
    coachOutput = await explainDiagnosis({
      diagnosis,
      content,
      level,
      symptom: input.statedSymptom,
      isFirstResult: input.isFirstResult,
      diagnosisId,
      persist: input.persist,
    });

    if (input.persist !== false && swingId) {
      const secret = createSecretSupabaseClient();
      const { data: dx, error } = await secret
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
          coach_output: coachOutput.output,
          score_internal: diagnosis.score_internal,
          reasons: diagnosis.reasons,
          first_guilty_frame: diagnosis.first_guilty_frame,
          delta_pct_stance: diagnosis.delta_pct_stance,
        })
        .select("id")
        .single();
      if (!error && dx) {
        diagnosisId = dx.id as string;
      }
    }
  } else if (input.persist !== false && swingId) {
    const secret = createSecretSupabaseClient();
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

  return {
    diagnosis,
    evaluations,
    contentVersionId: content.contentVersionId,
    coachOutput,
    swingId,
    diagnosisId,
  };
}
