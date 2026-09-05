import { NextResponse } from "next/server";
import { jsonError, requireAdminApi } from "@/lib/admin/api";
import { listTestSwings } from "@/lib/admin/queries";
import { parseTestSwingLabels } from "@/lib/admin/test-swings";
import { createSecretSupabaseClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) {
    return auth.response;
  }
  try {
    const swings = await listTestSwings();
    return NextResponse.json({ swings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "List failed.";
    return jsonError(message, 500);
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) {
    return auth.response;
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError("Expected JSON body.");
  }

  const storage_path = String(body.storage_path ?? "").trim();
  if (!storage_path || storage_path.includes("..")) {
    return jsonError("storage_path is required.");
  }

  const parsed = parseTestSwingLabels(body);
  if (!parsed.ok) {
    return jsonError(parsed.error);
  }

  const secret = createSecretSupabaseClient();
  const { data, error } = await secret
    .from("test_swings")
    .insert({
      storage_path,
      created_by: auth.session.userId,
      created_by_email: auth.session.email,
      ...parsed.labels,
    })
    .select("*")
    .single();

  if (error || !data) {
    return jsonError(error?.message ?? "Insert failed.", 500);
  }

  return NextResponse.json({ swing: data });
}
