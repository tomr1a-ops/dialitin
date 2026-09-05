import { listTestSwings } from "@/lib/admin/queries";
import { createPlaceholderRevealInput } from "@/lib/reveal/placeholder";
import type { RevealSession } from "@/lib/reveal/types";

/** Loads G01 test swing for admin demo — DTL preferred. */
export async function getG01DemoSession(): Promise<RevealSession | null> {
  const swings = await listTestSwings();
  const g01 =
    swings.find(
      (swing) =>
        swing.golfer_label === "G01" &&
        swing.keypoints?.keypoints?.length &&
        swing.signed_url &&
        swing.angle === "dtl",
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

  const angle = g01.angle === "face_on" ? "face_on" : "dtl";
  return {
    videoSrc: g01.signed_url,
    keypoints: g01.keypoints.keypoints,
    phases: g01.keypoints.phases,
    handedness: g01.handedness === "left" ? "left" : "right",
    angle,
    input: createPlaceholderRevealInput(),
  };
}
