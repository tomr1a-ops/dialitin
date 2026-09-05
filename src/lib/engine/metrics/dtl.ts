import type { StoredAngle } from "@/lib/engine/angle";
import {
  gravityCorrectPoint,
  rollForGravityFrame,
  tiltFromVerticalDeg,
} from "@/lib/engine/gravity-frame";
import { derived, invalidDerived, type Derived } from "@/lib/engine/derived";
import {
  leadWristAtVirtualImpact,
  leadWristPosition,
  reconstructLeadWristPath,
  type LeadWristReconstruction,
} from "@/lib/engine/occlusion";
import type { SwingPhases } from "@/lib/engine/phases";
import {
  applySloMoTimingGate,
} from "@/lib/engine/metrics/timing-gate";
import {
  headLift,
  sequenceProxy,
  tempoRatio,
} from "@/lib/engine/metrics/faceOn";
import type { MetricRecord } from "@/lib/engine/metrics/types";
import { familyFromValue } from "@/lib/engine/metrics/types";
import type { ClubFamily, Handedness, ShotIntent } from "@/lib/admin/test-swings";
import {
  LEFT_ANKLE,
  LEFT_ELBOW,
  LEFT_HEEL,
  LEFT_HIP,
  LEFT_SHOULDER,
  LEFT_WRIST,
  RIGHT_ANKLE,
  RIGHT_ELBOW,
  RIGHT_HEEL,
  RIGHT_HIP,
  RIGHT_SHOULDER,
  RIGHT_WRIST,
  type PoseFrame,
} from "@/lib/pose/types";

export type { MetricRecord } from "@/lib/engine/metrics/types";

export type DtlMetricKey =
  | "spine_tilt_address"
  | "tush_line_pelvis"
  | "tush_line_family"
  | "lead_hip_clearance_impact"
  | "spine_tilt_change"
  | "head_lift_dtl"
  | "delivery_slot"
  | "tempo_ratio"
  | "sequence_proxy";

export type DtlMetrics = Record<DtlMetricKey, MetricRecord>;

export const DTL_TIMING_METRIC_KEYS = ["tempo_ratio", "sequence_proxy"] as const;

/** Hooks declared in §6.1 — observation only until diagnosis consumes them. */
export const DELIVERY_SLOT_FADE_GATE = "declared fade — OTT hook";
export const DELIVERY_SLOT_SLICE_GATE = "reported slice/block/shank — shallowing hook";
export const DELIVERY_SLOT_STEEP_DROP_GATE = "steep-then-drop — OTT hook";

export type DtlMetricsInput = {
  frames: PoseFrame[];
  normalizedFrames: PoseFrame[] | null;
  phases: SwingPhases;
  angle: StoredAngle | null;
  handedness: Handedness;
  clubFamily?: ClubFamily | null;
  intent?: ShotIntent | null;
  capturePath?: "in_app" | "native_slomo" | "upload" | "in-app" | null;
  audioTransientMs?: number | null;
  /** Hook: declared fade intent gates OTT observation. */
  declaredFade?: boolean;
  /** Hook: reported slice/block/shank gates shallowing praise. */
  reportedSliceBlockShank?: boolean;
  /** Hook: steep backswing that drops inside. */
  steepThenDrop?: boolean;
  reconstruction?: LeadWristReconstruction | null;
};

const VIS = 0.35;
const VIS_STRICT = 0.5;
const LEAD_HIP_VIS = 0.55;
const THRUST_THRESHOLD_PCT = 4;
const STAND_UP_HEAD_PCT = 5;
const STAND_UP_TILT_DEG = 4;
const QUIET_PELVIS_PCT = 3;

type SideIndices = {
  leadShoulder: number;
  trailShoulder: number;
  leadHip: number;
  trailHip: number;
  leadElbow: number;
  trailElbow: number;
  leadWrist: number;
  trailWrist: number;
  leadKnee: number;
  trailKnee: number;
  leadAnkle: number;
  trailAnkle: number;
  leadHeel: number;
  trailHeel: number;
};

