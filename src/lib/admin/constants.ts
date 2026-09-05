export const CONTENT_KINDS = [
  "metrics",
  "bands",
  "faults",
  "fault_families",
  "symptom_map",
  "symptom_notes",
  "voice",
  "protocols",
  "setup_priority",
] as const;

export type ContentKind = (typeof CONTENT_KINDS)[number];

export const KIND_LABELS: Record<ContentKind, string> = {
  metrics: "Metrics",
  bands: "Bands",
  faults: "Faults",
  fault_families: "Fault families",
  symptom_map: "Symptom map",
  symptom_notes: "Symptom notes",
  voice: "Voice",
  protocols: "Protocols",
  setup_priority: "Setup priority",
};

export const KIND_SLUGS: Record<string, ContentKind> = {
  metrics: "metrics",
  bands: "bands",
  faults: "faults",
  "fault-families": "fault_families",
  "symptom-map": "symptom_map",
  "symptom-notes": "symptom_notes",
  voice: "voice",
  protocols: "protocols",
  "setup-priority": "setup_priority",
};

export const KIND_TO_SLUG: Record<ContentKind, string> = {
  metrics: "metrics",
  bands: "bands",
  faults: "faults",
  fault_families: "fault-families",
  symptom_map: "symptom-map",
  symptom_notes: "symptom-notes",
  voice: "voice",
  protocols: "protocols",
  setup_priority: "setup-priority",
};

export const ANGLES = ["dtl", "face_on", "either"] as const;
export const UNITS = [
  "pct_stance",
  "pct_hip_height",
  "ratio",
  "normalized_rotation",
  "boolean",
  "seconds",
] as const;
export const CLUB_FAMILIES = [
  "driver",
  "wood_hybrid",
  "long_iron",
  "short_iron",
  "wedge",
] as const;
export const INTENTS = [
  "stock",
  "draw",
  "fade",
  "knockdown",
  "punch",
  "flop",
] as const;
export const FAULT_TIERS = [
  "setup",
  "backswing",
  "downswing",
  "impact",
] as const;
export const SYMPTOMS = [
  "slice",
  "hook",
  "fat",
  "thin",
  "shank",
  "push",
  "pull",
  "topping",
  "more_distance",
  "consistent_contact",
] as const;
export const PROTOCOL_BALLS = ["none", "ball"] as const;

export const FEEL_CUE_BLOCKED_WORDS = [
  "hip",
  "pelvis",
  "shoulder",
  "knee",
  "wrist",
  "elbow",
  "spine",
  "head",
] as const;

export const FEEL_CUE_MAX_WORDS = 12;

export const EXTERNAL_CUE_RULE =
  "External-cue rule (6.4): the feel cue may not name the body. Blocked words: hip, pelvis, shoulder, knee, wrist, elbow, spine, head. The explanation may name the body; the cue may not.";

export const BAND_RANGE_RULE =
  "One functional range per metric / club / angle (6.2). Tolerance varies by level; the range does not.";

export function isContentKind(value: string): value is ContentKind {
  return (CONTENT_KINDS as readonly string[]).includes(value);
}

export function kindFromSlug(slug: string): ContentKind | null {
  return KIND_SLUGS[slug] ?? null;
}
