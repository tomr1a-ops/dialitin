import type { ContentKind } from "@/lib/admin/constants";

export type VersionMeta = {
  id: string;
  object_id: string;
  version: number;
  status: "draft" | "published";
  created_by: string | null;
  created_by_email: string | null;
  created_at: string;
};

export type VersionedRow = VersionMeta & Record<string, unknown>;

export const VERSION_META_KEYS = [
  "id",
  "object_id",
  "version",
  "status",
  "created_by",
  "created_by_email",
  "created_at",
] as const;

export function nextVersion(existing: { version: number }[]): number {
  if (existing.length === 0) {
    return 1;
  }
  return Math.max(...existing.map((row) => row.version)) + 1;
}

export function latestPerObject(rows: VersionedRow[]): VersionedRow[] {
  const byObject = new Map<string, VersionedRow>();
  for (const row of rows) {
    const current = byObject.get(row.object_id);
    if (!current || row.version > current.version) {
      byObject.set(row.object_id, row);
    }
  }
  return [...byObject.values()].sort((a, b) =>
    String(a.created_at).localeCompare(String(b.created_at)),
  );
}

export function payloadOf(row: VersionedRow): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (!(VERSION_META_KEYS as readonly string[]).includes(key)) {
      payload[key] = value;
    }
  }
  return payload;
}

export function publishedSnapshot(
  kinds: ContentKind[],
  rowsByKind: Record<ContentKind, VersionedRow[]>,
): Record<string, Record<string, string>> {
  const snapshot: Record<string, Record<string, string>> = {};
  for (const kind of kinds) {
    const published: Record<string, string> = {};
    for (const row of rowsByKind[kind] ?? []) {
      if (row.status === "published") {
        published[row.object_id] = row.id;
      }
    }
    snapshot[kind] = published;
  }
  return snapshot;
}
