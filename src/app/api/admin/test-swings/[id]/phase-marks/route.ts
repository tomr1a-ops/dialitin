import { NextResponse } from "next/server";
import { jsonError, requireAdminApi } from "@/lib/admin/api";
import type { GroundTruthPhaseMarks } from "@/lib/admin/test-swings";
import { createSecretSupabaseClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const PHASE_KEYS = [
  "address",
  "takeaway",
  "top",
  "impact",
  "finish",
] as const;

function parsePhaseMarks(value: unknown): GroundTruthPhaseMarks | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const out: GroundTruthPhaseMarks = {};
  for (const key of PHASE_KEYS) {
    const raw = (value as Record<string, unknown>)[key];
    if (raw === null || raw === undefined) {
      continue;
    }
    const frame = Number(raw);
    if (!Number.isInteger(frame) || frame < 0) {
      return null;
    }
    out[key] = frame;
  }
  return out;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi();
  if (!auth.ok) {
    return auth.response;
  }

  const { id: swingId } = await context.params;
  let body: { phase_marks?: unknown; keypoint_id?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("Expected JSON body.");
  }

  const phaseMarks = parsePhaseMarks(body.phase_marks);
  if (body.phase_marks !== undefined && phaseMarks === null) {
    return jsonError("phase_marks must be frame indexes keyed by phase name.");
  }

  const secret = createSecretSupabaseClient();
  let query = secret
    .from("test_swing_keypoints")
    .select("id")
    .eq("test_swing_id", swingId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (body.keypoint_id) {
    query = secret
      .from("test_swing_keypoints")
      .select("id")
      .eq("id", body.keypoint_id)
      .limit(1);
  }

  const { data: row, error: fetchError } = await query.maybeSingle();
  if (fetchError) {
    return jsonError(fetchError.message, 500);
  }
  if (!row) {
    return jsonError("No keypoint row for this swing.", 404);
  }

  const { data, error } = await secret
    .from("test_swing_keypoints")
    .update({ phase_marks: phaseMarks })
    .eq("id", row.id)
    .select("id, phase_marks")
    .single();

  if (error || !data) {
    return jsonError(error?.message ?? "Could not save phase marks.", 500);
  }

  return NextResponse.json({ keypoints: data });
}
