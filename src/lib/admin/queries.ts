import { createSecretSupabaseClient } from "@/lib/supabase/admin";
import type { ContentKind } from "@/lib/admin/constants";
import {
  TEST_SWING_BUCKET,
  type TestSwingKeypointsRow,
  type TestSwingListItem,
  type TestSwingRow,
} from "@/lib/admin/test-swings";
import type { VersionedRow } from "@/lib/admin/versioning";
import { phasesFromUnknown } from "@/lib/engine/phases";
import {
  framesFromStoredKeypoints,
  type JointCoverage,
} from "@/lib/preview/coverage";

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
  const latest = new Map<string, TestSwingKeypointsRow>();
  if (ids.length > 0) {
    const { data: poseRows, error: poseError } = await secret
      .from("test_swing_keypoints")
      .select("*")
      .in("test_swing_id", ids)
      .order("created_at", { ascending: false });
    if (poseError) {
      throw new Error(poseError.message);
    }
    for (const raw of poseRows ?? []) {
      if (latest.has(raw.test_swing_id)) {
        continue;
      }
      latest.set(raw.test_swing_id, {
        id: raw.id,
        created_at: raw.created_at,
        test_swing_id: raw.test_swing_id,
        model_version: raw.model_version,
        frame_rate_detected: Number(raw.frame_rate_detected),
        keypoints: framesFromStoredKeypoints(raw.keypoints),
        coverage: (raw.coverage ?? []) as JointCoverage[],
        phases: phasesFromUnknown(raw.phases),
      });
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
      keypoints: latest.get(row.id) ?? null,
    });
  }
  return items;
}
