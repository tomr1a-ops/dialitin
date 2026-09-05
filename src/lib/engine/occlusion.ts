import {
  AV_CLOCK_OFFSET_MS,
  AV_CLOCK_OFFSET_REASON,
  type CapturePathKey,
  type SwingPhases,
} from "@/lib/engine/phases";
import type { Handedness } from "@/lib/admin/test-swings";
import {
  LEFT_ELBOW,
  LEFT_SHOULDER,
  LEFT_WRIST,
  RIGHT_ELBOW,
  RIGHT_SHOULDER,
  RIGHT_WRIST,
  type PoseFrame,
} from "@/lib/pose/types";

export type WristReconstructionReason =
  | "visible"
  | "reconstructed A+B"
  | "reconstructed A only"
  | "invalid";

export type ReconstructedLeadWrist = {
  frameIndex: number;
  timeMs: number;
  x: number;
  y: number;
  confidence: number;
  valid: boolean;
  reason: WristReconstructionReason;
};

export type LeadWristReconstruction = {
  frames: ReconstructedLeadWrist[];
  /** Virtual impact pose on the spline (audio-anchored when transient exists). */
  virtualImpact: {
    x: number;
    y: number;
    confidence: number;
    valid: boolean;
    reason: string | null;
  } | null;
  avClockOffsetMs: number;
  avClockOffsetReason: string;
};

export type ReconstructLeadWristInput = {
  frames: PoseFrame[];
  phases: SwingPhases;
  handedness: Handedness;
  capturePath?: CapturePathKey | null;
  /** Strike transient time (ms) from audio analysis, if available. */
  audioTransientMs?: number | null;
  /** Override stored path offset (filming-day measurement). */
  avClockOffsetMs?: number;
};

const OCCLUSION_VIS = 0.55;
const SNAP_SHOULDER_WIDTH_FRAC = 0.05;
const GRIP_CM = 8;
const AVG_SHOULDER_CM = 40;
const SPLINE_HALF_WINDOW = 6;
const VIS = 0.35;

type Side = {
  leadShoulder: number;
  leadElbow: number;
  leadWrist: number;
  trailShoulder: number;
  trailWrist: number;
};

