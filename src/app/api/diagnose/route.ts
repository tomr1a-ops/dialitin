import { NextResponse } from "next/server";
import { getOrCreateGolferId } from "@/lib/golfer/id";
import { checkFreeTier, nextUsage } from "@/lib/golfer/free-tier";
import { runDiagnosisPipeline } from "@/lib/engine/run-diagnosis";
import { createSecretSupabaseClient } from "@/lib/supabase/admin";
import type { RunDiagnosisInput } from "@/lib/engine/run-diagnosis";

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<RunDiagnosisInput> & {
    mode?: "diagnose" | "retest";
  };

  const golferId = await getOrCreateGolferId();
  const secret = createSecretSupabaseClient();

  const { data: usageRow } = await secret
    .from("golfer_usage")
    .select("*")
    .eq("golfer_id", golferId)
    .maybeSingle();

  const usage = {
    diagnosesUsed: usageRow?.diagnoses_used ?? 0,
    retestsUsed: usageRow?.retests_used ?? 0,
  };

  const mode = body.mode ?? "diagnose";
  const tier = checkFreeTier(usage, mode);
  if (!tier.allowed) {
    return NextResponse.json(
      { error: tier.reason, paywall: tier.showPaywall },
      { status: 402 },
    );
  }

  if (
    !body.metrics ||
    !body.phases ||
    !body.angle ||
    !body.clubFamily
  ) {
    return NextResponse.json({ error: "missing required fields" }, { status: 400 });
  }

  const result = await runDiagnosisPipeline({
    ...body,
    metrics: body.metrics,
    phases: body.phases,
    angle: body.angle,
    clubFamily: body.clubFamily,
    handedness: body.handedness ?? "right",
    golferId,
    callCoach: body.callCoach ?? true,
    persist: body.persist ?? true,
  });

  const updated = nextUsage(usage, mode);
  await secret.from("golfer_usage").upsert({
    golfer_id: golferId,
    diagnoses_used: updated.diagnosesUsed,
    retests_used: updated.retestsUsed,
    updated_at: new Date().toISOString(),
  });

  return NextResponse.json({
    ...result,
    score_internal: result.diagnosis.score_internal,
  });
}
