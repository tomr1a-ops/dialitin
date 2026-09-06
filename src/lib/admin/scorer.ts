import {
  loadPublishedBandsSnapshot,
  type BandsTable,
} from "@/lib/engine/bands";
import {
  comparePhaseMark,
  evaluateSwingMetrics,
  type MetricEvaluation,
  type PhaseName,
} from "@/lib/engine/evaluate";
import { estimateCameraAngle } from "@/lib/engine/angle";
import { labeledAngleMismatch } from "@/lib/engine/angle";
import { computeSwingMetrics } from "@/lib/engine/metrics/storage";
import { findSwingPhases, phasesFromUnknown } from "@/lib/engine/phases";
import type {
  ClubFamily,
  Handedness,
  TestSwingKeypointsRow,
  TestSwingRow,
} from "@/lib/admin/test-swings";
import { createSecretSupabaseClient } from "@/lib/supabase/admin";
import { framesFromStoredKeypoints } from "@/lib/preview/coverage";

export type GroundTruthPhaseMarks = Partial<Record<PhaseName, number>>;

export type ScorerClipRow = {
  clipId: string;
  label: string;
  labeledAngle: string | null;
  detectedAngle: string | null;
  angleMismatch: boolean;
  phases: Record<
    PhaseName,
    ReturnType<typeof comparePhaseMark>
  >;
  metrics: Record<string, MetricEvaluation>;
  allPhasesPass: boolean | null;
};

export type ScorerSummary = {
  clipsTotal: number;
  clipsAllPhasesCorrect: number;
  metricsEvaluated: number;
  metricsWithinTolerance: number;
  angleMismatches: number;
  contentVersionId: string | null;
  engineGitSha: string;
};

export type ScorerRunResult = {
  rows: ScorerClipRow[];
  summary: ScorerSummary;
};

const PHASE_NAMES: PhaseName[] = [
  "address",
  "takeaway",
  "top",
  "impact",
  "finish",
];

type LoadBandsResult = {
  contentVersionId: string | null;
  bands: BandsTable;
};

export async function loadPublishedBands(
  contentVersionId?: string | null,
): Promise<LoadBandsResult> {
  return loadPublishedBandsSnapshot(contentVersionId);
}

export function recomputeFromKeypoints(input: {
  swing: TestSwingRow;
  keypoints: PoseFrameBundle;
}): {
  phases: ReturnType<typeof findSwingPhases>;
  angle: ReturnType<typeof estimateCameraAngle>["angle"];
  normalizedFrames: ReturnType<typeof estimateCameraAngle>["normalizedFrames"];
  metrics: ReturnType<typeof computeSwingMetrics>;
} {
  const frames = input.keypoints.keypoints;
  const capturePath =
    input.swing.capture_path === "in_app"
      ? "in_app"
      : input.swing.capture_path === "native_slomo"
        ? "native_slomo"
        : "upload";

  const phases = findSwingPhases(frames, {
    handedness: input.swing.handedness === "left" ? "left" : "right",
    capturePath,
    labeledFrameRate: input.swing.frame_rate,
    fileName: input.swing.storage_path ?? undefined,
  });

  const angleResult = estimateCameraAngle({
    frames,
    phases,
    imageWidth: 1080,
    imageHeight: 1920,
    capturePath: input.swing.capture_path,
    verticalRoll: null,
    handedness: (input.swing.handedness === "left" ? "left" : "right") as Handedness,
  });

  const metrics = computeSwingMetrics({
    frames,
    normalizedFrames: angleResult.normalizedFrames,
    phases,
    angle: angleResult.angle,
    handedness: input.swing.handedness === "left" ? "left" : "right",
    clubFamily: input.swing.club_family,
    intent: input.swing.intent,
    capturePath: input.swing.capture_path,
  });

  return {
    phases,
    angle: angleResult.angle,
    normalizedFrames: angleResult.normalizedFrames,
    metrics,
  };
}

type PoseFrameBundle = Pick<
  TestSwingKeypointsRow,
  "keypoints" | "normalized_keypoints" | "phases" | "angle" | "metrics"
> & {
  phase_marks?: GroundTruthPhaseMarks | null;
  frame_rate_detected?: number;
};

export function scoreClip(input: {
  swing: TestSwingRow;
  keypoints: PoseFrameBundle;
  bands: BandsTable;
  level?: "beginner" | "intermediate" | "advanced";
}): ScorerClipRow {
  const level = input.level ?? "intermediate";
  const recomputed = recomputeFromKeypoints({
    swing: input.swing,
    keypoints: input.keypoints,
  });

  const phases = recomputed.phases;
  const angle = recomputed.angle;
  const metrics = recomputed.metrics;
  const frameRate =
    input.swing.frame_rate ??
    input.keypoints.frame_rate_detected ??
    phases.effectiveFrameRate.value ??
    30;

  const marks = input.keypoints.phase_marks ?? null;
  const phaseResults = {} as ScorerClipRow["phases"];
  let phasePassCount = 0;
  let phaseMarkedCount = 0;

  for (const name of PHASE_NAMES) {
    const mark = phases[name];
    const comparison = comparePhaseMark(
      mark.valid ? mark.frameIndex : null,
      marks?.[name] ?? null,
      mark.valid,
      frameRate,
    );
    phaseResults[name] = comparison;
    if (comparison.status !== "unmarked") {
      phaseMarkedCount += 1;
      if (comparison.status === "pass") {
        phasePassCount += 1;
      }
    }
  }

  const clubFamily = (input.swing.club_family ?? "short_iron") as ClubFamily;
  const metricEvals = evaluateSwingMetrics({
    metrics,
    classification: angle.classification.valid
      ? angle.classification.value
      : null,
    level,
    clubFamily,
    intent: input.swing.intent,
    bands: input.bands,
  });

  const allPhasesPass =
    phaseMarkedCount === 0
      ? null
      : phasePassCount === phaseMarkedCount && phaseMarkedCount === PHASE_NAMES.length;

  return {
    clipId: input.swing.id,
    label: input.swing.golfer_label ?? input.swing.storage_path,
    labeledAngle: input.swing.angle,
    detectedAngle: angle.classification.valid
      ? angle.classification.value
      : angle.classification.value,
    angleMismatch: labeledAngleMismatch(input.swing.angle, angle),
    phases: phaseResults,
    metrics: metricEvals,
    allPhasesPass,
  };
}