function sides(handedness: Handedness): Side {
  if (handedness === "left") {
    return {
      leadShoulder: RIGHT_SHOULDER,
      leadElbow: RIGHT_ELBOW,
      leadWrist: RIGHT_WRIST,
      trailShoulder: LEFT_SHOULDER,
      trailWrist: LEFT_WRIST,
    };
  }
  return {
    leadShoulder: LEFT_SHOULDER,
    leadElbow: LEFT_ELBOW,
    leadWrist: LEFT_WRIST,
    trailShoulder: RIGHT_SHOULDER,
    trailWrist: RIGHT_WRIST,
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

function shoulderWidth(frame: PoseFrame, side: Side): number | null {
  const lead = joint(frame, side.leadShoulder);
  const trail = joint(frame, side.trailShoulder);
  if (!lead || !trail) {
    return null;
  }
  return Math.hypot(trail.x - lead.x, trail.y - lead.y);
}

function leadWristOccluded(
  frame: PoseFrame,
  side: Side,
): { occluded: boolean; snap: boolean } {
  const lead = frame.landmarks[side.leadWrist];
  const trail = joint(frame, side.trailWrist);
  if (!lead) {
    return { occluded: true, snap: false };
  }
  if (lead.visibility < OCCLUSION_VIS) {
    return { occluded: true, snap: false };
  }
  if (!trail) {
    return { occluded: false, snap: false };
  }
  const width = shoulderWidth(frame, side);
  if (!width || width < 1e-5) {
    return { occluded: false, snap: false };
  }
  const dist = Math.hypot(trail.x - lead.x, trail.y - lead.y);
  const snap = dist <= width * SNAP_SHOULDER_WIDTH_FRAC;
  return { occluded: snap, snap };
}

function armLength(
  frame: PoseFrame,
  side: Side,
): { shoulderElbow: number; wholeArm: number } | null {
  const shoulder = joint(frame, side.leadShoulder);
  const elbow = joint(frame, side.leadElbow);
  const wrist = joint(frame, side.leadWrist, OCCLUSION_VIS);
  if (!shoulder || !elbow) {
    return null;
  }
  const shoulderElbow = Math.hypot(elbow.x - shoulder.x, elbow.y - shoulder.y);
  if (wrist) {
    const wholeArm = Math.hypot(wrist.x - shoulder.x, wrist.y - shoulder.y);
    return { shoulderElbow, wholeArm };
  }
  return { shoulderElbow, wholeArm: shoulderElbow * 1.6 };
}

function measureReferenceArm(
  frames: PoseFrame[],
  side: Side,
  topIdx: number,
  impactIdx: number,
): {
  refShoulderElbow: number;
  refWholeArm: number;
  gripSep: number;
  gripDir: { x: number; y: number } | null;
} | null {
  const address = frameAt(frames, 0);
  if (!address) {
    return null;
  }
  const addrLead = joint(address, side.leadWrist, OCCLUSION_VIS);
  const addrTrail = joint(address, side.trailWrist);
  let gripSep = 0.08;
  if (addrLead && addrTrail) {
    gripSep = Math.hypot(addrTrail.x - addrLead.x, addrTrail.y - addrLead.y);
  } else {
    const width = shoulderWidth(address, side);
    if (width) {
      gripSep = width * (GRIP_CM / AVG_SHOULDER_CM);
    }
  }

  let refShoulderElbow = 0;
  let refWholeArm = 0;
  let count = 0;
  let lastGripDir: { x: number; y: number } | null = null;
  const start = Math.max(0, topIdx);
  const end = Math.min(frames.length - 1, impactIdx);
  for (let i = start; i <= end; i++) {
    const frame = frameAt(frames, i);
    if (!frame) {
      continue;
    }
    const occ = leadWristOccluded(frame, side);
    if (occ.occluded) {
      continue;
    }
    const len = armLength(frame, side);
    if (!len) {
      continue;
    }
    refShoulderElbow += len.shoulderElbow;
    refWholeArm += len.wholeArm;
    count += 1;
    const lead = joint(frame, side.leadWrist, OCCLUSION_VIS)!;
    const trail = joint(frame, side.trailWrist);
    if (trail) {
      const dx = lead.x - trail.x;
      const dy = lead.y - trail.y;
      const mag = Math.hypot(dx, dy);
      if (mag > 1e-5) {
        lastGripDir = { x: dx / mag, y: dy / mag };
      }
    }
  }
  if (count === 0 || !lastGripDir) {
    return null;
  }
  return {
    refShoulderElbow: refShoulderElbow / count,
    refWholeArm: refWholeArm / count,
    gripSep,
    gripDir: lastGripDir,
  };
}

function vectorA(
  frame: PoseFrame,
  side: Side,
  ref: { refShoulderElbow: number; refWholeArm: number },
): { x: number; y: number; confidence: number } | null {
  const shoulder = joint(frame, side.leadShoulder);
  const elbow = joint(frame, side.leadElbow);
  if (!shoulder || !elbow) {
    return null;
  }
  const se = Math.hypot(elbow.x - shoulder.x, elbow.y - shoulder.y);
  if (se < 1e-5 || ref.refShoulderElbow < 1e-5) {
    return null;
  }
  const scale = se / ref.refShoulderElbow;
  const radius = ref.refWholeArm * scale;
  const dx = elbow.x - shoulder.x;
  const dy = elbow.y - shoulder.y;
  const rayLen = Math.hypot(dx, dy);
  if (rayLen < 1e-5) {
    return null;
  }
  return {
    x: shoulder.x + (dx / rayLen) * radius,
    y: shoulder.y + (dy / rayLen) * radius,
    confidence: clamp01(Math.min(shoulder.visibility, elbow.visibility)),
  };
}

function vectorB(
  frame: PoseFrame,
  side: Side,
  gripSep: number,
  gripDir: { x: number; y: number },
): { x: number; y: number; confidence: number } | null {
  const trail = joint(frame, side.trailWrist);
  if (!trail) {
    return null;
  }
  return {
    x: trail.x + gripDir.x * gripSep,
    y: trail.y + gripDir.y * gripSep,
    confidence: clamp01(trail.visibility),
  };
}

function fuseEstimates(
  a: { x: number; y: number; confidence: number } | null,
  b: { x: number; y: number; confidence: number } | null,
): {
  x: number;
  y: number;
  confidence: number;
  reason: WristReconstructionReason;
} | null {
  if (a && b) {
    const wa = Math.max(a.confidence, 1e-3) ** 2;
    const wb = Math.max(b.confidence, 1e-3) ** 2;
    const w = wa + wb;
    return {
      x: (a.x * wa + b.x * wb) / w,
      y: (a.y * wa + b.y * wb) / w,
      confidence: clamp01((a.confidence + b.confidence) / 2),
      reason: "reconstructed A+B",
    };
  }
  if (a) {
    return {
      x: a.x,
      y: a.y,
      confidence: clamp01(a.confidence * 0.85),
      reason: "reconstructed A only",
    };
  }
  return null;
}

/** Fritsch–Carlson monotone cubic Hermite (PCHIP) on uniform index nodes. */
function pchipEvaluate(
  xs: number[],
  ys: number[],
  x: number,
): number | null {
  const n = xs.length;
  if (n < 2) {
    return n === 1 ? ys[0]! : null;
  }
  if (x <= xs[0]!) {
    return ys[0]!;
  }
  if (x >= xs[n - 1]!) {
    return ys[n - 1]!;
  }
  let seg = 0;
  for (let i = 0; i < n - 1; i++) {
    if (x >= xs[i]! && x <= xs[i + 1]!) {
      seg = i;
      break;
    }
  }
  const h = xs[seg + 1]! - xs[seg]!;
  if (h <= 0) {
    return ys[seg]!;
  }
  const deltas: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    deltas.push((ys[i + 1]! - ys[i]!) / (xs[i + 1]! - xs[i]!));
  }
  const m: number[] = new Array(n).fill(0);
  m[0] = deltas[0]!;
  m[n - 1] = deltas[n - 1]!;
  for (let i = 1; i < n - 1; i++) {
    if (deltas[i - 1]! * deltas[i]! <= 0) {
      m[i] = 0;
    } else {
      const w1 = 2 * h + (xs[i + 1]! - xs[i]!);
      const w2 = (xs[i]! - xs[i - 1]!) + 2 * h;
      m[i] = (w1 + w2) / (w1 / deltas[i - 1]! + w2 / deltas[i]!);
    }
  }
  const t = (x - xs[seg]!) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return (
    h00 * ys[seg]! +
    h10 * h * m[seg]! +
    h01 * ys[seg + 1]! +
    h11 * h * m[seg + 1]!
  );
}

function resolveCapturePath(
  capturePath: CapturePathKey | null | undefined,
): CapturePathKey {
  if (capturePath && capturePath in AV_CLOCK_OFFSET_MS) {
    return capturePath;
  }
  return "upload";
}

export function reconstructLeadWristPath(
  input: ReconstructLeadWristInput,
): LeadWristReconstruction {
  const { frames, phases, handedness } = input;
  const side = sides(handedness);
  const pathKey = resolveCapturePath(input.capturePath);
  const avOffset =
    input.avClockOffsetMs ?? AV_CLOCK_OFFSET_MS[pathKey] ?? 0;
  const avReason = AV_CLOCK_OFFSET_REASON[pathKey] ?? "default until filming day";

  const empty: LeadWristReconstruction = {
    frames: [],
    virtualImpact: null,
    avClockOffsetMs: avOffset,
    avClockOffsetReason: avReason,
  };

  if (
    !phases.impact.valid ||
    !phases.top.valid ||
    frames.length === 0
  ) {
    return empty;
  }

  const impactIdx = phases.impact.frameIndex;
  const topIdx = phases.top.frameIndex;
  const ref = measureReferenceArm(frames, side, topIdx, impactIdx);
  if (!ref) {
    return empty;
  }

  const windowStart = Math.max(0, impactIdx - SPLINE_HALF_WINDOW);
  const windowEnd = Math.min(frames.length - 1, impactIdx + 2);
  const nodes: Array<{
    frameIndex: number;
    timeMs: number;
    x: number;
    y: number;
    confidence: number;
    reason: WristReconstructionReason;
  }> = [];

  for (let i = windowStart; i <= windowEnd; i++) {
    if (i === impactIdx) {
      continue;
    }
    const frame = frameAt(frames, i);
    if (!frame) {
      continue;
    }
    const occ = leadWristOccluded(frame, side);
    const visibleWrist = joint(frame, side.leadWrist, OCCLUSION_VIS);
    if (!occ.occluded && visibleWrist) {
      nodes.push({
        frameIndex: i,
        timeMs: frame.mediaTime * 1000,
        x: visibleWrist.x,
        y: visibleWrist.y,
        confidence: clamp01(visibleWrist.visibility),
        reason: "visible",
      });
      continue;
    }
    const a = vectorA(frame, side, ref);
    const b = vectorB(frame, side, ref.gripSep, ref.gripDir!);
    const fused = fuseEstimates(a, b);
    if (fused) {
      nodes.push({
        frameIndex: i,
        timeMs: frame.mediaTime * 1000,
        x: fused.x,
        y: fused.y,
        confidence: fused.confidence,
        reason: fused.reason,
      });
    }
  }

  const allFrames: ReconstructedLeadWrist[] = [];
  for (let i = windowStart; i <= windowEnd; i++) {
    const frame = frameAt(frames, i);
    if (!frame) {
      continue;
    }
    const occ = leadWristOccluded(frame, side);
    const visibleWrist = joint(frame, side.leadWrist, OCCLUSION_VIS);
    if (!occ.occluded && visibleWrist) {
      allFrames.push({
        frameIndex: i,
        timeMs: frame.mediaTime * 1000,
        x: visibleWrist.x,
        y: visibleWrist.y,
        confidence: clamp01(visibleWrist.visibility),
        valid: true,
        reason: "visible",
      });
      continue;
    }
    const node = nodes.find((n) => n.frameIndex === i);
    if (node) {
      allFrames.push({
        frameIndex: node.frameIndex,
        timeMs: node.timeMs,
        x: node.x,
        y: node.y,
        confidence: node.confidence,
        valid: true,
        reason: node.reason,
      });
    } else {
      allFrames.push({
        frameIndex: i,
        timeMs: frame.mediaTime * 1000,
        x: 0,
        y: 0,
        confidence: 0,
        valid: false,
        reason: "invalid",
      });
    }
  }

  let virtualImpact: LeadWristReconstruction["virtualImpact"] = null;
  if (nodes.length >= 2) {
    const xs = nodes.map((n) => n.frameIndex);
    const ysX = nodes.map((n) => n.x);
    const ysY = nodes.map((n) => n.y);
    let anchorIdx = impactIdx;
    if (input.audioTransientMs != null && Number.isFinite(input.audioTransientMs)) {
      const adjustedMs = input.audioTransientMs - avOffset;
      const impactFrame = frameAt(frames, impactIdx);
      const prevFrame = frameAt(frames, impactIdx - 1);
      if (impactFrame && prevFrame) {
        const t0 = prevFrame.mediaTime * 1000;
        const t1 = impactFrame.mediaTime * 1000;
        if (t1 > t0) {
          const frac = clamp01((adjustedMs - t0) / (t1 - t0));
          anchorIdx = impactIdx - 1 + frac;
        }
      }
    }
    const vx = pchipEvaluate(xs, ysX, anchorIdx);
    const vy = pchipEvaluate(xs, ysY, anchorIdx);
    if (vx != null && vy != null) {
      const conf =
        nodes.reduce((sum, n) => sum + n.confidence, 0) / nodes.length;
      virtualImpact = {
        x: vx,
        y: vy,
        confidence: clamp01(conf),
        valid: true,
        reason:
          input.audioTransientMs != null
            ? "PCHIP spline at audio-anchored impact"
            : "PCHIP spline at impact frame",
      };
    }
  }

  return {
    frames: allFrames,
    virtualImpact,
    avClockOffsetMs: avOffset,
    avClockOffsetReason: avReason,
  };
}

/** Lead-wrist (x,y) for a frame — visible, reconstructed, or null. */
export function leadWristPosition(
  reconstruction: LeadWristReconstruction,
  frameIndex: number,
): { x: number; y: number; confidence: number } | null {
  const hit = reconstruction.frames.find((f) => f.frameIndex === frameIndex);
  if (!hit?.valid) {
    return null;
  }
  return { x: hit.x, y: hit.y, confidence: hit.confidence };
}

export function leadWristAtVirtualImpact(
  reconstruction: LeadWristReconstruction,
): { x: number; y: number; confidence: number } | null {
  const vi = reconstruction.virtualImpact;
  if (!vi?.valid) {
    return null;
  }
  return { x: vi.x, y: vi.y, confidence: vi.confidence };
}
