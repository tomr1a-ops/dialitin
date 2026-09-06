import type { ClubFamily, Handedness, ShotIntent } from "@/lib/admin/test-swings";
import type { SkillLevel } from "@/lib/engine/bands";
import type { CoachingContent, FaultDef } from "@/lib/engine/content";
import type { MetricEvaluation } from "@/lib/engine/evaluate";
import { catalogKeyForEngineKey } from "@/lib/engine/metric-catalog";
import { computeDialItInScore } from "@/lib/engine/score";
import type { SwingPhases } from "@/lib/engine/phases";

export type DiagnosisOutcome =
  | "fault"
  | "dont_fix_it"
  | "refuse"
  | "insufficient_data";

export type DiagnosisMode = "diagnose" | "retest" | "problem";

export type DiagnosisEvidence = {
  metric: string;
  value: number | null;
  band: MetricEvaluation["band"];
  deviation: number | null;
  confidence: number;
};

export type PriorDiagnosis = {
  fault_key: string;
  headline_fault: string;
  family: string | null;
  evidence: DiagnosisEvidence[];
  metric_key?: string | null;
  prior_value?: number | null;
};

export type DiagnosisResult = {
  outcome: DiagnosisOutcome;
  headline_fault: string | null;
  fault_key: string | null;
  family: string | null;
  evidence: DiagnosisEvidence[];
  first_guilty_frame: number | null;
  protocol_id: string | null;
  mode: DiagnosisMode;
  reasons: string[];
  delta_pct_stance: number | null;
  score_internal: number | null;
};

export type DiagnoseInput = {
  evaluations: Record<string, MetricEvaluation>;
  phases: SwingPhases;
  angle: "dtl" | "face_on";
  clubFamily: ClubFamily;
  intent?: ShotIntent | null;
  handedness: Handedness;
  level: SkillLevel;
  statedSymptom?: string | null;
  priorDiagnosis?: PriorDiagnosis | null;
  mode?: "diagnose" | "retest";
  content: CoachingContent;
  /** Hook: functional unconventional setup — leave alone (Sec 11 bullet 3). */
  functionalUnconventionalSetup?: boolean;
  /** Hook: declared fade intent gates OTT (6.1). */
  declaredFade?: boolean;
  /** Hook: reported slice/block/shank gates shallowing praise. */
  reportedSliceBlockShank?: boolean;
};

type Observation = {
  key: string;
  pattern: string;
  confidence: number;
  deviation: number;
  evaluation: MetricEvaluation;
  isFaultCandidate: boolean;
};

type FaultCandidate = {
  fault: FaultDef;
  score: number;
  evidence: DiagnosisEvidence[];
  observations: Observation[];
};

const INSUFFICIENT_COPY =
  "Not enough signed data yet. The pro has not published bands and faults for this club.";

const DONT_FIX_COPY =
  "Your swing looks functional. We don't see a body-movement problem strong enough to recommend changing.";

const REFUSE_COPY =
  "We couldn't read this clip reliably enough to diagnose.";

const TIER_ORDER: Record<FaultDef["tier"], number> = {
  setup: 0,
  backswing: 1,
  downswing: 2,
  impact: 3,
};

function readableEvaluations(
  evaluations: Record<string, MetricEvaluation>,
): Record<string, MetricEvaluation> {
  const out: Record<string, MetricEvaluation> = {};
  for (const [key, ev] of Object.entries(evaluations)) {
    if (ev.status !== "not-read" && ev.status !== "inactive") {
      out[key] = ev;
    }
  }
  return out;
}

function evidenceFromEval(
  key: string,
  ev: MetricEvaluation,
): DiagnosisEvidence {
  return {
    metric: key,
    value: ev.value,
    band: ev.band,
    deviation: ev.deviation,
    confidence: ev.confidence,
  };
}

function isFail(ev: MetricEvaluation): boolean {
  return ev.status === "fail" && ev.inBand === false;
}

/** Gate: declared fade + out-to-in path is observation, not OTT fault. */
export function gateFadeNotOTT(
  evaluations: Record<string, MetricEvaluation>,
  intent: ShotIntent | null | undefined,
  declaredFade?: boolean,
): boolean {
  const fade = declaredFade || intent === "fade";
  if (!fade) {
    return false;
  }
  const slot = evaluations.delivery_slot;
  if (!slot || slot.status === "not-read" || slot.value === null) {
    return false;
  }
  // Negative deviation = below band = shallower / in-to-out relative to backswing path
  return slot.deviation !== null && slot.deviation < 0;
}