function sides(handedness: Handedness): SideIndices {
  if (handedness === "left") {
    return {
      leadShoulder: RIGHT_SHOULDER,
      trailShoulder: LEFT_SHOULDER,
      leadHip: RIGHT_HIP,
      trailHip: LEFT_HIP,
      leadElbow: RIGHT_ELBOW,
      trailElbow: LEFT_ELBOW,
      leadWrist: RIGHT_WRIST,
      trailWrist: LEFT_WRIST,
      leadKnee: 26,
      trailKnee: 25,
      leadAnkle: RIGHT_ANKLE,
      trailAnkle: LEFT_ANKLE,
      leadHeel: RIGHT_HEEL,
      trailHeel: LEFT_HEEL,
    };
  }
  return {
    leadShoulder: LEFT_SHOULDER,
    trailShoulder: RIGHT_SHOULDER,
    leadHip: LEFT_HIP,
    trailHip: RIGHT_HIP,
    leadElbow: LEFT_ELBOW,
    trailElbow: RIGHT_ELBOW,
    leadWrist: LEFT_WRIST,
    trailWrist: RIGHT_WRIST,
    leadKnee: 25,
    trailKnee: 26,
    leadAnkle: LEFT_ANKLE,
    trailAnkle: RIGHT_ANKLE,
    leadHeel: LEFT_HEEL,
    trailHeel: RIGHT_HEEL,
  };
}

function joint(
  frame: PoseFrame,
  index: number,
  minVis = VIS,
): { x: number; y: number; visibility: number } | null {
  const point = frame.landmarks[index];
  if (!point || point.visibility < minVis) {
    return null;
  }
  return point;
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function frameAt(frames: PoseFrame[], index: number) {
  return frames[Math.min(Math.max(index, 0), frames.length - 1)] ?? null;
}

function midPoint(
  a: { x: number; y: number; visibility: number },
  b: { x: number; y: number; visibility: number },
) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    visibility: Math.min(a.visibility, b.visibility),
  };
}

function towardBallSign(handedness: Handedness): number {
  return handedness === "right" ? -1 : 1;
}

function caseBReason(angle: StoredAngle | null): string | null {
  if (angle?.case === "B") {
    return "uncorrected, Case B";
  }
  return null;
}

function inactiveMetric(unit: string, reason: string): MetricRecord {
  return { value: 0, unit, confidence: 0, valid: false, reason };
}

function inactiveDtlMetrics(reason: string): DtlMetrics {
  return {
    spine_tilt_address: inactiveMetric("degrees", reason),
    tush_line_pelvis: inactiveMetric("pct_stance", reason),
    tush_line_family: inactiveMetric("family_code", reason),
    lead_hip_clearance_impact: inactiveMetric("pct_stance", reason),
    spine_tilt_change: inactiveMetric("degrees", reason),
    head_lift_dtl: inactiveMetric("pct_hip_height", reason),
    delivery_slot: inactiveMetric("pct_stance", reason),
    tempo_ratio: inactiveMetric("ratio", reason),
    sequence_proxy: inactiveMetric("seconds", reason),
  };
}

function stanceWidthAtAddress(
  addressFrame: PoseFrame,
  side: SideIndices,
  normalizedAddress: PoseFrame | null,
): Derived<number> {
  if (normalizedAddress) {
    const nLead =
      joint(normalizedAddress, side.leadAnkle) ??
      joint(normalizedAddress, side.leadHeel);
    const nTrail =
      joint(normalizedAddress, side.trailAnkle) ??
      joint(normalizedAddress, side.trailHeel);
    if (nLead && nTrail) {
      const width = Math.hypot(nTrail.x - nLead.x, nTrail.y - nLead.y);
      if (width > 1e-4) {
        return derived(
          width,
          clamp01(Math.min(nLead.visibility, nTrail.visibility)),
          true,
          "face-on normalized foot span",
        );
      }
    }
  }
  const lead =
    joint(addressFrame, side.leadAnkle) ?? joint(addressFrame, side.leadHeel);
  const trail =
    joint(addressFrame, side.trailAnkle) ??
    joint(addressFrame, side.trailHeel);
  if (!lead || !trail) {
    return invalidDerived(0, "feet not visible at address");
  }
  const width = Math.hypot(trail.x - lead.x, trail.y - lead.y);
  if (width < 1e-4) {
    return invalidDerived(0, "stance width too small");
  }
  return derived(
    width,
    clamp01(Math.min(lead.visibility, trail.visibility)),
    true,
    "DTL ankle spread at address",
  );
}

