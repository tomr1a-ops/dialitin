import type { StoredAngle } from "@/lib/engine/angle";
import { derived, invalidDerived, type Derived } from "@/lib/engine/derived";
import type { SwingPhases } from "@/lib/engine/phases";
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

/** Sec 6.1 — every stored metric is a record, never a bare number. */
export type MetricRecord = {
  value: number;
  unit: string;
  confidence: number;
  valid: boolean;
  reason: string | null;
};

export type FaceOnMetricKey =
  | "shoulder_rotation_top"
  | "hip_rotation_top"
  | "trail_knee_flexion_change"
  | "hip_sway_back"
  | "hip_slide_down"
  | "head_sway"
  | "head_lift"
  | "weight_transfer_proxy"
  | "width_at_top"
  | "lead_elbow_separation"
  | "sequence_proxy"
  | "tempo_ratio"
  | "ball_position_inferred";

export type FaceOnMetrics = Record<FaceOnMetricKey, MetricRecord>;

export type FaceOnMetricsInput = {
  frames: PoseFrame[];
  normalizedFrames: PoseFrame[] | null;
  phases: SwingPhases;
  angle: StoredAngle | null;
  handedness: Handedness;
  clubFamily?: ClubFamily | null;
  intent?: ShotIntent | null;
  /** Hook: alignment setup candidate (open/closed stance) gates ball position. */
  alignmentSetupCandidate?: boolean;
};

const NOSE = 0;
const LEFT_EAR = 7;
const RIGHT_EAR = 8;
const LEFT_KNEE = 25;
const RIGHT_KNEE = 26;

const VIS = 0.35;
const VIS_STRICT = 0.5;

/** Hook: projected hip rotation above this normalized value flags over-rotation. */
export const HIP_ROTATION_UPPER_BOUND = 1.35;

/** Hook: width ratio below this may widen tolerance for compact backswings. */
export const WIDTH_AT_TOP_COMPACT_THRESHOLD = 0.82;

const MIN_TEMPO_FPS = 12;

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
      leadKnee: RIGHT_KNEE,
      trailKnee: LEFT_KNEE,
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
    leadKnee: LEFT_KNEE,
    trailKnee: RIGHT_KNEE,
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

function wrapPi(rad: number) {
  let value = rad;
  while (value > Math.PI) {
    value -= 2 * Math.PI;
  }
  while (value < -Math.PI) {
    value += 2 * Math.PI;
  }
  return value;
}

function metricFromDerived(
  record: Derived<number>,
  unit: string,
  reasonOverride?: string | null,
): MetricRecord {
  return {
    value: record.value,
    unit,
    confidence: record.confidence,
    valid: record.valid,
    reason: reasonOverride ?? record.reason,
  };
}

function addressAspect(
  frame: PoseFrame,
  side: SideIndices,
): Derived<number> {
  const lead = joint(frame, side.leadShoulder);
  const trail = joint(frame, side.trailShoulder);
  const leadHip = joint(frame, side.leadHip);
  const trailHip = joint(frame, side.trailHip);
  if (!lead || !trail || !leadHip || !trailHip) {
    return invalidDerived(0, "shoulders or hips not visible at address");
  }
  const shoulderWidth = Math.hypot(trail.x - lead.x, trail.y - lead.y);
  const midShoulder = { x: (lead.x + trail.x) / 2, y: (lead.y + trail.y) / 2 };
  const midHip = { x: (leadHip.x + trailHip.x) / 2, y: (leadHip.y + trailHip.y) / 2 };
  const torsoLen = Math.hypot(
    midShoulder.x - midHip.x,
    midShoulder.y - midHip.y,
  );
  if (torsoLen < 1e-4) {
    return invalidDerived(0, "torso length too small at address");
  }
  const lambda = shoulderWidth / torsoLen;
  const vis = Math.min(lead.visibility, trail.visibility, leadHip.visibility, trailHip.visibility);
  return derived(lambda, clamp01(vis), true, "shoulder width ÷ hip-to-shoulder length");
}

