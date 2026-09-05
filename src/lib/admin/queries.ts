import { createSecretSupabaseClient } from "@/lib/supabase/admin";
import type { ContentKind } from "@/lib/admin/constants";
import type { VersionedRow } from "@/lib/admin/versioning";

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
