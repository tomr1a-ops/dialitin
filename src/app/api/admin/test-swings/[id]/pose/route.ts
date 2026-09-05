import { NextResponse } from "next/server";
import { jsonError, requireAdminApi } from "@/lib/admin/api";
import { angleFromUnknown } from "@/lib/engine/angle";
import { computeFaceOnMetrics } from "@/lib/engine/metrics/faceOn";
import { phasesFromUnknown, type SwingPhases } from "@/lib/engine/phases";
import { POSE_MODEL_VERSION } from "@/lib/pose/joints";
import {
  framesFromStoredKeypoints,
  jointCoverage,
} from "@/lib/preview/coverage";
import { createSecretSupabaseClient } from "@/lib/supabase/admin";
import type { ClubFamily, Handedness, ShotIntent } from "@/lib/admin/test-swings";
import type { PoseFrame } from "@/lib/pose/types";

export const dynamic = "force-dynamic";

type PoseBody = {
  frames?: PoseFrame[];
  frame_rate_detected?: number;
  model_version?: string;
  phases?: SwingPhases;
  angle?: unknown;
  normalized_keypoints?: PoseFrame[] | null;
  orientation?: unknown;
  metrics?: ReturnType<typeof computeFaceOnMetrics>;
  handedness?: Handedness;
  club_family?: ClubFamily | null;
  intent?: ShotIntent | null;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi();
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await context.params;
  let body: PoseBody;
  try {
    body = (await request.json()) as PoseBody;
  } catch {
    return jsonError("Expected JSON body.");
  }

  const frames = framesFromStoredKeypoints(body.frames ?? []);
  const frameRate = Number(body.frame_rate_detected);
  if (!Number.isFinite(frameRate) || frameRate <= 0) {
    return jsonError("frame_rate_detected is required.");
  }

  const phases = phasesFromUnknown(body.phases);
  const angle = angleFromUnknown(body.angle);
  const metrics =
    body.metrics ??
    (phases && angle
      ? computeFaceOnMetrics({
          frames,
          normalizedFrames: body.normalized_keypoints ?? null,
          phases,
          angle,
          handedness: body.handedness === "left" ? "left" : "right",
          clubFamily: body.club_family,
          intent: body.intent,
        })
      : null);

  const secret = createSecretSupabaseClient();
  const { data, error } = await secret
    .from("test_swing_keypoints")
    .insert({
      test_swing_id: id,
      model_version: body.model_version || POSE_MODEL_VERSION,
      frame_rate_detected: frameRate,
      keypoints: frames,
      coverage: jointCoverage(frames),
      phases,
      angle,
      normalized_keypoints: body.normalized_keypoints ?? null,
      orientation: body.orientation ?? null,
      metrics,
    })
    .select("*")
    .single();
  if (error || !data) {
    return jsonError(error?.message ?? "Could not save keypoints.", 500);
  }

  return NextResponse.json({ keypoints: data });
}