function lineOrientation(
  lead: { x: number; y: number },
  trail: { x: number; y: number },
) {
  return Math.atan2(lead.y - trail.y, lead.x - trail.x);
}

function projectedRotationAtPhase(
  addressFrame: PoseFrame,
  phaseFrame: PoseFrame,
  side: SideIndices,
  leadIndex: number,
  trailIndex: number,
  aspect: Derived<number>,
): Derived<number> {
  if (!aspect.valid) {
    return invalidDerived(0, aspect.reason ?? "address aspect invalid");
  }
  const addrLead = joint(addressFrame, leadIndex);
  const addrTrail = joint(addressFrame, trailIndex);
  const phaseLead = joint(phaseFrame, leadIndex);
  const phaseTrail = joint(phaseFrame, trailIndex);
  if (!addrLead || !addrTrail || !phaseLead || !phaseTrail) {
    return invalidDerived(0, "line joints not visible");
  }
  const addrAngle = lineOrientation(addrLead, addrTrail);
  const phaseAngle = lineOrientation(phaseLead, phaseTrail);
  const delta = wrapPi(phaseAngle - addrAngle);
  const normalized = Math.abs(delta) * aspect.value;
  const vis = Math.min(
    addrLead.visibility,
    addrTrail.visibility,
    phaseLead.visibility,
    phaseTrail.visibility,
  );
  return derived(
    normalized,
    clamp01(vis * aspect.confidence),
    true,
    "normalized projected rotation in image space",
  );
}

function stanceWidthAtAddress(
  addressFrame: PoseFrame,
  side: SideIndices,
): Derived<number> {
  const lead =
    joint(addressFrame, side.leadAnkle) ??
    joint(addressFrame, side.leadHeel);
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
    "lead-to-trail foot span at address",
  );
}

function hipCenter(frame: PoseFrame, side: SideIndices) {
  const lead = joint(frame, side.leadHip);
  const trail = joint(frame, side.trailHip);
  if (!lead || !trail) {
    return null;
  }
  return {
    x: (lead.x + trail.x) / 2,
    y: (lead.y + trail.y) / 2,
    visibility: Math.min(lead.visibility, trail.visibility),
  };
}

function headPoint(frame: PoseFrame) {
  const nose = joint(frame, NOSE);
  const leftEar = joint(frame, LEFT_EAR);
  const rightEar = joint(frame, RIGHT_EAR);
  if (leftEar && rightEar) {
    return {
      x: (leftEar.x + rightEar.x) / 2,
      y: (leftEar.y + rightEar.y) / 2,
      visibility: Math.min(leftEar.visibility, rightEar.visibility),
    };
  }
  return nose;
}

function bodyHeightAtAddress(addressFrame: PoseFrame, side: SideIndices) {
  const head = headPoint(addressFrame);
  const hips = hipCenter(addressFrame, side);
  if (!head || !hips) {
    return invalidDerived(0, "head or hips not visible at address");
  }
  const height = Math.abs(head.y - hips.y);
  if (height < 1e-4) {
    return invalidDerived(0, "body height too small");
  }
  return derived(
    height,
    clamp01(Math.min(head.visibility, hips.visibility)),
    true,
    "hip midpoint to head at address",
  );
}

/** Positive lateral = toward trail side (away from target for RH face-on). */
function lateralPctStance(
  deltaX: number,
  stance: Derived<number>,
): Derived<number> {
  if (!stance.valid) {
    return invalidDerived(0, stance.reason ?? "stance width invalid");
  }
  return derived((deltaX / stance.value) * 100, stance.confidence, true, null);
}