/** Gate: OTT never diagnosed from single DTL without face-on rotation context. */
export function gateOTTRequiresFaceOn(
  angle: "dtl" | "face_on",
  evaluations: Record<string, MetricEvaluation>,
): boolean {
  if (angle === "face_on") {
    return false;
  }
  const hasFaceOnContext =
    evaluations.shoulder_rotation_top?.status === "pass" ||
    evaluations.shoulder_rotation_top?.status === "fail" ||
    evaluations.hip_rotation_top?.status === "pass" ||
    evaluations.hip_rotation_top?.status === "fail" ||
    evaluations.sequence_proxy?.status === "pass" ||
    evaluations.sequence_proxy?.status === "fail";
  return !hasFaceOnContext;
}

/** Gate: hip "turn" with straightening trail knee + head drift = sway, not rotation fault. */
export function gateHipTurnIsSway(
  evaluations: Record<string, MetricEvaluation>,
): boolean {
  const hipRot = evaluations.hip_rotation_top;
  const trailKnee = evaluations.trail_knee_flexion_change;
  const headSway = evaluations.head_sway;
  if (!hipRot || hipRot.status === "not-read" || !isFail(hipRot)) {
    return false;
  }
  const kneeStraightening =
    trailKnee &&
    trailKnee.status !== "not-read" &&
    trailKnee.value !== null &&
    trailKnee.deviation !== null &&
    trailKnee.deviation > 0;
  const headDrift =
    headSway &&
    headSway.status !== "not-read" &&
    isFail(headSway);
  return Boolean(kneeStraightening && headDrift);
}

/** Gate: low-confidence lead hip clearance never vetoes clean tush line. */
export function gateClearanceNeverVetoesTush(
  evaluations: Record<string, MetricEvaluation>,
): boolean {
  const tush = evaluations.tush_line_pelvis ?? evaluations.tush_line_family;
  const clearance = evaluations.lead_hip_clearance_impact;
  if (!tush || !clearance) {
    return false;
  }
  const tushClean = tush.status === "pass" || (tush.inBand === true);
  const clearanceLowConf =
    clearance.status === "not-read" ||
    clearance.confidence < 0.5 ||
    clearance.status === "no-band";
  return Boolean(tushClean && clearanceLowConf && isFail(clearance));
}

/** Gate: weight transfer proxy cannot claim pressure (5.4). */
export function gateWeightProxyHonesty(key: string): boolean {
  return key === "weight_transfer_proxy";
}

function buildObservations(input: DiagnoseInput): Observation[] {
  const readable = readableEvaluations(input.evaluations);
  const observations: Observation[] = [];

  for (const [key, ev] of Object.entries(readable)) {
    if (ev.status === "no-band" || ev.value === null) {
      continue;
    }

    if (gateWeightProxyHonesty(key) && isFail(ev)) {
      observations.push({
        key,
        pattern: "weight shift pattern (proxy — cannot see pressure)",
        confidence: ev.confidence * 0.85,
        deviation: ev.deviation ?? 0,
        evaluation: ev,
        isFaultCandidate: true,
      });
      continue;
    }

    if (key === "delivery_slot" && isFail(ev)) {
      if (gateFadeNotOTT(readable, input.intent, input.declaredFade)) {
        observations.push({
          key,
          pattern: "out-to-in path on declared fade (observation, not OTT)",
          confidence: ev.confidence,
          deviation: ev.deviation ?? 0,
          evaluation: ev,
          isFaultCandidate: false,
        });
        continue;
      }
      if (gateOTTRequiresFaceOn(input.angle, readable)) {
        observations.push({
          key,
          pattern: "possible over-the-top (DTL only — needs face-on context)",
          confidence: ev.confidence * 0.6,
          deviation: ev.deviation ?? 0,
          evaluation: ev,
          isFaultCandidate: false,
        });
        continue;
      }
      if (input.reportedSliceBlockShank && ev.deviation !== null && ev.deviation < 0) {
        observations.push({
          key,
          pattern: "shallower path but reported slice/block/shank (face unseen)",
          confidence: ev.confidence,
          deviation: ev.deviation ?? 0,
          evaluation: ev,
          isFaultCandidate: false,
        });
        continue;
      }
      observations.push({
        key,
        pattern: "over-the-top delivery slot",
        confidence: ev.confidence,
        deviation: ev.deviation ?? 0,
        evaluation: ev,
        isFaultCandidate: true,
      });
      continue;
    }

    if (key === "hip_rotation_top" && isFail(ev)) {
      if (gateHipTurnIsSway(readable)) {
        observations.push({
          key,
          pattern: "hip sway signature (trail knee + head drift)",
          confidence: ev.confidence,
          deviation: ev.deviation ?? 0,
          evaluation: ev,
          isFaultCandidate: true,
        });
        continue;
      }
    }

    if (
      (key === "tush_line_pelvis" || key === "tush_line_family") &&
      isFail(ev)
    ) {
      if (gateClearanceNeverVetoesTush(readable)) {
        observations.push({
          key,
          pattern: "early extension (tush line; clearance read ignored)",
          confidence: ev.confidence,
          deviation: ev.deviation ?? 0,
          evaluation: ev,
          isFaultCandidate: true,
        });
        continue;
      }
    }

    if (isFail(ev)) {
      observations.push({
        key,
        pattern: `${catalogKeyForEngineKey(key)} out of band`,
        confidence: ev.confidence,
        deviation: ev.deviation ?? 0,
        evaluation: ev,
        isFaultCandidate: true,
      });
    }
  }

  return observations;
}

