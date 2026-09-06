import { NextResponse } from "next/server";
import { jsonError, requireAdminApi } from "@/lib/admin/api";
import { createSecretSupabaseClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi();
  if (!auth.ok) {
    return auth.response;
  }

  const { id: swingId } = await context.params;
  let body: {
    ball_labels?: Record<string, unknown>;
    keypoint_id?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("Expected JSON body.");
  }

  const secret = createSecretSupabaseClient();
  let keypointId = body.keypoint_id;
  if (!keypointId) {
    const { data: latest } = await secret
      .from("test_swing_keypoints")
      .select("id")
      .eq("test_swing_id", swingId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    keypointId = latest?.id as string | undefined;
  }
  if (!keypointId) {
    return jsonError("No keypoints row for this swing.", 404);
  }

  const { data, error } = await secret
    .from("test_swing_keypoints")
    .update({ ball_labels: body.ball_labels ?? {} })
    .eq("id", keypointId)
    .select("*")
    .single();

  if (error) {
    return jsonError(error.message, 500);
  }

  return NextResponse.json({ keypoints: data });
}
