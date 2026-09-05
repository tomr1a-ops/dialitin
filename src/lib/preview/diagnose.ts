import type { PoseFrame } from "@/lib/pose/types";

export const DRAFT_CONTENT_VERSION_ID = "draft";

export type Diagnosis = {
  headline: string;
  faultKey: string | null;
} | null;

/**
 * TODO(Phase 1): run the coaching engine against keypoints + a content version.
 * /admin/preview already calls this twice (draft catalog vs published snapshot).
 * Swapping this stub for the real engine is the only function change needed
 * for that screen to show which swings change headline.
 */
export function diagnose(
  keypoints: PoseFrame[],
  contentVersionId: string,
): Diagnosis {
  // STUB — Phase 1 replaces this function body only.
  void keypoints;
  void contentVersionId;
  return null;
}