function faultMatchesObservation(
  fault: FaultDef,
  obs: Observation,
): boolean {
  const rules = fault.metric_rules.metrics ?? [];
  if (rules.length === 0) {
    return fault.key === obs.key || fault.key.includes(obs.key);
  }
  for (const rule of rules) {
    const engineKey = rule.engine_key;
    const catalogKey = rule.catalog_key ?? catalogKeyForEngineKey(engineKey);
    const obsCatalog = catalogKeyForEngineKey(obs.key);
    if (
      obs.key !== engineKey &&
      obs.key !== catalogKey &&
      obsCatalog !== catalogKey &&
      obsCatalog !== engineKey
    ) {
      continue;
    }
    if (rule.direction === "above" && (obs.evaluation.deviation ?? 0) <= 0) {
      continue;
    }
    if (rule.direction === "below" && (obs.evaluation.deviation ?? 0) >= 0) {
      continue;
    }
    if (
      rule.min_deviation !== undefined &&
      (obs.evaluation.deviation ?? 0) < rule.min_deviation
    ) {
      continue;
    }
    return true;
  }
  return false;
}

function buildFaultCandidates(
  input: DiagnoseInput,
  observations: Observation[],
): FaultCandidate[] {
  const candidates: FaultCandidate[] = [];

  for (const fault of input.content.faults) {
    const reqAngle = fault.metric_rules.requires_angle ?? "either";
    if (reqAngle !== "either" && reqAngle !== input.angle) {
      continue;
    }

    if (
      input.functionalUnconventionalSetup &&
      fault.metric_rules.functional_unconventional
    ) {
      continue;
    }

    const matched = observations.filter(
      (obs) => obs.isFaultCandidate && faultMatchesObservation(fault, obs),
    );
    if (matched.length === 0) {
      continue;
    }

    const evidence = matched.map((obs) => evidenceFromEval(obs.key, obs.evaluation));
    const avgDeviation =
      matched.reduce((sum, o) => sum + o.deviation, 0) / matched.length;
    const avgConfidence =
      matched.reduce((sum, o) => sum + o.confidence, 0) / matched.length;

    const tierWeight =
      input.content.setupPriority?.tier_weights[fault.tier]?.severity ?? 1;
    const score =
      fault.severity_weight *
      fault.causal_leverage *
      fault.changeability *
      avgDeviation *
      avgConfidence *
      numOr(tierWeight, 1);

    candidates.push({ fault, score, evidence, observations: matched });
  }

  return candidates.sort((a, b) => b.score - a.score);
}

function numOr(value: number | null | undefined, fallback: number): number {
  return value != null && Number.isFinite(value) ? value : fallback;
}