function kneeFlexion(
  frame: PoseFrame,
  hip: number,
  knee: number,
  ankle: number,
): Derived<number> | null {
  const h = joint(frame, hip);
  const k = joint(frame, knee);
  const a = joint(frame, ankle);
  if (!h || !k || !a) {
    return null;
  }
  const v1x = h.x - k.x;
  const v1y = h.y - k.y;
  const v2x = a.x - k.x;
  const v2y = a.y - k.y;
  const dot = v1x * v2x + v1y * v2y;
  const m1 = Math.hypot(v1x, v1y);
  const m2 = Math.hypot(v2x, v2y);
  if (m1 < 1e-6 || m2 < 1e-6) {
    return null;
  }
  const angle = Math.acos(clamp01(dot / (m1 * m2)));
  const vis = Math.min(h.visibility, k.visibility, a.visibility);
  return derived(angle, clamp01(vis), true, "hip-knee-ankle interior angle");
}

function frameAt(frames: PoseFrame[], index: number) {
  return frames[Math.min(Math.max(index, 0), frames.length - 1)] ?? null;
}

function angularVelocitySeries(
  frames: PoseFrame[],
  from: number,
  to: number,
  side: SideIndices,
  leadIndex: number,
  trailIndex: number,
) {
  const series: Array<{ timeMs: number; omega: number }> = [];
  for (let i = from + 1; i <= to; i++) {
    const prev = frameAt(frames, i - 1);
    const cur = frameAt(frames, i);
    if (!prev || !cur) {
      continue;
    }
    const prevLead = joint(prev, leadIndex);
    const prevTrail = joint(prev, trailIndex);
    const curLead = joint(cur, leadIndex);
    const curTrail = joint(cur, trailIndex);
    if (!prevLead || !prevTrail || !curLead || !curTrail) {
      continue;
    }
    const dt = (cur.mediaTime - prev.mediaTime) * 1000;
    if (dt <= 0) {
      continue;
    }
    const prevAngle = lineOrientation(prevLead, prevTrail);
    const curAngle = lineOrientation(curLead, curTrail);
    const omega = wrapPi(curAngle - prevAngle) / dt;
    series.push({ timeMs: cur.mediaTime * 1000, omega: Math.abs(omega) });
  }
  return series;
}

function peakTime(series: Array<{ timeMs: number; omega: number }>) {
  if (series.length === 0) {
    return null;
  }
  let best = series[0]!;
  for (const sample of series) {
    if (sample.omega > best.omega) {
      best = sample;
    }
  }
  return best;
}

function swayGateReason(
  trailKneeChange: Derived<number>,
  hipSway: Derived<number>,
): string | null {
  if (!trailKneeChange.valid || !hipSway.valid) {
    return null;
  }
  const straightening = trailKneeChange.value < -0.08;
  const swayish = Math.abs(hipSway.value) > 8;
  if (straightening && swayish) {
    return "trail-knee gate: lateral hip move with straightening trail knee may be sway";
  }
  return null;
}

function rotationGateReason(
  trailKneeChange: Derived<number>,
  hipRotation: Derived<number>,
  hipSway: Derived<number>,
): string | null {
  if (!trailKneeChange.valid || !hipRotation.valid) {
    return null;
  }
  const straightening = trailKneeChange.value < -0.08;
  const bigTurn = hipRotation.value > 0.55;
  const swayish = hipSway.valid && Math.abs(hipSway.value) > 8;
  if (straightening && (bigTurn || swayish)) {
    return "trail-knee gate: projected turn with straightening trail knee may be sway";
  }
  return null;
}

export function shoulderRotationTop(
  addressFrame: PoseFrame,
  topFrame: PoseFrame,
  side: SideIndices,
  aspect: Derived<number>,
): MetricRecord {
  const record = projectedRotationAtPhase(
    addressFrame,
    topFrame,
    side,
    side.leadShoulder,
    side.trailShoulder,
    aspect,
  );
  return metricFromDerived(record, "normalized_rotation");
}

