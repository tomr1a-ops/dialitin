import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { createSecretSupabaseClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const session = await requireAdmin();

  const body = (await request.json()) as {
    coach_call_id: string;
    verdict: "right" | "wrong" | "right_but_badly_worded";
  };

  if (!body.coach_call_id || !body.verdict) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  const secret = createSecretSupabaseClient();
  const { data, error } = await secret
    .from("coach_marks")
    .upsert(
      {
        coach_call_id: body.coach_call_id,
        verdict: body.verdict,
        marked_by: session.email,
      },
      { onConflict: "coach_call_id" },
    )
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