function hipCenter(frame: PoseFrame, side: SideIndices) {
  const lead = joint(frame, side.leadHip);
  const trail = joint(frame, side.trailHip);
  if (!lead || !trail) {
    return null;
  }
  return midPoint(lead, trail);
}

function spineTiltDeg(
  frame: PoseFrame,
  side: SideIndices,
  rollDeg: number,
): Derived<number> | null {
  const leadSh = joint(frame, side.leadShoulder);
  const trailSh = joint(frame, side.trailShoulder);
  const hips = hipCenter(frame, side);
  if (!leadSh || !trailSh || !hips) {
    return null;
  }
  const shoulders = midPoint(leadSh, trailSh);
  const top = gravityCorrectPoint(shoulders, rollDeg);
  const bottom = gravityCorrectPoint(hips, rollDeg);
  const tilt = tiltFromVerticalDeg(top, bottom);
  return derived(
    tilt,
    clamp01(Math.min(leadSh.visibility, trailSh.visibility, hips.visibility)),
    true,
    "shoulder-mid to hip-mid vs plumb",
  );
}

export function spineTiltAddress(
  addressFrame: PoseFrame,
  side: SideIndices,
  angle: StoredAngle | null,
): MetricRecord {
  const roll = rollForGravityFrame(angle);
  const tilt = spineTiltDeg(addressFrame, side, roll);
  const caseNote = caseBReason(angle);
  if (!tilt) {
    return inactiveMetric(
      "degrees",
      caseNote ?? "shoulders or hips not visible at address",
    );
  }
  return {
    value: tilt.value,
    unit: "degrees",
    confidence: tilt.confidence,
    valid: tilt.valid,
    reason: caseNote ?? tilt.reason,
  };
}

export function spineTiltChange(
  addressFrame: PoseFrame,
  impactFrame: PoseFrame,
  side: SideIndices,
  angle: StoredAngle | null,
): MetricRecord {
  const roll = rollForGravityFrame(angle);
  const addr = spineTiltDeg(addressFrame, side, roll);
  const imp = spineTiltDeg(impactFrame, side, roll);
  const caseNote = caseBReason(angle);
  if (!addr || !imp) {
    return inactiveMetric(
      "degrees",
      caseNote ?? "spine line not visible address or impact",
    );
  }
  return {
    value: imp.value - addr.value,
    unit: "degrees",
    confidence: clamp01(Math.min(addr.confidence, imp.confidence)),
    valid: true,
    reason:
      caseNote ??
      "+ = stood farther from vertical (loss of posture)",
  };
}

function tushLineX(addressFrame: PoseFrame, side: SideIndices): number | null {
  const trailGlute = joint(addressFrame, side.trailHip, VIS_STRICT);
  return trailGlute?.x ?? null;
}