export function hipRotationTop(
  addressFrame: PoseFrame,
  topFrame: PoseFrame,
  side: SideIndices,
  aspect: Derived<number>,
  trailKneeChange: Derived<number>,
  hipSwayBack: Derived<number>,
): MetricRecord {
  const record = projectedRotationAtPhase(
    addressFrame,
    topFrame,
    side,
    side.leadHip,
    side.trailHip,
    aspect,
  );
  if (!record.valid) {
    return metricFromDerived(record, "normalized_rotation");
  }
  const gate = rotationGateReason(trailKneeChange, record, hipSwayBack);
  let reason = record.reason;
  let confidence = record.confidence;
  if (record.value > HIP_ROTATION_UPPER_BOUND) {
    reason = `upper-bound hook: projected rotation ${record.value.toFixed(3)} exceeds ${HIP_ROTATION_UPPER_BOUND}`;
    confidence = Math.min(confidence, 0.75);
  }
  if (gate) {
    reason = gate;
    confidence = Math.min(confidence, 0.55);
  }
  return {
    value: record.value,
    unit: "normalized_rotation",
    confidence,
    valid: true,
    reason,
  };
}

export function trailKneeFlexionChange(
  addressFrame: PoseFrame,
  topFrame: PoseFrame,
  side: SideIndices,
): MetricRecord {
  const addr = kneeFlexion(
    addressFrame,
    side.trailHip,
    side.trailKnee,
    side.trailAnkle,
  );
  const top = kneeFlexion(
    topFrame,
    side.trailHip,
    side.trailKnee,
    side.trailAnkle,
  );
  if (!addr || !top) {
    return {
      value: 0,
      unit: "normalized_rotation",
      confidence: 0,
      valid: false,
      reason: "trail knee chain not visible",
    };
  }
  const delta = top.value - addr.value;
  const confidence = clamp01(Math.min(addr.confidence, top.confidence));
  return {
    value: delta,
    unit: "normalized_rotation",
    confidence,
    valid: true,
    reason: "address→top flexion change; gates hip rotation and sway",
  };
}

export function hipSwayBack(
  addressFrame: PoseFrame,
  topFrame: PoseFrame,
  side: SideIndices,
  stance: Derived<number>,
  trailKneeChange: Derived<number>,
): MetricRecord {
  const addrHip = hipCenter(addressFrame, side);
  const topHip = hipCenter(topFrame, side);
  if (!addrHip || !topHip) {
    return {
      value: 0,
      unit: "pct_stance",
      confidence: 0,
      valid: false,
      reason: "hips not visible",
    };
  }
  const deltaX = topHip.x - addrHip.x;
  const record = lateralPctStance(deltaX, stance);
  const gate = swayGateReason(trailKneeChange, record);
  return {
    value: record.value,
    unit: "pct_stance",
    confidence: clamp01(Math.min(record.confidence, addrHip.visibility, topHip.visibility)),
    valid: record.valid,
    reason: gate ?? "+ toward trail / − toward lead vs address at top",
  };
}

export function hipSlideDown(
  addressFrame: PoseFrame,
  impactFrame: PoseFrame,
  side: SideIndices,
  stance: Derived<number>,
): MetricRecord {
  const addrHip = hipCenter(addressFrame, side);
  const impactHip = hipCenter(impactFrame, side);
  if (!addrHip || !impactHip) {
    return {
      value: 0,
      unit: "pct_stance",
      confidence: 0,
      valid: false,
      reason: "hips not visible",
    };
  }
  const deltaX = impactHip.x - addrHip.x;
  const record = lateralPctStance(deltaX, stance);
  return {
    value: record.value,
    unit: "pct_stance",
    confidence: clamp01(
      Math.min(record.confidence, addrHip.visibility, impactHip.visibility),
    ),
    valid: record.valid,
    reason: "+ toward trail / − toward lead vs address at impact",
  };
}

export function headSway(
  addressFrame: PoseFrame,
  topFrame: PoseFrame,
  side: SideIndices,
  stance: Derived<number>,
): MetricRecord {
  void side;
  const addrHead = headPoint(addressFrame);
  const topHead = headPoint(topFrame);
  if (!addrHead || !topHead) {
    return {
      value: 0,
      unit: "pct_stance",
      confidence: 0,
      valid: false,
      reason: "head not visible",
    };
  }
  const deltaX = topHead.x - addrHead.x;
  const record = lateralPctStance(deltaX, stance);
  return {
    value: record.value,
    unit: "pct_stance",
    confidence: clamp01(
      Math.min(record.confidence, addrHead.visibility, topHead.visibility),
    ),
    valid: record.valid,
    reason: "lateral only; separate from head lift",
  };
}

