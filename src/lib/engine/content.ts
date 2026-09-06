import type { ClubFamily, ShotIntent } from "@/lib/admin/test-swings";
import type { BandsTable } from "@/lib/engine/bands";
import { buildBandsTable, loadPublishedBandsSnapshot } from "@/lib/engine/bands";
import { createSecretSupabaseClient } from "@/lib/supabase/admin";

export type FaultTier = "setup" | "backswing" | "downswing" | "impact";

export type FaultMetricRule = {
  engine_key: string;
  catalog_key?: string;
  weight?: number;
  direction?: "above" | "below" | "either";
  min_deviation?: number;
};

export type FaultDef = {
  id: string;
  key: string;
  name: string;
  family: string | null;
  tier: FaultTier;
  severity_weight: number;
  causal_leverage: number;
  changeability: number;
  metric_rules: {
    primary_metric?: string;
    metrics?: FaultMetricRule[];
    requires_angle?: "dtl" | "face_on" | "either";
    functional_unconventional?: boolean;
    linked_setup?: boolean;
    adaptation?: boolean;
  };
};

export type FaultFamilyDef = {
  key: string;
  members: string[];
  one_sentence: string;
};

export type SymptomMapEntry = {
  symptom: string;
  fault_key: string;
  weight: number;
  order: number;
};

export type VoiceEntry = {
  fault_key: string;
  feel_cue: string;
  ball_flight_cost: string;
  explanation: string;
  signed_by: string | null;
};

export type ProtocolEntry = {
  id: string;
  fault_key: string;
  name: string;
  constraint_text: string;
  reps_slow: number | null;
  reps_rehearsal: number | null;
  reps_live: number | null;
  ball: "none" | "ball";
  progression: string;
  success_criterion: string;
};

export type SetupPriorityDef = {
  bullet_1: string;
  bullet_2: string;
  bullet_3: string;
  tier_weights: Record<
    string,
    {
      ball_flight_relevance?: number | null;
      confidence?: number | null;
      severity?: number | null;
      causal_leverage?: number | null;
      changeability?: number | null;
    }
  >;
};

export type CoachingContent = {
  contentVersionId: string | null;
  bands: BandsTable;
  faults: FaultDef[];
  faultFamilies: FaultFamilyDef[];
  symptomMap: SymptomMapEntry[];
  voice: VoiceEntry[];
  protocols: ProtocolEntry[];
  setupPriority: SetupPriorityDef | null;
  hasSignedBands: boolean;
  hasSignedFaults: boolean;
};

type ContentSnapshot = {
  bands?: Record<string, string>;
  faults?: Record<string, string>;
  fault_families?: Record<string, string>;
  symptom_map?: Record<string, string>;
  voice?: Record<string, string>;
  protocols?: Record<string, string>;
  setup_priority?: Record<string, string>;
};

function num(value: unknown, fallback = 1): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function pinnedRows<T extends { id: string }>(
  rows: T[],
  snapshotMap: Record<string, string> | undefined,
): T[] {
  const ids = new Set(Object.values(snapshotMap ?? {}));
  if (ids.size === 0) {
    return [];
  }
  return rows.filter((row) => ids.has(row.id));
}