function applySetupPriority(
  candidates: FaultCandidate[],
  content: CoachingContent,
): FaultCandidate[] {
  const setupFaults = candidates.filter((c) => c.fault.tier === "setup");
  const nonSetup = candidates.filter((c) => c.fault.tier !== "setup");

  if (setupFaults.length === 0) {
    return candidates;
  }

  const linked = setupFaults.find((c) => c.fault.metric_rules.linked_setup);
  if (linked) {
    const adaptation = setupFaults.find((c) => c.fault.metric_rules.adaptation);
    if (adaptation && adaptation.score > linked.score * 0.8) {
      return [linked, adaptation, ...nonSetup];
    }
    return [linked, ...nonSetup.filter((c) => c.fault.id !== linked.fault.id)];
  }

  return [setupFaults[0]!, ...nonSetup];
}

function applySymptomOrder(
  candidates: FaultCandidate[],
  content: CoachingContent,
  symptom: string | null | undefined,
): FaultCandidate[] {
  if (!symptom) {
    return candidates;
  }
  const mapped = content.symptomMap.filter((m) => m.symptom === symptom);
  if (mapped.length === 0) {
    return candidates;
  }

  const order = new Map(mapped.map((m) => [m.fault_key, m.order]));
  const weights = new Map(mapped.map((m) => [m.fault_key, m.weight]));

  return [...candidates].sort((a, b) => {
    const orderA = order.get(a.fault.key) ?? 999;
    const orderB = order.get(b.fault.key) ?? 999;
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    const weightA = weights.get(a.fault.key) ?? 0;
    const weightB = weights.get(b.fault.key) ?? 0;
    if (weightA !== weightB) {
      return weightB - weightA;
    }
    return b.score - a.score;
  });
}

function resolveFamily(
  fault: FaultDef,
  content: CoachingContent,
): string | null {
  if (fault.family) {
    return fault.family;
  }
  for (const fam of content.faultFamilies) {
    if (fam.members.includes(fault.key)) {
      return fam.key;
    }
  }
  return null;
}

function firstGuiltyFrame(phases: SwingPhases | null | undefined): number | null {
  if (!phases) {
    return null;
  }
  if (phases.impact.valid) {
    return phases.impact.frameIndex;
  }
  if (phases.top.valid) {
    return phases.top.frameIndex;
  }
  return null;
}

function pctStanceDelta(
  prior: PriorDiagnosis | null | undefined,
  currentEvidence: DiagnosisEvidence[],
): number | null {
  if (!prior) {
    return null;
  }
  const priorKey = prior.metric_key;
  const priorValue = prior.prior_value;
  if (!priorKey || priorValue == null) {
    return null;
  }
  const current = currentEvidence.find((e) => e.metric === priorKey);
  if (!current || current.value == null) {
    return null;
  }
  return current.value - priorValue;
}

function insufficientData(content: CoachingContent, mode: DiagnosisMode): DiagnosisResult {
  return {
    outcome: "insufficient_data",
    headline_fault: INSUFFICIENT_COPY,
    fault_key: null,
    family: null,
    evidence: [],
    first_guilty_frame: null,
    protocol_id: null,
    mode,
    reasons: [
      !content.hasSignedBands ? "no published bands" : "",
      !content.hasSignedFaults ? "no published faults" : "",
    ].filter(Boolean),
    delta_pct_stance: null,
    score_internal: null,
  };
}

