import { CoachLogWorkspace } from "@/components/admin/coach-log-workspace";
import { createSecretSupabaseClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function CoachLogPage() {
  const secret = createSecretSupabaseClient();
  const { data, error } = await secret
    .from("coach_calls")
    .select(
      `
      id,
      created_at,
      prompt,
      output,
      validation_result,
      model,
      cost_usd,
      coach_marks ( verdict )
    `,
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return (
      <p className="text-sm text-red-300">Failed to load coach calls: {error.message}</p>
    );
  }

  return <CoachLogWorkspace calls={data ?? []} />;
}
