import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { jsonError, requireAdminApi } from "@/lib/admin/api";
import { safeClipFileName, TEST_SWING_BUCKET } from "@/lib/admin/test-swings";
import { downloadYouTubeVideo } from "@/lib/harvest/download";
import {
  HARVEST_FETCH_RATE_LIMIT,
  HARVEST_LICENSE_NOTE,
  type HarvestTier,
} from "@/lib/harvest/constants";
import { clubFamilyFromTitle, isKnownClubFamily } from "@/lib/harvest/club-family";
import { suggestedFaultFromTitle } from "@/lib/harvest/fault-keywords";
import { createSecretSupabaseClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type FetchItem = {
  videoId: string;
  url: string;
  title: string;
  channelTitle: string;
  tier: HarvestTier;
};

type FetchBody = {
  items?: FetchItem[];
  runId?: string;
};

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) {
    return auth.response;
  }

  let body: FetchBody;
  try {
    body = (await request.json()) as FetchBody;
  } catch {
    return jsonError("Expected JSON body.");
  }

  const items = body.items ?? [];
  if (items.length === 0) {
    return jsonError("Select at least one video.");
  }
  if (items.length > HARVEST_FETCH_RATE_LIMIT) {
    return jsonError(`Rate limit: ${HARVEST_FETCH_RATE_LIMIT} videos per run.`);
  }

  const secret = createSecretSupabaseClient();
  const { data: run, error: runError } = await secret
    .from("harvest_runs")
    .insert({
      created_by: auth.session.userId,
      created_by_email: auth.session.email,
      status: "running",
      requested_count: items.length,
      summary: { items: items.map((item) => item.videoId) },
    })
    .select("id")
    .single();
  if (runError || !run) {
    return jsonError(runError?.message ?? "Could not start harvest run.", 500);
  }

  const results: Array<{
    videoId: string;
    swingId: string | null;
    error: string | null;
  }> = [];

  for (const item of items) {
    try {
      const { buffer, title, ext } = await downloadYouTubeVideo(item.url);
      const fileName = safeClipFileName(
        `${item.videoId}-${title}.${ext === "mp4" ? "mp4" : "mp4"}`,
      );
      const storagePath = `harvest/${item.videoId}/${randomUUID()}-${fileName}`;
      const { error: uploadError } = await secret.storage
        .from(TEST_SWING_BUCKET)
        .upload(storagePath, buffer, {
          contentType: "video/mp4",
          upsert: false,
        });
      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const club = clubFamilyFromTitle(item.title);
      const suggested =
        item.tier === "answer_key" ? suggestedFaultFromTitle(item.title) : null;

      const { data: swing, error: insertError } = await secret
        .from("test_swings")
        .insert({
          storage_path: storagePath,
          created_by: auth.session.userId,
          created_by_email: auth.session.email,
          source_url: item.url,
          channel: item.channelTitle,
          license_note: HARVEST_LICENSE_NOTE,
          tier: item.tier,
          golfer_label: item.title.slice(0, 80),
          club_family: isKnownClubFamily(club) ? club : null,
          intent: "stock",
          capture_path: "native_slomo",
          handedness: "right",
          consecutive_group: null,
          pro_label_fault_1: suggested,
          label_status: suggested ? "suggested" : null,
          excluded: false,
        })
        .select("id")
        .single();
      if (insertError || !swing) {
        throw new Error(insertError?.message ?? "Insert failed.");
      }

      results.push({ videoId: item.videoId, swingId: swing.id, error: null });
    } catch (error) {
      results.push({
        videoId: item.videoId,
        swingId: null,
        error: error instanceof Error ? error.message : "Fetch failed.",
      });
    }
  }

  const fetched = results.filter((row) => row.swingId).length;
  await secret
    .from("harvest_runs")
    .update({
      status: fetched === items.length ? "completed" : fetched > 0 ? "completed" : "failed",
      fetched_count: fetched,
      summary: { results },
    })
    .eq("id", run.id);

  return NextResponse.json({
    runId: run.id,
    fetched,
    requested: items.length,
    results,
  });
}