export function tushLinePelvis(
  frames: PoseFrame[],
  phases: SwingPhases,
  side: SideIndices,
  stance: Derived<number>,
  handedness: Handedness,
  angle: StoredAngle | null,
  headLiftMetric: MetricRecord,
  spineChange: MetricRecord,
): { pelvis: MetricRecord; family: MetricRecord } {
  const caseNote = caseBReason(angle);
  const addressFrame = frameAt(frames, phases.address.frameIndex);
  if (!addressFrame || !phases.address.valid || !phases.impact.valid) {
    return {
      pelvis: inactiveMetric("pct_stance", caseNote ?? "phases invalid"),
      family: inactiveMetric("family_code", caseNote ?? "phases invalid"),
    };
  }
  const lineX = tushLineX(addressFrame, side);
  const addrHip = hipCenter(addressFrame, side);
  if (lineX == null || !addrHip || !stance.valid) {
    return {
      pelvis: inactiveMetric(
        "pct_stance",
        caseNote ?? "tush line or stance not visible",
      ),
      family: inactiveMetric(
        "family_code",
        caseNote ?? "tush line or stance not visible",
      ),
    };
  }

  const sign = towardBallSign(handedness);
  const addrDepth = (addrHip.x - lineX) * sign;
  let maxTowardBall = 0;
  let bestConf = addrHip.visibility;
  const start = phases.address.frameIndex;
  const end = phases.impact.frameIndex;
  for (let i = start; i <= end; i++) {
    const frame = frameAt(frames, i);
    const hips = frame ? hipCenter(frame, side) : null;
    if (!hips) {
      continue;
    }
    const depth = (hips.x - lineX) * sign;
    const deltaTowardBall = depth - addrDepth;
    const pct = (deltaTowardBall / stance.value) * 100;
    if (pct > maxTowardBall) {
      maxTowardBall = pct;
      bestConf = Math.min(bestConf, hips.visibility);
    }
  }

  const thrust = maxTowardBall >= THRUST_THRESHOLD_PCT;
  const standUp =
    headLiftMetric.valid &&
    headLiftMetric.value >= STAND_UP_HEAD_PCT &&
    spineChange.valid &&
    spineChange.value >= STAND_UP_TILT_DEG &&
    maxTowardBall < QUIET_PELVIS_PCT;

  let familyCode = 0;
  let familyLabel = "clean";
  if (thrust && standUp) {
    familyCode = 3;
    familyLabel = "both";
  } else if (thrust) {
    familyCode = 1;
    familyLabel = "thrust";
  } else if (standUp) {
    familyCode = 2;
    familyLabel = "stand_up";
  }

  return {
    pelvis: {
      value: maxTowardBall,
      unit: "pct_stance",
      confidence: clamp01(bestConf * stance.confidence),
      valid: true,
      reason:
        caseNote ??
        `+ = pelvis toward ball vs vertical tush line; family=${familyLabel}`,
    },
    family: {
      value: familyCode,
      unit: "family_code",
      confidence: clamp01(bestConf),
      valid: true,
      reason: familyLabel,
    },
  };
}

export function leadHipClearanceImpact(
  addressFrame: PoseFrame,
  impactFrame: PoseFrame,
  side: SideIndices,
  stance: Derived<number>,
  handedness: Handedness,
  tushPelvis: MetricRecord,
): MetricRecord {
  void tushPelvis;
  const lineX = tushLineX(addressFrame, side);
  const leadHip = joint(impactFrame, side.leadHip, LEAD_HIP_VIS);
  if (lineX == null || !leadHip || !stance.valid) {
    return inactiveMetric(
      "pct_stance",
      "lead hip not visible at impact — cannot confirm rotation",
    );
  }
  const sign = towardBallSign(handedness);
  const depth = (leadHip.x - lineX) * sign;
  const pct = (depth / stance.value) * 100;
  const reason =
    "+ = lead hip held/exceeded tush depth; low-confidence never vetoes clean tush read";
  if (leadHip.visibility < LEAD_HIP_VIS) {
    return {
      value: pct,
      unit: "pct_stance",
      confidence: clamp01(leadHip.visibility * 0.5),
      valid: false,
      reason: "low-confidence clearance — does not veto clean tush-line read",
    };
  }
  return {
    value: pct,
    unit: "pct_stance",
    confidence: clamp01(leadHip.visibility * stance.confidence),
    valid: true,
    reason,
  };
}

function wristForFrame(
  frames: PoseFrame[],
  side: SideIndices,
  frameIndex: number,
  reconstruction: LeadWristReconstruction | null,
): { x: number; y: number } | null {
  const recon = reconstruction
    ? leadWristPosition(reconstruction, frameIndex)
    : null;
  if (recon) {
    return { x: recon.x, y: recon.y };
  }
  const frame = frameAt(frames, frameIndex);
  const wrist = frame ? joint(frame, side.leadWrist, 0.55) : null;
  return wrist ? { x: wrist.x, y: wrist.y } : null;
}