export function diagnose(input: DiagnoseInput): DiagnosisResult {
  const mode: DiagnosisMode =
    input.mode === "retest"
      ? "retest"
      : input.statedSymptom
        ? "problem"
        : "diagnose";

  if (!input.content.hasSignedBands || !input.content.hasSignedFaults) {
    return insufficientData(input.content, mode);
  }

  const readable = readableEvaluations(input.evaluations);
  const readableCount = Object.keys(readable).length;

  if (readableCount === 0) {
    return {
      outcome: "refuse",
      headline_fault: REFUSE_COPY,
      fault_key: null,
      family: null,
      evidence: [],
      first_guilty_frame: firstGuiltyFrame(input.phases),
      protocol_id: null,
      mode,
      reasons: ["no metric cleared confidence gate"],
      delta_pct_stance: null,
      score_internal: null,
    };
  }

  const observations = buildObservations(input);
  const faultCandidates = buildFaultCandidates(input, observations);

  if (input.mode === "retest" && input.priorDiagnosis) {
    const priorKey = input.priorDiagnosis.fault_key;
    const priorMatch = faultCandidates.find((c) => c.fault.key === priorKey);
    const evidence = priorMatch?.evidence ?? input.priorDiagnosis.evidence;
    const delta = pctStanceDelta(input.priorDiagnosis, evidence);
    const protocol = input.content.protocols.find((p) => p.fault_key === priorKey);

    if (priorMatch) {
      const family = resolveFamily(priorMatch.fault, input.content);
      return {
        outcome: "fault",
        headline_fault: input.priorDiagnosis.headline_fault,
        fault_key: priorKey,
        family,
        evidence,
        first_guilty_frame: firstGuiltyFrame(input.phases),
        protocol_id: protocol?.id ?? null,
        mode: "retest",
        reasons: [
          `retest: prior fault ${priorKey}`,
          delta !== null
            ? `delta ${delta >= 0 ? "+" : ""}${delta.toFixed(1)}% stance width`
            : "delta unavailable",
        ],
        delta_pct_stance: delta,
        score_internal: computeDialItInScore({
          evaluations: input.evaluations,
          level: input.level,
          clubFamily: input.clubFamily,
        }),
      };
    }
  }

  let ordered = applySetupPriority(faultCandidates, input.content);
  if (mode === "problem") {
    ordered = applySymptomOrder(ordered, input.content, input.statedSymptom);
  } else {
    ordered = [...ordered].sort((a, b) => {
      const tierDiff = TIER_ORDER[a.fault.tier] - TIER_ORDER[b.fault.tier];
      if (tierDiff !== 0) {
        return tierDiff;
      }
      return b.score - a.score;
    });
  }

  const top = ordered[0];

  if (!top || top.score <= 0) {
    const allInBand = Object.values(readable).every(
      (ev) => ev.status === "pass" || ev.inBand === true,
    );
    if (allInBand) {
      return {
        outcome: "dont_fix_it",
        headline_fault: DONT_FIX_COPY,
        fault_key: null,
        family: null,
        evidence: Object.entries(readable).map(([k, ev]) =>
          evidenceFromEval(k, ev),
        ),
        first_guilty_frame: firstGuiltyFrame(input.phases),
        protocol_id: null,
        mode,
        reasons: ["all readable metrics in functional range"],
        delta_pct_stance: null,
        score_internal: computeDialItInScore({
          evaluations: input.evaluations,
          level: input.level,
          clubFamily: input.clubFamily,
        }),
      };
    }

    if (mode === "problem" && input.statedSymptom) {
      return {
        outcome: "dont_fix_it",
        headline_fault: `Your body isn't doing the usual ${input.statedSymptom.replace(/_/g, " ")} things. The cause may be the face or the club, which we can't see.`,
        fault_key: null,
        family: null,
        evidence: [],
        first_guilty_frame: firstGuiltyFrame(input.phases),
        protocol_id: null,
        mode,
        reasons: ["symptom mapped causes not found"],
        delta_pct_stance: null,
        score_internal: computeDialItInScore({
          evaluations: input.evaluations,
          level: input.level,
          clubFamily: input.clubFamily,
        }),
      };
    }

    return {
      outcome: "insufficient_data",
      headline_fault: INSUFFICIENT_COPY,
      fault_key: null,
      family: null,
      evidence: [],
      first_guilty_frame: firstGuiltyFrame(input.phases),
      protocol_id: null,
      mode,
      reasons: ["no fault candidate cleared severity bar"],
      delta_pct_stance: null,
      score_internal: computeDialItInScore({
        evaluations: input.evaluations,
        level: input.level,
        clubFamily: input.clubFamily,
      }),
    };
  }

  const protocol = input.content.protocols.find(
    (p) => p.fault_key === top.fault.key,
  );
  const family = resolveFamily(top.fault, input.content);
  const voice = input.content.voice.find((v) => v.fault_key === top.fault.key);

  return {
    outcome: "fault",
    headline_fault: voice?.explanation?.trim() || top.fault.name,
    fault_key: top.fault.key,
    family,
    evidence: top.evidence,
    first_guilty_frame: firstGuiltyFrame(input.phases),
    protocol_id: protocol?.id ?? null,
    mode,
    reasons: top.observations.map((o) => o.pattern),
    delta_pct_stance: pctStanceDelta(input.priorDiagnosis, top.evidence),
    score_internal: computeDialItInScore({
      evaluations: input.evaluations,
      level: input.level,
      clubFamily: input.clubFamily,
    }),
  };
}

export {
  INSUFFICIENT_COPY,
  DONT_FIX_COPY,
  REFUSE_COPY,
};