export async function loadPublishedCoachingContent(
  contentVersionId?: string | null,
): Promise<CoachingContent> {
  const secret = createSecretSupabaseClient();
  const { contentVersionId: versionId, bands } =
    await loadPublishedBandsSnapshot(contentVersionId);

  let snapshot: ContentSnapshot = {};
  if (versionId) {
    const { data, error } = await secret
      .from("content_versions")
      .select("snapshot")
      .eq("id", versionId)
      .maybeSingle();
    if (error) {
      throw new Error(error.message);
    }
    snapshot = (data?.snapshot ?? {}) as ContentSnapshot;
  }

  const bandIds = Object.values(snapshot.bands ?? {});
  const hasSignedBands = bandIds.length > 0;

  const [
    faultsRes,
    familiesRes,
    symptomRes,
    voiceRes,
    protocolsRes,
    setupRes,
  ] = await Promise.all([
    secret.from("faults").select("*").eq("status", "published"),
    secret.from("fault_families").select("*").eq("status", "published"),
    secret.from("symptom_map").select("*").eq("status", "published"),
    secret.from("voice").select("*").eq("status", "published"),
    secret.from("protocols").select("*").eq("status", "published"),
    secret.from("setup_priority").select("*").eq("status", "published"),
  ]);

  for (const res of [
    faultsRes,
    familiesRes,
    symptomRes,
    voiceRes,
    protocolsRes,
    setupRes,
  ]) {
    if (res.error) {
      throw new Error(res.error.message);
    }
  }

  const faults = pinnedRows(faultsRes.data ?? [], snapshot.faults).map(
    (row) => ({
      id: row.id as string,
      key: row.key as string,
      name: row.name as string,
      family: (row.family as string | null) ?? null,
      tier: row.tier as FaultTier,
      severity_weight: num(row.severity_weight, 1),
      causal_leverage: num(row.causal_leverage, 1),
      changeability: num(row.changeability, 1),
      metric_rules: (row.metric_rules ?? {}) as FaultDef["metric_rules"],
    }),
  );

  const faultFamilies = pinnedRows(
    familiesRes.data ?? [],
    snapshot.fault_families,
  ).map((row) => ({
    key: row.key as string,
    members: (row.members as string[]) ?? [],
    one_sentence: (row.one_sentence as string) ?? "",
  }));

  const symptomMap = pinnedRows(symptomRes.data ?? [], snapshot.symptom_map)
    .map((row) => ({
      symptom: row.symptom as string,
      fault_key: row.fault_key as string,
      weight: num(row.weight, 1),
      order: num(row.order, 1),
    }))
    .sort((a, b) => a.order - b.order);

  const voice = pinnedRows(voiceRes.data ?? [], snapshot.voice).map((row) => ({
    fault_key: row.fault_key as string,
    feel_cue: (row.feel_cue as string) ?? "",
    ball_flight_cost: (row.ball_flight_cost as string) ?? "",
    explanation: (row.explanation as string) ?? "",
    signed_by: (row.signed_by as string | null) ?? null,
  }));

  const protocols = pinnedRows(protocolsRes.data ?? [], snapshot.protocols).map(
    (row) => ({
      id: row.id as string,
      fault_key: row.fault_key as string,
      name: row.name as string,
      constraint_text: (row.constraint_text as string) ?? "",
      reps_slow: row.reps_slow as number | null,
      reps_rehearsal: row.reps_rehearsal as number | null,
      reps_live: row.reps_live as number | null,
      ball: (row.ball as "none" | "ball") ?? "none",
      progression: (row.progression as string) ?? "",
      success_criterion: (row.success_criterion as string) ?? "",
    }),
  );

  const setupRows = pinnedRows(setupRes.data ?? [], snapshot.setup_priority);
  const setupPriority =
    setupRows[0] != null
      ? {
          bullet_1: (setupRows[0].bullet_1 as string) ?? "",
          bullet_2: (setupRows[0].bullet_2 as string) ?? "",
          bullet_3: (setupRows[0].bullet_3 as string) ?? "",
          tier_weights: (setupRows[0].tier_weights ?? {}) as SetupPriorityDef["tier_weights"],
        }
      : null;

  return {
    contentVersionId: versionId,
    bands,
    faults,
    faultFamilies,
    symptomMap,
    voice,
    protocols,
    setupPriority,
    hasSignedBands,
    hasSignedFaults: faults.length > 0,
  };
}

/** Build in-memory coaching content for unit tests. */
export function buildCoachingContent(
  partial: Partial<CoachingContent> & { bands?: BandsTable },
): CoachingContent {
  return {
    contentVersionId: partial.contentVersionId ?? "test",
    bands: partial.bands ?? {},
    faults: partial.faults ?? [],
    faultFamilies: partial.faultFamilies ?? [],
    symptomMap: partial.symptomMap ?? [],
    voice: partial.voice ?? [],
    protocols: partial.protocols ?? [],
    setupPriority: partial.setupPriority ?? null,
    hasSignedBands: partial.hasSignedBands ?? false,
    hasSignedFaults: partial.hasSignedFaults ?? (partial.faults?.length ?? 0) > 0,
  };
}

export { buildBandsTable };