export function summarizeScorerRows(rows: ScorerClipRow[]): ScorerSummary {
  let clipsAllPhasesCorrect = 0;
  let metricsEvaluated = 0;
  let metricsWithinTolerance = 0;
  let angleMismatches = 0;

  for (const row of rows) {
    if (row.angleMismatch) {
      angleMismatches += 1;
    }
    if (row.allPhasesPass === true) {
      clipsAllPhasesCorrect += 1;
    }
    for (const evaluation of Object.values(row.metrics)) {
      if (
        evaluation.status === "pass" ||
        evaluation.status === "fail" ||
        evaluation.status === "no-band" ||
        evaluation.status === "not-read"
      ) {
        metricsEvaluated += 1;
        if (evaluation.status === "pass") {
          metricsWithinTolerance += 1;
        }
      }
    }
  }

  return {
    clipsTotal: rows.length,
    clipsAllPhasesCorrect,
    metricsEvaluated,
    metricsWithinTolerance,
    angleMismatches,
    contentVersionId: null,
    engineGitSha: "",
  };
}

export async function runScorer(options?: {
  contentVersionId?: string | null;
  engineGitSha?: string;
  persist?: boolean;
  level?: "beginner" | "intermediate" | "advanced";
}): Promise<ScorerRunResult> {
  const secret = createSecretSupabaseClient();
  const { contentVersionId, bands } = await loadPublishedBands(
    options?.contentVersionId,
  );

  const { data: swings, error: swingsError } = await secret
    .from("test_swings")
    .select("*")
    .order("created_at", { ascending: true });
  if (swingsError) {
    throw new Error(swingsError.message);
  }

  const rows: ScorerClipRow[] = [];
  for (const swing of (swings ?? []) as TestSwingRow[]) {
    if (swing.excluded) {
      continue;
    }
    if (swing.label_status === "suggested") {
      continue;
    }
    const { data: kpRows, error: kpError } = await secret
      .from("test_swing_keypoints")
      .select("*")
      .eq("test_swing_id", swing.id)
      .order("created_at", { ascending: false })
      .limit(1);
    if (kpError) {
      throw new Error(kpError.message);
    }
    const raw = kpRows?.[0];
    if (!raw) {
      continue;
    }

    const keypoints: PoseFrameBundle = {
      keypoints: framesFromStoredKeypoints(raw.keypoints),
      normalized_keypoints: raw.normalized_keypoints
        ? framesFromStoredKeypoints(raw.normalized_keypoints)
        : null,
      phases: phasesFromUnknown(raw.phases),
      angle: null,
      metrics: null,
      phase_marks: (raw.phase_marks ?? null) as GroundTruthPhaseMarks | null,
      frame_rate_detected: Number(raw.frame_rate_detected),
    };

    const scored = scoreClip({
      swing,
      keypoints,
      bands,
      level: options?.level,
    });
    rows.push(scored);

    if (options?.persist !== false) {
      const recomputed = recomputeFromKeypoints({ swing, keypoints });
      await secret
        .from("test_swing_keypoints")
        .update({
          phases: recomputed.phases,
          angle: recomputed.angle,
          normalized_keypoints: recomputed.normalizedFrames,
          metrics: recomputed.metrics,
        })
        .eq("id", raw.id);
    }
  }

  const summary = summarizeScorerRows(rows);
  summary.contentVersionId = contentVersionId;
  summary.engineGitSha =
    options?.engineGitSha ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "local";

  if (options?.persist !== false) {
    const { error: insertError } = await secret.from("scorer_runs").insert({
      engine_git_sha: summary.engineGitSha,
      content_version_id: contentVersionId,
      summary: {
        ...summary,
        rows: rows.map((row) => ({
          clipId: row.clipId,
          label: row.label,
          angleMismatch: row.angleMismatch,
          allPhasesPass: row.allPhasesPass,
          phases: row.phases,
          metrics: Object.fromEntries(
            Object.entries(row.metrics).map(([key, value]) => [
              key,
              { status: value.status, inBand: value.inBand, reason: value.reason },
            ]),
          ),
        })),
      },
    });
    if (insertError) {
      throw new Error(insertError.message);
    }
  }

  return { rows, summary };
}

export async function getLatestScorerRun() {
  const secret = createSecretSupabaseClient();
  const { data, error } = await secret
    .from("scorer_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return data;
}

export async function listContentVersionOptions() {
  const secret = createSecretSupabaseClient();
  const { data, error } = await secret
    .from("content_versions")
    .select("id, created_at, created_by_email")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) {
    throw new Error(error.message);
  }
  return data ?? [];
}
