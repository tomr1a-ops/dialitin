import { loadPublishedCoachingContent } from "@/lib/engine/content";
import { diagnose, type DiagnosisResult } from "@/lib/engine/diagnose";
import { evaluateSwingMetrics } from "@/lib/engine/evaluate";
import type { TestSwingListItem } from "@/lib/admin/test-swings";
import { phasesFromUnknown } from "@/lib/engine/phases";
import type { StoredSwingMetrics } from "@/lib/engine/metrics/storage";

export async function computeSwingDiagnosis(
  swing: TestSwingListItem | null,
): Promise<DiagnosisResult | null> {
  if (!swing?.keypoints?.phases) {
    return null;
  }

  const angleClass =
    swing.keypoints.angle?.classification?.value ??
    (swing.angle === "face_on" ? "face_on" : "dtl");
  const angle = angleClass === "face_on" ? "face_on" : "dtl";
  const metrics = (swing.keypoints.metrics ?? null) as StoredSwingMetrics | null;
  const content = await loadPublishedCoachingContent();
  const evaluations = evaluateSwingMetrics({
    metrics,
    classification: angle,
    level: "intermediate",
    clubFamily: swing.club_family ?? "short_iron",
    bands: content.bands,
  });

  const phases = phasesFromUnknown(swing.keypoints.phases);
  if (!phases) {
    return null;
  }

  return diagnose({
    evaluations,
    phases,
    angle,
    clubFamily: swing.club_family ?? "short_iron",
    handedness: swing.handedness === "left" ? "left" : "right",
    level: "intermediate",
    content,
  });
}