export function headLift(
  addressFrame: PoseFrame,
  impactFrame: PoseFrame,
  side: SideIndices,
): MetricRecord {
  void side;
  const bodyHeight = bodyHeightAtAddress(addressFrame, side);
  const addrHead = headPoint(addressFrame);
  const impactHead = headPoint(impactFrame);
  if (!bodyHeight.valid || !addrHead || !impactHead) {
    return {
      value: 0,
      unit: "pct_hip_height",
      confidence: 0,
      valid: false,
      reason: "head or body height not visible at address",
    };
  }
  const lift = addrHead.y - impactHead.y;
  const pct = (lift / bodyHeight.value) * 100;
  return {
    value: pct,
    unit: "pct_hip_height",
    confidence: clamp01(
      Math.min(bodyHeight.confidence, addrHead.visibility, impactHead.visibility),
    ),
    valid: true,
    reason: "+ = head rose vs address (image y decreases)",
  };
}

export function weightTransferProxy(
  addressFrame: PoseFrame,
  impactFrame: PoseFrame,
  side: SideIndices,
  stance: Derived<number>,
): MetricRecord {
  const impactHip = hipCenter(impactFrame, side);
  const lead =
    joint(impactFrame, side.leadAnkle) ??
    joint(impactFrame, side.leadHeel);
  const trail =
    joint(impactFrame, side.trailAnkle) ??
    joint(impactFrame, side.trailHeel);
  if (!impactHip || !lead || !trail || !stance.valid) {
    return {
      value: 0,
      unit: "pct_stance",
      confidence: 0,
      valid: false,
      reason: "hips or feet not visible at impact",
    };
  }
  const feetMidX = (lead.x + trail.x) / 2;
  const offset = impactHip.x - feetMidX;
  const record = lateralPctStance(offset, stance);
  return {
    value: record.value,
    unit: "pct_stance",
    confidence: clamp01(Math.min(record.confidence, impactHip.visibility)),
    valid: record.valid,
    reason:
      "cannot see pressure — hip center vs feet midpoint at impact; many hanging-back looks are lead-side pressure with a quiet pelvis",
  };
}

export function widthAtTop(
  addressFrame: PoseFrame,
  topFrame: PoseFrame,
  side: SideIndices,
): MetricRecord {
  const addrLead = joint(addressFrame, side.leadShoulder);
  const addrWrist = joint(addressFrame, side.leadWrist);
  const topLead = joint(topFrame, side.leadShoulder);
  const topWrist = joint(topFrame, side.leadWrist);
  if (!addrLead || !addrWrist || !topLead || !topWrist) {
    return {
      value: 0,
      unit: "ratio",
      confidence: 0,
      valid: false,
      reason: "lead shoulder or wrist not visible",
    };
  }
  const addrWidth = Math.hypot(
    addrWrist.x - addrLead.x,
    addrWrist.y - addrLead.y,
  );
  const topWidth = Math.hypot(
    topWrist.x - topLead.x,
    topWrist.y - topLead.y,
  );
  if (addrWidth < 1e-4) {
    return {
      value: 0,
      unit: "ratio",
      confidence: 0,
      valid: false,
      reason: "address lead-arm width too small",
    };
  }
  const ratio = topWidth / addrWidth;
  const confidence = clamp01(
    Math.min(
      addrLead.visibility,
      addrWrist.visibility,
      topLead.visibility,
      topWrist.visibility,
    ),
  );
  let reason: string | null = "lead shoulder–wrist span top ÷ address";
  if (ratio < WIDTH_AT_TOP_COMPACT_THRESHOLD) {
    reason = `compact-backswing hook: ratio ${ratio.toFixed(3)} below ${WIDTH_AT_TOP_COMPACT_THRESHOLD}`;
  }
  return { value: ratio, unit: "ratio", confidence, valid: true, reason };
}

