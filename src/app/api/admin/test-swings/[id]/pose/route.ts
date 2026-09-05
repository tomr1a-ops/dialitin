import { NextResponse } from "next/server";
import { jsonError, requireAdminApi } from "@/lib/admin/api";
import { createSecretSupabaseClient } from "@/lib/supabase/admin";
import { keypointCoveragePct, poseBackendToPath } from "@/lib/preview/coverage";
import type { PoseFrame } from "@/lib/pose/types";

export const dynamic = "force-dynamic";

type PoseBody = {
  frames?: Array<{
    frame_index?: number;
    media_time?: number;
    landmarks?: PoseFrame["landmarks"];
    crop_box?: PoseFrame["crop"];
  }>;
  pose_backend?: "worker" | "main-thread" | "unavailable";
  seconds_to_process?: number;
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

  const frames = Array.isArray(body.frames) ? body.frames : [];
  const poseFrames: PoseFrame[] = [];
  const rows = frames.map((frame, index) => {
    const landmarks = Array.isArray(frame.landmarks) ? frame.landmarks : [];
    const crop = frame.crop_box ?? { x: 0, y: 0, width: 0, height: 0 };
    const mediaTime = Number(frame.media_time ?? 0);
    poseFrames.push({ mediaTime, landmarks, crop });
    return {
      test_swing_id: id,
      frame_index: Number.isInteger(frame.frame_index)
        ? Number(frame.frame_index)
        : index,
      media_time: mediaTime,
      landmarks,
      crop_box: crop,
    };
  });

  const posePath = poseBackendToPath(body.pose_backend ?? "unavailable");
  if (!posePath) {
    return jsonError("pose_backend must be worker or main-thread.");
  }

  const seconds = Number(body.seconds_to_process);
  if (!Number.isFinite(seconds) || seconds < 0) {
    return jsonError("seconds_to_process is required.");
  }

  const secret = createSecretSupabaseClient();
  const { error: deleteError } = await secret
    .from("test_swing_keypoints")
    .delete()
    .eq("test_swing_id", id);
  if (deleteError) {
    return jsonError(deleteError.message, 500);
  }

  if (rows.length > 0) {
    const { error: insertError } = await secret
      .from("test_swing_keypoints")
      .insert(rows);
    if (insertError) {
      return jsonError(insertError.message, 500);
    }
  }

  const run = {
    test_swing_id: id,
    frames_processed: rows.length,
    coverage_pct: Number(keypointCoveragePct(poseFrames).toFixed(2)),
    pose_path: posePath,
    seconds_to_process: Number(seconds.toFixed(3)),
  };

  const { data, error: runError } = await secret
    .from("test_swing_pose_runs")
    .upsert(run, { onConflict: "test_swing_id" })
    .select("*")
    .single();
  if (runError || !data) {
    return jsonError(runError?.message ?? "Could not save pose run.", 500);
  }

  return NextResponse.json({ run: data });
}