function nearestBackswingPoint(
  backswing: Array<{ x: number; y: number; t: number }>,
  x: number,
  y: number,
): { dx: number; dy: number; dist: number } | null {
  if (backswing.length === 0) {
    return null;
  }
  let best = backswing[0]!;
  let bestDist = Infinity;
  for (const point of backswing) {
    const d = Math.hypot(point.x - x, point.y - y);
    if (d < bestDist) {
      bestDist = d;
      best = point;
    }
  }
  return { dx: x - best.x, dy: y - best.y, dist: bestDist };
}

export function deliverySlot(
  frames: PoseFrame[],
  phases: SwingPhases,
  side: SideIndices,
  stance: Derived<number>,
  handedness: Handedness,
  angle: StoredAngle | null,
  reconstruction: LeadWristReconstruction | null,
  hooks: {
    declaredFade?: boolean;
    reportedSliceBlockShank?: boolean;
    steepThenDrop?: boolean;
  },
): MetricRecord {
  void handedness;
  const caseNote = caseBReason(angle);
  if (
    !phases.top.valid ||
    !phases.impact.valid ||
    !stance.valid
  ) {
    return inactiveMetric("pct_stance", caseNote ?? "phases or stance invalid");
  }

  const topIdx = phases.top.frameIndex;
  const impactIdx = phases.impact.frameIndex;
  const addressIdx = phases.address.frameIndex;

  const backswing: Array<{ x: number; y: number; t: number }> = [];
  for (let i = addressIdx; i <= topIdx; i++) {
    const wrist = wristForFrame(frames, side, i, reconstruction);
    if (wrist) {
      backswing.push({ ...wrist, t: i });
    }
  }
  if (backswing.length < 2) {
    return inactiveMetric(
      "pct_stance",
      caseNote ?? "backswing wrist path not visible",
    );
  }

  const hipY =
    hipCenter(frameAt(frames, topIdx)!, side)?.y ??
    hipCenter(frameAt(frames, addressIdx)!, side)?.y;
  if (hipY == null) {
    return inactiveMetric("pct_stance", caseNote ?? "hip height unknown");
  }

  let handsAtHipIdx = topIdx;
  for (let i = topIdx; i <= impactIdx; i++) {
    const wrist = wristForFrame(frames, side, i, reconstruction);
    if (wrist && wrist.y >= hipY - 0.04) {
      handsAtHipIdx = i;
      break;
    }
  }
  if (handsAtHipIdx <= topIdx && topIdx + 1 <= impactIdx) {
    handsAtHipIdx = Math.min(topIdx + 3, impactIdx);
  }

  let sumOffset = 0;
  let count = 0;
  for (let i = topIdx + 1; i <= handsAtHipIdx; i++) {
    const wrist = wristForFrame(frames, side, i, reconstruction);
    if (!wrist) {
      continue;
    }
    const nearest = nearestBackswingPoint(backswing, wrist.x, wrist.y);
    if (!nearest) {
      continue;
    }
    const outside = nearest.dx;
    sumOffset += outside;
    count += 1;
  }

  if (count === 0) {
    return inactiveMetric(
      "pct_stance",
      caseNote ?? "downswing wrist path not visible",
    );
  }

  const avgOffsetPx = sumOffset / count;
  const pct = (avgOffsetPx / stance.value) * 100;
  const hooksApplied: string[] = [];
  if (hooks.declaredFade) {
    hooksApplied.push(DELIVERY_SLOT_FADE_GATE);
  }
  if (hooks.reportedSliceBlockShank) {
    hooksApplied.push(DELIVERY_SLOT_SLICE_GATE);
  }
  if (hooks.steepThenDrop) {
    hooksApplied.push(DELIVERY_SLOT_STEEP_DROP_GATE);
  }

  let reason =
    "+ = downswing above/outside backswing path (OTT observation); − = shallowing";
  if (hooksApplied.length > 0) {
    reason += `; hooks: ${hooksApplied.join(", ")}`;
  }
  if (caseNote) {
    reason = `${caseNote}; ${reason}`;
  }

  return {
    value: pct,
    unit: "pct_stance",
    confidence: clamp01(stance.confidence * 0.75),
    valid: true,
    reason,
  };
}