export function leadElbowSeparation(
  frames: PoseFrame[],
  phases: SwingPhases,
  side: SideIndices,
): MetricRecord {
  const fps = phases.effectiveFrameRate;
  if (!fps.valid || fps.value < 60) {
    return {
      value: 0,
      unit: "pct_stance",
      confidence: 0,
      valid: false,
      reason: "fps",
    };
  }
  const impactIdx = phases.impact.frameIndex;
  const finishIdx = phases.finish.frameIndex;
  const addressFrame = frameAt(frames, phases.address.frameIndex);
  if (!addressFrame) {
    return {
      value: 0,
      unit: "pct_stance",
      confidence: 0,
      valid: false,
      reason: "no address frame",
    };
  }
  const stance = stanceWidthAtAddress(addressFrame, side);
  if (!stance.valid) {
    return {
      value: 0,
      unit: "pct_stance",
      confidence: 0,
      valid: false,
      reason: stance.reason,
    };
  }

  let bestSep = 0;
  let bestVis = 0;
  let found = false;

  for (let i = impactIdx; i <= finishIdx; i++) {
    const frame = frameAt(frames, i);
    if (!frame) {
      continue;
    }
    const shoulder = joint(frame, side.leadShoulder, VIS_STRICT);
    const hip = joint(frame, side.leadHip, VIS_STRICT);
    const elbow = joint(frame, side.leadElbow, VIS_STRICT);
    const wrist = joint(frame, side.leadWrist, VIS_STRICT);
    if (!shoulder || !hip || !elbow || !wrist) {
      continue;
    }
    const armDy = Math.abs(wrist.y - elbow.y);
    const armDx = Math.abs(wrist.x - elbow.x);
    if (armDy > armDx * 0.85) {
      continue;
    }
    const torsoDx = shoulder.x - hip.x;
    const torsoDy = shoulder.y - hip.y;
    const len = Math.hypot(torsoDx, torsoDy);
    if (len < 1e-4) {
      continue;
    }
    const relX = elbow.x - hip.x;
    const relY = elbow.y - hip.y;
    const perp = Math.abs(relX * torsoDy - relY * torsoDx) / len;
    const pct = (perp / stance.value) * 100;
    const vis = Math.min(
      shoulder.visibility,
      hip.visibility,
      elbow.visibility,
      wrist.visibility,
    );
    if (pct > bestSep) {
      bestSep = pct;
      bestVis = vis;
      found = true;
    }
  }

  if (!found) {
    return {
      value: 0,
      unit: "pct_stance",
      confidence: 0,
      valid: false,
      reason: "lead arm parallel window not visible",
    };
  }

  return {
    value: bestSep,
    unit: "pct_stance",
    confidence: clamp01(bestVis),
    valid: true,
    reason: "max elbow–torso separation impact→lead-arm parallel",
  };
}

export function sequenceProxy(
  frames: PoseFrame[],
  phases: SwingPhases,
  side: SideIndices,
): MetricRecord {
  const topIdx = phases.top.frameIndex;
  const impactIdx = phases.impact.frameIndex;
  if (!phases.top.valid || !phases.impact.valid || topIdx >= impactIdx) {
    return {
      value: 0,
      unit: "seconds",
      confidence: 0,
      valid: false,
      reason: "top or impact invalid",
    };
  }
  const hipSeries = angularVelocitySeries(
    frames,
    topIdx,
    impactIdx,
    side,
    side.leadHip,
    side.trailHip,
  );
  const shoulderSeries = angularVelocitySeries(
    frames,
    topIdx,
    impactIdx,
    side,
    side.leadShoulder,
    side.trailShoulder,
  );
  const hipPeak = peakTime(hipSeries);
  const shoulderPeak = peakTime(shoulderSeries);
  if (!hipPeak || !shoulderPeak) {
    return {
      value: 0,
      unit: "seconds",
      confidence: 0,
      valid: false,
      reason: "could not find downswing angular-velocity peaks",
    };
  }
  const deltaMs = shoulderPeak.timeMs - hipPeak.timeMs;
  const confidence = clamp01(
    Math.min(hipSeries.length, shoulderSeries.length) / 8,
  );
  return {
    value: deltaMs / 1000,
    unit: "seconds",
    confidence,
    valid: true,
    reason: "shoulder peak minus hip peak; negative = hips lead",
  };
}

