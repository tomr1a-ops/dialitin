import { NextResponse } from "next/server";
import { getOrCreateGolferId } from "@/lib/golfer/id";
import { createSecretSupabaseClient } from "@/lib/supabase/admin";

export async function GET() {
  const golferId = await getOrCreateGolferId();
  const secret = createSecretSupabaseClient();

  const { data, error } = await secret
    .from("swings")
    .select(
      `
      id,
      created_at,
      club_family,
      angle,
      intent,
      diagnoses (
        id,
        outcome,
        headline_fault,
        fault_key,
        delta_pct_stance,
        mode,
        outcomes ( did_it_work, created_at )
      )
    `,
    )
    .eq("golfer_id", golferId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ swings: data ?? [] });
}
