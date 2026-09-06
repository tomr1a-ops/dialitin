import { NextResponse } from "next/server";
import { getOrCreateGolferId } from "@/lib/golfer/id";
import { createSecretSupabaseClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    diagnosis_id: string;
    did_it_work: "better" | "same" | "worse" | "not_sure";
    shot_log?: Record<string, unknown> | null;
  };

  if (!body.diagnosis_id || !body.did_it_work) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  const golferId = await getOrCreateGolferId();
  const secret = createSecretSupabaseClient();

  const { data: dx } = await secret
    .from("diagnoses")
    .select("id, swing_id, swings!inner(golfer_id)")
    .eq("id", body.diagnosis_id)
    .maybeSingle();

  const swingGolfer = (dx?.swings as { golfer_id?: string } | null)?.golfer_id;
  if (!dx || swingGolfer !== golferId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { data, error } = await secret
    .from("outcomes")
    .insert({
      diagnosis_id: body.diagnosis_id,
      did_it_work: body.did_it_work,
      shot_log: body.shot_log ?? null,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
