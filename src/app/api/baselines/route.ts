import { NextResponse } from "next/server";
import { getOrCreateGolferId } from "@/lib/golfer/id";
import { createSecretSupabaseClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    swing_id: string;
    club_family: string;
    angle: string;
    intent?: string;
  };

  if (!body.swing_id || !body.club_family || !body.angle) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  const golferId = await getOrCreateGolferId();
  const secret = createSecretSupabaseClient();

  const { data: swing } = await secret
    .from("swings")
    .select("id, golfer_id")
    .eq("id", body.swing_id)
    .maybeSingle();

  if (!swing || swing.golfer_id !== golferId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { data, error } = await secret
    .from("baselines")
    .upsert(
      {
        golfer_id: golferId,
        club_family: body.club_family,
        angle: body.angle,
        intent: body.intent ?? "stock",
        swing_id: body.swing_id,
        saved_at: new Date().toISOString(),
      },
      { onConflict: "golfer_id,club_family,angle,intent" },
    )
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