export function computeDtlMetrics(input: DtlMetricsInput): DtlMetrics {
  const {
    frames,
    normalizedFrames,
    phases,
    angle,
    handedness,
    clubFamily,
    intent,
    capturePath,
    audioTransientMs,
    declaredFade,
    reportedSliceBlockShank,
    steepThenDrop,
  } = input;

  const classification = angle?.classification.value;
  if (!angle?.valid || classification !== "dtl") {
    const reason =
      classification === "refuse"
        ? "angle refused"
        : classification === "face_on"
          ? "face-on clip — DTL metrics not computed"
          : "DTL angle required";
    return inactiveDtlMetrics(reason);
  }

  if (
    !phases.address.valid ||
    !phases.top.valid ||
    !phases.impact.valid
  ) {
    return inactiveDtlMetrics("address, top, or impact invalid");
  }

  const side = sides(handedness);
  const addressFrame = frameAt(frames, phases.address.frameIndex)!;
  const impactFrame = frameAt(frames, phases.impact.frameIndex)!;
  const normalizedAddress =
    normalizedFrames && normalizedFrames.length === frames.length
      ? frameAt(normalizedFrames, phases.address.frameIndex)
      : null;

  const stance = stanceWidthAtAddress(addressFrame, side, normalizedAddress);
  const reconstruction =
    input.reconstruction ??
    reconstructLeadWristPath({
      frames,
      phases,
      handedness,
      capturePath:
        capturePath === "in-app"
          ? "in-app"
          : capturePath === "in_app"
            ? "in_app"
            : capturePath === "native_slomo"
              ? "native_slomo"
              : "upload",
      audioTransientMs,
    });

  const spineAddr = spineTiltAddress(addressFrame, side, angle);
  const spineChange = spineTiltChange(
    addressFrame,
    impactFrame,
    side,
    angle,
  );
  const headLiftDtl = headLift(addressFrame, impactFrame, side);
  const tush = tushLinePelvis(
    frames,
    phases,
    side,
    stance,
    handedness,
    angle,
    headLiftDtl,
    spineChange,
  );
  const clearance = leadHipClearanceImpact(
    addressFrame,
    impactFrame,
    side,
    stance,
    handedness,
    tush.pelvis,
  );
  const slot = deliverySlot(
    frames,
    phases,
    side,
    stance,
    handedness,
    angle,
    reconstruction,
    { declaredFade, reportedSliceBlockShank, steepThenDrop },
  );

  const working =
    normalizedFrames && normalizedFrames.length === frames.length
      ? normalizedFrames
      : frames;

  return applySloMoTimingGate(
    {
      spine_tilt_address: spineAddr,
      tush_line_pelvis: tush.pelvis,
      tush_line_family: tush.family,
      lead_hip_clearance_impact: clearance,
      spine_tilt_change: spineChange,
      head_lift_dtl: {
        ...headLiftDtl,
        reason: caseBReason(angle) ?? headLiftDtl.reason,
      },
      delivery_slot: slot,
      tempo_ratio: tempoRatio(phases, clubFamily, intent),
      sequence_proxy: sequenceProxy(working, phases, side),
    },
    phases,
    DTL_TIMING_METRIC_KEYS,
  );
}

export function dtlMetricsFromUnknown(value: unknown): DtlMetrics | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const keys: DtlMetricKey[] = [
    "spine_tilt_address",
    "tush_line_pelvis",
    "tush_line_family",
    "lead_hip_clearance_impact",
    "spine_tilt_change",
    "head_lift_dtl",
    "delivery_slot",
    "tempo_ratio",
    "sequence_proxy",
  ];
  const record = value as Record<string, MetricRecord>;
  for (const key of keys) {
    const metric = record[key];
    if (
      !metric ||
      typeof metric.value !== "number" ||
      typeof metric.unit !== "string"
    ) {
      return null;
    }
  }
  return record as DtlMetrics;
}

export { familyFromValue, leadWristAtVirtualImpact };
