import { NextResponse } from "next/server";
import { jsonError, requireAdminApi } from "@/lib/admin/api";
import { createSecretSupabaseClient } from "@/lib/supabase/admin";

const STRIKE_LABELS = ["center", "heel", "toe", "thin", "fat"] as const;

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
    strike_label?: string | null;
    keypoint_id?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("Expected JSON body.");
  }

  const label = body.strike_label;
  if (label && !STRIKE_LABELS.includes(label as (typeof STRIKE_LABELS)[number])) {
    return jsonError("strike_label must be center, heel, toe, thin, or fat.");
  }

  const secret = createSecretSupabaseClient();
  const { data: swing } = await secret
    .from("test_swings")
    .select("capture_path, club_family")
    .eq("id", swingId)
    .maybeSingle();

  if (!swing?.capture_path || !swing?.club_family) {
    return jsonError(
      "capture_path and club_family required before strike label counts.",
      400,
    );
  }

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
    .update({ strike_label: label ?? null })
    .eq("id", keypointId)
    .select("*")
    .single();

  if (error) {
    return jsonError(error.message, 500);
  }

  return NextResponse.json({ keypoints: data });
}