export function tempoRatio(
  phases: SwingPhases,
  clubFamily?: ClubFamily | null,
  intent?: ShotIntent | null,
): MetricRecord {
  if (
    !phases.takeaway.valid ||
    !phases.top.valid ||
    !phases.impact.valid ||
    !phases.effectiveFrameRate.valid ||
    phases.effectiveFrameRate.value < MIN_TEMPO_FPS
  ) {
    return {
      value: 0,
      unit: "ratio",
      confidence: 0,
      valid: false,
      reason: "phases or timestamps invalid",
    };
  }
  const backswingMs = phases.top.timeMs - phases.takeaway.timeMs;
  const downswingMs = phases.impact.timeMs - phases.top.timeMs;
  if (backswingMs <= 0 || downswingMs <= 0) {
    return {
      value: 0,
      unit: "ratio",
      confidence: 0,
      valid: false,
      reason: "non-positive segment duration",
    };
  }
  const ratio = backswingMs / downswingMs;
  let reason: string | null = "takeaway→top ÷ top→impact from timestamps";
  if (clubFamily === "wedge" || (intent && intent !== "stock")) {
    reason = `club/intent band-widening hook: ${clubFamily ?? "club"} / ${intent ?? "intent"}`;
  }
  return {
    value: ratio,
    unit: "ratio",
    confidence: clamp01(phases.effectiveFrameRate.confidence),
    valid: true,
    reason,
  };
}

export function ballPositionInferred(
  addressFrame: PoseFrame,
  side: SideIndices,
  alignmentSetupCandidate = false,
): MetricRecord {
  const leadHeel = joint(addressFrame, side.leadHeel);
  const trailHeel = joint(addressFrame, side.trailHeel);
  const leadWrist = joint(addressFrame, side.leadWrist);
  const trailWrist = joint(addressFrame, side.trailWrist);
  if (!leadHeel || !trailHeel || (!leadWrist && !trailWrist)) {
    return {
      value: 0,
      unit: "pct_stance",
      confidence: 0,
      valid: false,
      reason: "inferred, not seen",
    };
  }
  const handX =
    leadWrist && trailWrist
      ? (leadWrist.x + trailWrist.x) / 2
      : (leadWrist ?? trailWrist)!.x;
  const span = trailHeel.x - leadHeel.x;
  if (Math.abs(span) < 1e-4) {
    return {
      value: 0,
      unit: "pct_stance",
      confidence: 0,
      valid: false,
      reason: "inferred, not seen",
    };
  }
  const fraction = clamp01((handX - leadHeel.x) / span);
  let valid = true;
  let confidence = 0.35;
  let reason: string | null = "inferred, not seen";
  if (alignmentSetupCandidate) {
    valid = false;
    confidence = 0.15;
    reason = "alignment setup candidate — confirm on freeze-frame before trusting";
  }
  return {
    value: fraction,
    unit: "pct_stance",
    confidence,
    valid,
    reason,
  };
}

function inactiveMetric(
  unit: string,
  reason: string,
): MetricRecord {
  return { value: 0, unit, confidence: 0, valid: false, reason };
}

function inactiveFaceOnMetrics(reason: string): FaceOnMetrics {
  return {
    shoulder_rotation_top: inactiveMetric("normalized_rotation", reason),
    hip_rotation_top: inactiveMetric("normalized_rotation", reason),
    trail_knee_flexion_change: inactiveMetric("normalized_rotation", reason),
    hip_sway_back: inactiveMetric("pct_stance", reason),
    hip_slide_down: inactiveMetric("pct_stance", reason),
    head_sway: inactiveMetric("pct_stance", reason),
    head_lift: inactiveMetric("pct_hip_height", reason),
    weight_transfer_proxy: inactiveMetric("pct_stance", reason),
    width_at_top: inactiveMetric("ratio", reason),
    lead_elbow_separation: inactiveMetric("pct_stance", reason),
    sequence_proxy: inactiveMetric("seconds", reason),
    tempo_ratio: inactiveMetric("ratio", reason),
    ball_position_inferred: inactiveMetric("pct_stance", reason),
  };
}

