import { listTestSwings } from "@/lib/admin/queries";
import { loadPublishedCoachingContent } from "@/lib/engine/content";
import { diagnose } from "@/lib/engine/diagnose";
import { evaluateSwingMetrics } from "@/lib/engine/evaluate";
import { explainDiagnosis } from "@/lib/coach/explain";
import { diagnosisToRevealInput } from "@/lib/reveal/map-diagnosis";
import type { RevealSession } from "@/lib/reveal/types";
import { phasesFromUnknown } from "@/lib/engine/phases";
import type { StoredSwingMetrics } from "@/lib/engine/metrics/storage";

/** Loads G01 test swing with real Phase 2 diagnosis. */
export async function getG01DemoSession(): Promise<RevealSession | null> {
  const swings = await listTestSwings();
  const g01 =
    swings.find(
      (swing) =>
        swing.golfer_label === "G01" &&
        swing.keypoints?.keypoints?.length &&
        swing.signed_url &&
        swing.angle === "face_on",
    ) ??
    swings.find(
      (swing) =>
        swing.golfer_label === "G01" &&
        swing.keypoints?.keypoints?.length &&
        swing.signed_url,
    );

  if (!g01?.signed_url || !g01.keypoints?.keypoints || !g01.keypoints.phases) {
    return null;
  }

  const classification =
    g01.keypoints.angle?.classification?.value ??
    (g01.angle === "face_on" ? "face_on" : "dtl");
  const angle = classification === "face_on" ? "face_on" : "dtl";
  const phases = phasesFromUnknown(g01.keypoints.phases);
  if (!phases) {
    return null;
  }
  const metrics = (g01.keypoints.metrics ?? null) as StoredSwingMetrics | null;
  const clubFamily = g01.club_family ?? "wedge";

  const content = await loadPublishedCoachingContent();
  const evaluations = evaluateSwingMetrics({
    metrics,
    classification: angle,
    level: "intermediate",
    clubFamily,
    bands: content.bands,
  });

  const diagnosis = diagnose({
    evaluations,
    phases,
    angle,
    clubFamily,
    handedness: g01.handedness === "left" ? "left" : "right",
    level: "intermediate",
    content,
  });

  const coach =
    diagnosis.outcome === "fault"
      ? await explainDiagnosis({
          diagnosis,
          content,
          level: "intermediate",
          isFirstResult: true,
          persist: false,
        })
      : null;

  const impactMs = phases.impact.valid ? phases.impact.timeMs : 180;
  const revealInput = diagnosisToRevealInput({
    diagnosis,
    coach: coach?.output ?? null,
    angle,
    firstGuiltyFrameMs: impactMs,
  });

  return {
    videoSrc: g01.signed_url,
    keypoints: g01.keypoints.keypoints,
    phases,
    handedness: g01.handedness === "left" ? "left" : "right",
    angle,
    input: revealInput,
  };
}

export async function getG01DiagnosisDebug() {
  const session = await getG01DemoSession();
  return session?.input;
}
