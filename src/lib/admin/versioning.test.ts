import { describe, expect, test } from "vitest";
import {
  latestPerObject,
  nextVersion,
  payloadOf,
  publishedSnapshot,
  type VersionedRow,
} from "@/lib/admin/versioning";

function row(
  partial: Partial<VersionedRow> & Pick<VersionedRow, "id" | "object_id">,
): VersionedRow {
  return {
    version: 1,
    status: "draft",
    created_by: null,
    created_by_email: "tom",
    created_at: "2026-09-05T00:00:00.000Z",
    ...partial,
  };
}

describe("versioning helpers", () => {
  test("nextVersion starts at 1 and increments the max", () => {
    expect(nextVersion([])).toBe(1);
    expect(nextVersion([{ version: 1 }, { version: 3 }])).toBe(4);
  });

  test("latestPerObject keeps the highest version of each object", () => {
    const latest = latestPerObject([
      row({ id: "a1", object_id: "o1", version: 1, key: "old" }),
      row({ id: "a2", object_id: "o1", version: 2, key: "new" }),
      row({ id: "b1", object_id: "o2", version: 1, key: "other" }),
    ]);
    expect(latest).toHaveLength(2);
    expect(latest.find((item) => item.object_id === "o1")?.id).toBe("a2");
  });

  test("payloadOf strips versioning columns", () => {
    expect(
      payloadOf(row({ id: "a1", object_id: "o1", key: "pelvis_vs_tush_line" })),
    ).toEqual({ key: "pelvis_vs_tush_line" });
  });

  test("publishedSnapshot pins only published version ids", () => {
    const snapshot = publishedSnapshot(["metrics"], {
      metrics: [
        row({ id: "v1", object_id: "o1", version: 1, status: "draft" }),
        row({ id: "v2", object_id: "o1", version: 2, status: "published" }),
      ],
      bands: [],
      faults: [],
      fault_families: [],
      symptom_map: [],
      symptom_notes: [],
      voice: [],
      protocols: [],
      setup_priority: [],
    });
    expect(snapshot.metrics).toEqual({ o1: "v2" });
  });
});
