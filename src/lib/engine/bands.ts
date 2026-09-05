import type { ClubFamily, ShotIntent } from "@/lib/admin/test-swings";
import {
  angleMatchesMetric,
  catalogKeyForEngineKey,
  type MetricAngle,
} from "@/lib/engine/metric-catalog";
import { createSecretSupabaseClient } from "@/lib/supabase/admin";

export type SkillLevel = "beginner" | "intermediate" | "advanced";

export type BandTolerance = {
  beginner: number | null;
  intermediate: number | null;
  advanced: number | null;
};

export type FunctionalBand = {
  low: number | null;
  high: number | null;
  tolerance: BandTolerance;
};

export type BandLookup = {
  band: FunctionalBand | null;
  reason: string;
};

export type BandsTable = Record<
  string,
  Record<ClubFamily, Partial<Record<MetricAngle, FunctionalBand>>>
>;

type MetricRow = {
  object_id: string;
  key: string;
  angle: MetricAngle;
};

type BandRow = {
  id: string;
  metric_object_id: string;
  club_family: ClubFamily;
  intent: ShotIntent;
  functional_low: number | null;
  functional_high: number | null;
  tolerance_beginner: number | null;
  tolerance_intermediate: number | null;
  tolerance_advanced: number | null;
};

type ContentSnapshot = {
  metrics?: Record<string, string>;
  bands?: Record<string, string>;
};

export type BandsLoadInput = {
  metrics: MetricRow[];
  bands: BandRow[];
  snapshot: ContentSnapshot;
};

function bandFromRow(row: BandRow): FunctionalBand {
  return {
    low: row.functional_low,
    high: row.functional_high,
    tolerance: {
      beginner: row.tolerance_beginner,
      intermediate: row.tolerance_intermediate,
      advanced: row.tolerance_advanced,
    },
  };
}

function emptyBandsTable(metrics: MetricRow[]): BandsTable {
  const table: BandsTable = {};
  for (const metric of metrics) {
    table[metric.key] ??= {} as Record<
      ClubFamily,
      Partial<Record<MetricAngle, FunctionalBand>>
    >;
  }
  return table;
}

/** Build lookup table from a pinned content_versions snapshot. */
export function buildBandsTable(input: BandsLoadInput): BandsTable {
  const table = emptyBandsTable(input.metrics);
  const metricByObjectId = new Map(
    input.metrics.map((row) => [row.object_id, row]),
  );
  const bandIds = new Set(Object.values(input.snapshot.bands ?? {}));
  const pinnedBands = input.bands.filter((row) => bandIds.has(row.id));

  for (const bandRow of pinnedBands) {
    const metric = metricByObjectId.get(bandRow.metric_object_id);
    if (!metric) {
      continue;
    }
    table[metric.key] ??= {} as Record<
      ClubFamily,
      Partial<Record<MetricAngle, FunctionalBand>>
    >;
    table[metric.key]![bandRow.club_family] ??= {};
    table[metric.key]![bandRow.club_family]![metric.angle] = bandFromRow(bandRow);
  }

  return table;
}

export type BandQuery = {
  engineMetricKey: string;
  clubFamily: ClubFamily;
  swingAngle: "dtl" | "face_on";
  intent?: ShotIntent | null;
};

export function lookupBand(
  table: BandsTable,
  query: BandQuery,
): BandLookup {
  const catalogKey = catalogKeyForEngineKey(query.engineMetricKey);
  const clubTable = table[catalogKey];
  if (!clubTable) {
    return {
      band: null,
      reason: `no catalog metric for ${query.engineMetricKey}`,
    };
  }

  const familyTable = clubTable[query.clubFamily];
  if (!familyTable) {
    return {
      band: null,
      reason: `no band for ${catalogKey} / ${query.clubFamily}`,
    };
  }

  const angles: MetricAngle[] = ["either", query.swingAngle];
  for (const angle of angles) {
    const band = familyTable[angle];
    if (band && (band.low !== null || band.high !== null)) {
      return { band, reason: "ok" };
    }
  }

  return {
    band: null,
    reason: `no published band for ${catalogKey} / ${query.clubFamily} / ${query.swingAngle}`,
  };
}

/** Every known catalog metric gets an explicit no-band entry when the table is empty. */
export function allBandLookups(
  table: BandsTable,
  clubFamily: ClubFamily,
  swingAngle: "dtl" | "face_on",
  engineKeys: string[],
): Record<string, BandLookup> {
  const out: Record<string, BandLookup> = {};
  for (const key of engineKeys) {
    out[key] = lookupBand(table, {
      engineMetricKey: key,
      clubFamily,
      swingAngle,
    });
  }
  return out;
}

export function metricAppliesToAngle(
  metricAngle: MetricAngle,
  swingAngle: "dtl" | "face_on",
): boolean {
  return angleMatchesMetric(metricAngle, swingAngle);
}

export async function loadPublishedBandsSnapshot(contentVersionId?: string | null): Promise<{
  contentVersionId: string | null;
  bands: BandsTable;
}> {
  const secret = createSecretSupabaseClient();

  let versionId = contentVersionId ?? null;
  let snapshot: { bands?: Record<string, string> } = {};

  if (versionId) {
    const { data, error } = await secret
      .from("content_versions")
      .select("id, snapshot")
      .eq("id", versionId)
      .maybeSingle();
    if (error) {
      throw new Error(error.message);
    }
    if (data) {
      snapshot = (data.snapshot ?? {}) as { bands?: Record<string, string> };
      versionId = data.id;
    }
  } else {
    const { data, error } = await secret
      .from("content_versions")
      .select("id, snapshot")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      throw new Error(error.message);
    }
    if (data) {
      snapshot = (data.snapshot ?? {}) as { bands?: Record<string, string> };
      versionId = data.id;
    }
  }

  const { data: metrics, error: metricsError } = await secret
    .from("metrics")
    .select("object_id, key, angle")
    .eq("status", "published");
  if (metricsError) {
    throw new Error(metricsError.message);
  }

  const bandIds = Object.values(snapshot.bands ?? {});
  let bandRows: BandRow[] = [];
  if (bandIds.length > 0) {
    const { data, error } = await secret
      .from("bands")
      .select(
        "id, metric_object_id, club_family, intent, functional_low, functional_high, tolerance_beginner, tolerance_intermediate, tolerance_advanced",
      )
      .in("id", bandIds);
    if (error) {
      throw new Error(error.message);
    }
    bandRows = (data ?? []) as BandRow[];
  }

  return {
    contentVersionId: versionId,
    bands: buildBandsTable({
      metrics: (metrics ?? []) as MetricRow[],
      bands: bandRows,
      snapshot,
    }),
  };
}
