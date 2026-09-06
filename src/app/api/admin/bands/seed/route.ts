import { NextResponse } from "next/server";
import { jsonError, requireAdminApi } from "@/lib/admin/api";
import {
  loadBandsSeedPreview,
  seedBandsFromReference,
} from "@/lib/admin/bands-seed";
import { createSecretSupabaseClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) {
    return auth.response;
  }

  const secret = createSecretSupabaseClient();
  const [{ data: metrics }, { data: seededBands }, preview] = await Promise.all([
    secret.from("metrics").select("object_id, key, angle, name").order("key"),
    secret
      .from("bands")
      .select("*")
      .eq("status", "seeded_unsigned")
      .order("created_at", { ascending: false }),
    loadBandsSeedPreview(),
  ]);

  return NextResponse.json({
    seededBands: seededBands ?? [],
    metrics: metrics ?? [],
    preview,
  });
}

export async function POST() {
  const auth = await requireAdminApi();
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const result = await seedBandsFromReference({
      userId: auth.session.userId,
      email: auth.session.email,
    });
    return NextResponse.json({
      inserted: result.inserted,
      cells: result.cells.map((cell) => ({
        metricKey: cell.metricKey,
        clubFamily: cell.clubFamily,
        angle: cell.angle,
        n: cell.n,
        p5: cell.p5,
        p95: cell.p95,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Seed failed.";
    return jsonError(message, 400);
  }
}
