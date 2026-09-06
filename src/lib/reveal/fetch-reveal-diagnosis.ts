import type { ClubFamily, Handedness } from "@/lib/admin/test-swings";
import type { CoachOutput } from "@/lib/coach/schema";
import type { IngestResult } from "@/lib/capture/types";
import type { DiagnosisResult } from "@/lib/engine/diagnose";
import { estimateCameraAngle } from "@/lib/engine/angle";
import { computeSwingMetrics } from "@/lib/engine/metrics/storage";
import { diagnosisToRevealInput } from "@/lib/reveal/map-diagnosis";
import type { RevealInput, WhatChangedSinceDisplay } from "@/lib/reveal/types";

export type FetchRevealDiagnosisResult = {
  input: RevealInput;
  diagnosisId: string | null;
  swingId: string | null;
  diagnosis: DiagnosisResult;
  angle: "dtl" | "face_on";
  isFirstResult: boolean;
  whatChangedSince?: WhatChangedSinceDisplay;
  coachCall?: {
    id: string | null;
    validation: { valid: boolean; errors: string[] };
    costUsd: number | null;
  } | null;
};

export async function fetchRevealDiagnosis(
  result: IngestResult,
  options: {
    clubFamily?: ClubFamily;
    handedness?: Handedness;
    persist?: boolean;
  } = {},
): Promise<FetchRevealDiagnosisResult> {
  const handedness = options.handedness ?? "right";
  const clubFamily = options.clubFamily ?? "wedge";

  const angleReport = estimateCameraAngle({
    frames: result.keypoints,
    phases: result.phases,
    imageWidth: result.resolution.width,
    imageHeight: result.resolution.height,
    capturePath: result.capturePath,
    orientationSamples: result.orientationSamples,
    handedness,
  });

  const classification = angleReport.angle.classification.value;
  const angle: "dtl" | "face_on" =
    classification === "face_on" ? "face_on" : "dtl";

  const capturePath =
    result.capturePath === "in-app" ? "in_app" : "upload";

  const metrics = computeSwingMetrics({
    frames: result.keypoints,
    normalizedFrames: angleReport.normalizedFrames,
    phases: result.phases,
    angle: angleReport.angle,
    handedness,
    clubFamily,
    capturePath,
  });

  const response = await fetch("/api/diagnose", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      metrics,
      phases: result.phases,
      angle,
      clubFamily,
      handedness,
      capturePath,
      keypoints: result.keypoints,
      callCoach: true,
      persist: options.persist ?? true,
    }),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? `Diagnosis failed (${response.status})`);
  }

  const payload = (await response.json()) as {
    diagnosis: DiagnosisResult;
    coachOutput?: {
      output: CoachOutput | null;
      coachCallId?: string | null;
      validation?: { valid: boolean; errors: string[] };
      costUsd?: number | null;
    } | null;
    diagnosisId?: string | null;
    swingId?: string | null;
    whatChangedSince?: WhatChangedSinceDisplay;
    isFirstResult?: boolean;
  };

  const coach = payload.coachOutput?.output ?? null;
  const input = diagnosisToRevealInput({
    diagnosis: payload.diagnosis,
    coach,
    angle,
    phases: result.phases,
    keypoints: result.keypoints,
    whatChangedSince: payload.whatChangedSince,
  });

  if (payload.diagnosisId) {
    input.diagnosisId = payload.diagnosisId;
  }
  if (payload.swingId) {
    input.swingId = payload.swingId;
  }

  return {
    input,
    diagnosisId: payload.diagnosisId ?? null,
    swingId: payload.swingId ?? null,
    diagnosis: payload.diagnosis,
    angle,
    isFirstResult: payload.isFirstResult ?? true,
    whatChangedSince: payload.whatChangedSince,
    coachCall: payload.coachOutput
      ? {
          id: payload.coachOutput.coachCallId ?? null,
          validation: payload.coachOutput.validation ?? {
            valid: true,
            errors: [],
          },
          costUsd: payload.coachOutput.costUsd ?? null,
        }
      : null,
  };
}