export function computeFaceOnMetrics(input: FaceOnMetricsInput): FaceOnMetrics {
  const {
    frames,
    normalizedFrames,
    phases,
    angle,
    handedness,
    clubFamily,
    intent,
    alignmentSetupCandidate = false,
  } = input;

  const classification = angle?.classification.value;
  if (!angle?.valid || classification !== "face_on") {
    const reason =
      classification === "refuse"
        ? "angle refused"
        : classification === "dtl"
          ? "dtl clip — face-on metrics not computed"
          : "face-on angle required";
    return inactiveFaceOnMetrics(reason);
  }

  if (
    !phases.address.valid ||
    !phases.top.valid ||
    !phases.impact.valid
  ) {
    return inactiveFaceOnMetrics("address, top, or impact invalid");
  }

  const working =
    normalizedFrames && normalizedFrames.length === frames.length
      ? normalizedFrames
      : frames;

  const side = sides(handedness);
  const addressFrame = frameAt(working, phases.address.frameIndex)!;
  const topFrame = frameAt(working, phases.top.frameIndex)!;
  const impactFrame = frameAt(working, phases.impact.frameIndex)!;

  const aspect = addressAspect(addressFrame, side);
  const stance = stanceWidthAtAddress(addressFrame, side);

  const trailKnee = trailKneeFlexionChange(addressFrame, topFrame, side);
  const trailKneeDerived = derived(
    trailKnee.value,
    trailKnee.confidence,
    trailKnee.valid,
    trailKnee.reason,
  );

  const hipSwayBackMetric = hipSwayBack(
    addressFrame,
    topFrame,
    side,
    stance,
    trailKneeDerived,
  );
  const hipSwayDerived = derived(
    hipSwayBackMetric.value,
    hipSwayBackMetric.confidence,
    hipSwayBackMetric.valid,
    hipSwayBackMetric.reason,
  );

  return {
    shoulder_rotation_top: shoulderRotationTop(
      addressFrame,
      topFrame,
      side,
      aspect,
    ),
    hip_rotation_top: hipRotationTop(
      addressFrame,
      topFrame,
      side,
      aspect,
      trailKneeDerived,
      hipSwayDerived,
    ),
    trail_knee_flexion_change: trailKnee,
    hip_sway_back: hipSwayBackMetric,
    hip_slide_down: hipSlideDown(addressFrame, impactFrame, side, stance),
    head_sway: headSway(addressFrame, topFrame, side, stance),
    head_lift: headLift(addressFrame, impactFrame, side),
    weight_transfer_proxy: weightTransferProxy(
      addressFrame,
      impactFrame,
      side,
      stance,
    ),
    width_at_top: widthAtTop(addressFrame, topFrame, side),
    lead_elbow_separation: leadElbowSeparation(working, phases, side),
    sequence_proxy: sequenceProxy(working, phases, side),
    tempo_ratio: tempoRatio(phases, clubFamily, intent),
    ball_position_inferred: ballPositionInferred(
      addressFrame,
      side,
      alignmentSetupCandidate,
    ),
  };
}

export function faceOnMetricsFromUnknown(value: unknown): FaceOnMetrics | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const keys: FaceOnMetricKey[] = [
    "shoulder_rotation_top",
    "hip_rotation_top",
    "trail_knee_flexion_change",
    "hip_sway_back",
    "hip_slide_down",
    "head_sway",
    "head_lift",
    "weight_transfer_proxy",
    "width_at_top",
    "lead_elbow_separation",
    "sequence_proxy",
    "tempo_ratio",
    "ball_position_inferred",
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
  return record as FaceOnMetrics;
}
