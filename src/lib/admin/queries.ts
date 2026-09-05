import { createSecretSupabaseClient } from "@/lib/supabase/admin";
import type { ContentKind } from "@/lib/admin/constants";
import {
  TEST_SWING_BUCKET,
  type TestSwingListItem,
  type TestSwingPoseRun,
  type TestSwingRow,
} from "@/lib/admin/test-swings";
import type { VersionedRow } from "@/lib/admin/versioning";
import type { PoseFrame } from "@/lib/pose/types";

export async function listKindRows(kind: ContentKind): Promise<VersionedRow[]> {
  const secret = createSecretSupabaseClient();
  const { data, error } = await secret
    .from(kind)
    .select("*")
    .order("version", { ascending: false });
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as VersionedRow[];
}

export async function listPublishedMetrics() {
  const secret = createSecretSupabaseClient();
  const { data, error } = await secret
    .from("metrics")
    .select("object_id, key, name")
    .eq("status", "published")
    .order("name");
  if (error) {
    throw new Error(error.message);
  }
  return data ?? [];
}

export async function listContentSnapshots() {
  const secret = createSecretSupabaseClient();
  const { data, error } = await secret
    .from("content_versions")
    .select("id, created_at, created_by_email, snapshot")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    throw new Error(error.message);
  }
  return data ?? [];
}

const SIGNED_URL_SECONDS = 60 * 60;

export async function listTestSwings(): Promise<TestSwingListItem[]> {
  const secret = createSecretSupabaseClient();
  const { data: swings, error } = await secret
    .from("test_swings")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error(error.message);
  }

  const rows = (swings ?? []) as TestSwingRow[];
  const ids = rows.map((row) => row.id);
  const runsBySwing = new Map<string, TestSwingPoseRun>();
  if (ids.length > 0) {
    const { data: runs, error: runError } = await secret
      .from("test_swing_pose_runs")
      .select("*")
      .in("test_swing_id", ids);
    if (runError) {
      throw new Error(runError.message);
    }
    for (const run of (runs ?? []) as TestSwingPoseRun[]) {
      runsBySwing.set(run.test_swing_id, run);
    }
  }

  const items: TestSwingListItem[] = [];
  for (const row of rows) {
    const { data: signed } = await secret.storage
      .from(TEST_SWING_BUCKET)
      .createSignedUrl(row.storage_path, SIGNED_URL_SECONDS);
    items.push({
      ...row,
      signed_url: signed?.signedUrl ?? null,
      pose_run: runsBySwing.get(row.id) ?? null,
    });
  }
  return items;
}

export async function listKeypointsBySwing(
  swingIds: string[],
): Promise<Record<string, PoseFrame[]>> {
  const grouped: Record<string, PoseFrame[]> = {};
  if (swingIds.length === 0) {
    return grouped;
  }
  const secret = createSecretSupabaseClient();
  const { data, error } = await secret
    .from("test_swing_keypoints")
    .select("test_swing_id, frame_index, media_time, landmarks, crop_box")
    .in("test_swing_id", swingIds)
    .order("frame_index", { ascending: true });
  if (error) {
    throw new Error(error.message);
  }
  for (const row of data ?? []) {
    const frames = grouped[row.test_swing_id] ?? [];
    frames.push({
      mediaTime: Number(row.media_time),
      landmarks: row.landmarks as PoseFrame["landmarks"],
      crop: row.crop_box as PoseFrame["crop"],
    });
    grouped[row.test_swing_id] = frames;
  }
  return grouped;
}
