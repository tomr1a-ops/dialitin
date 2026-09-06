import { NextResponse } from "next/server";
import { jsonError, requireAdminApi } from "@/lib/admin/api";
import { POSE_MODEL_VERSION } from "@/lib/pose/joints";
import { jointCoverage, framesFromStoredKeypoints } from "@/lib/preview/coverage";
import { createSecretSupabaseClient } from "@/lib/supabase/admin";
import { runHarvestPipeline } from "@/lib/harvest/pipeline";
import type { HarvestTier } from "@/lib/harvest/constants";
import type { Handedness } from "@/lib/admin/test-swings";
import type { PoseFrame } from "@/lib/pose/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type PipelineBody = {
  frames?: PoseFrame[];
  frame_rate_detected?: number;
  handedness?: Handedness;
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
  let body: PipelineBody;
  try {
    body = (await request.json()) as PipelineBody;
  } catch {
    return jsonError("Expected JSON body.");
  }

  const frames = framesFromStoredKeypoints(body.frames ?? []);
  const frameRate = Number(body.frame_rate_detected);
  if (frames.length === 0 || !Number.isFinite(frameRate) || frameRate <= 0) {
    return jsonError("frames and frame_rate_detected are required.");
  }

  const secret = createSecretSupabaseClient();
  const { data: swing, error: swingError } = await secret
    .from("test_swings")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (swingError || !swing) {
    return jsonError(swingError?.message ?? "Swing not found.", 404);
  }

  const pipeline = runHarvestPipeline({
    swingId: id,
    title: swing.golfer_label ?? swing.source_url ?? id,
    tier: (swing.tier as HarvestTier | null) ?? null,
    storagePath: swing.storage_path,
    handedness: body.handedness ?? (swing.handedness as Handedness) ?? "right",
    frames,
    frameRateDetected: frameRate,
  });

  const { data: keypoints, error: kpError } = await secret
    .from("test_swing_keypoints")
    .insert({
      test_swing_id: id,
      model_version: POSE_MODEL_VERSION,
      frame_rate_detected: frameRate,
      keypoints: frames,
      coverage: jointCoverage(frames),
      phases: pipeline.phases,
      angle: pipeline.angle,
      normalized_keypoints: pipeline.normalizedFrames,
      metrics: pipeline.metrics,
    })
    .select("id")
    .single();
  if (kpError || !keypoints) {
    return jsonError(kpError?.message ?? "Could not save keypoints.", 500);
  }

  await secret
    .from("test_swings")
    .update(pipeline.updates)
    .eq("id", id);

  const childIds: string[] = [];
  if (pipeline.childSegments.length > 1) {
    for (const [index, segment] of pipeline.childSegments.entries()) {
      const childFrames = frames.slice(
        segment.startFrameIndex,
        segment.endFrameIndex + 1,
      );
      const childPipeline = runHarvestPipeline({
        swingId: id,
        title: `${swing.golfer_label ?? "clip"} · swing ${index + 1}`,
        tier: (swing.tier as HarvestTier | null) ?? null,
        storagePath: swing.storage_path,
        handedness: body.handedness ?? "right",
        frames: childFrames,
        frameRateDetected: frameRate,
        parentId: id,
        segment,
      });
      const { data: child, error: childError } = await secret
        .from("test_swings")
        .insert({
          storage_path: swing.storage_path,
          parent_id: id,
          created_by: auth.session.userId,
          created_by_email: auth.session.email,
          source_url: swing.source_url,
          channel: swing.channel,
          license_note: swing.license_note,
          tier: swing.tier,
          golfer_label: `${swing.golfer_label ?? "clip"} · swing ${index + 1}`,
          club_family: childPipeline.clubFamily,
          intent: "stock",
          capture_path: "native_slomo",
          handedness: body.handedness ?? "right",
          segment_start_ms: segment.startMs,
          segment_end_ms: segment.endMs,
          excluded: childPipeline.excluded,
          exclude_reason: childPipeline.excludeReason,
          pro_label_fault_1: childPipeline.proLabelFault1,
          label_status: childPipeline.labelStatus,
        })
        .select("id")
        .single();
      if (childError || !child) {
        continue;
      }
      childIds.push(child.id);
      await secret.from("test_swing_keypoints").insert({
        test_swing_id: child.id,
        model_version: POSE_MODEL_VERSION,
        frame_rate_detected: frameRate,
        keypoints: childFrames.map((frame, frameIndex) => ({
          ...frame,
          frameIndex,
        })),
        coverage: jointCoverage(childFrames),
        phases: childPipeline.phases,
        angle: childPipeline.angle,
        normalized_keypoints: childPipeline.normalizedFrames,
        metrics: childPipeline.metrics,
      });
    }
  }

  return NextResponse.json({
    swingId: id,
    excluded: pipeline.excluded,
    excludeReason: pipeline.excludeReason,
    passedGate: !pipeline.excluded,
    childSwingIds: childIds,
    splitCount: childIds.length,
  });
}
