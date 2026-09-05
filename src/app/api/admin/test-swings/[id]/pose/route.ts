import { NextResponse } from "next/server";
import { jsonError, requireAdminApi } from "@/lib/admin/api";
import { POSE_MODEL_VERSION } from "@/lib/pose/joints";
import {
  framesFromStoredKeypoints,
  jointCoverage,
} from "@/lib/preview/coverage";
import { createSecretSupabaseClient } from "@/lib/supabase/admin";
import type { PoseFrame } from "@/lib/pose/types";

export const dynamic = "force-dynamic";

type PoseBody = {
  frames?: PoseFrame[];
  frame_rate_detected?: number;
  model_version?: string;
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

  const secret = createSecretSupabaseClient();
  const { data, error } = await secret
    .from("test_swing_keypoints")
    .insert({
      test_swing_id: id,
      model_version: body.model_version || POSE_MODEL_VERSION,
      frame_rate_detected: frameRate,
      keypoints: frames,
      coverage: jointCoverage(frames),
    })
    .select("*")
    .single();
  if (error || !data) {
    return jsonError(error?.message ?? "Could not save keypoints.", 500);
  }

  return NextResponse.json({ keypoints: data });
}
