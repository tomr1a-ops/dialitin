import { derived, invalidDerived, type Derived } from "@/lib/engine/derived";
import { SLO_MO_TIMING_REASON } from "@/lib/engine/slo-mo-export";
import { detectFrameRate } from "@/lib/ingest/detect-frame-rate";
import {
  LEFT_HIP,
  LEFT_SHOULDER,
  LEFT_WRIST,
  RIGHT_HIP,
  RIGHT_SHOULDER,
  RIGHT_WRIST,
  type PoseFrame,
} from "@/lib/pose/types";

/**
 * Audio−video clock offset (ms) per capture path.
 * Rev 29 §5.2: measure on filming day with a clap-board event.
 * native_slomo placeholder measured from G01 (IMG_8642) until filming day.
 */
export const AV_CLOCK_OFFSET_MS = {
  "in-app": 0,
  upload: 0,
  in_app: 0,
  native_slomo: 0,
} as const;

export const AV_CLOCK_OFFSET_REASON: Record<CapturePathKey, string> = {
  "in-app": "default until filming day",
  upload: "default until filming day",
  in_app: "default until filming day",
  native_slomo: "unmeasured on filming day",
};

export type CapturePathKey = keyof typeof AV_CLOCK_OFFSET_MS;

export type AudioSample = {
  timeMs: number;
  rms: number;
};

export type PhaseMark = {
  frameIndex: number;
  timeMs: number;
  confidence: number;
  valid: boolean;
  reason: string | null;
};

export type ImpactCandidate = "audio" | "motion" | "fused";

export type SwingTrim = {
  startMs: number;
  endMs: number;
};

export type ImpactDiagnostics = {
  audioTransientFrameIndex: number | null;
  motionPeakFrameIndex: number | null;
  motionImpactFrameIndex: number | null;
  measuredAvOffsetMs: number | null;
};

export type HandCentroidSeries = {
  times: number[];
  /** Image y inverted — higher = hands higher in frame. */
  height: number[];
  speed: number[];
};

export type SwingPhases = {
  address: PhaseMark;
  takeaway: PhaseMark;
  top: PhaseMark;
  impact: PhaseMark;
  finish: PhaseMark;
  impactCandidate: Derived<ImpactCandidate>;
  effectiveFrameRate: Derived<number>;
  sloMoReexportedAt30: Derived<boolean>;
  trim: Derived<SwingTrim>;
};

export type FindSwingOptions = {
  audioSamples?: AudioSample[];
  handedness?: "right" | "left";
  capturePath?: CapturePathKey;
  labeledFrameRate?: number | null;
  fileName?: string;
  avClockOffsetMs?: number;
  diagnostics?: ImpactDiagnostics;
};

const PERSON_JOINTS = [
  LEFT_SHOULDER,
  RIGHT_SHOULDER,
  LEFT_HIP,
  RIGHT_HIP,
  LEFT_WRIST,
  RIGHT_WRIST,
] as const;

const VIS_MOTION = 0.3;
const VIS_PERSON = 0.25;
const STILL_SPEED = 0.35;
const STILLNESS_MS = 300;
const WAGGLE_RETURN = 0.035;
const TRIM_PAD_MS = 500;
const AUDIO_SILENCE = 0.035;
const FUSE_TIGHT_MS = 40;
const FUSE_OK_MS = 120;
const MIN_TOP_BEFORE_IMPACT_MS = 150;
const TOP_HEIGHT_WINDOW_MS = 150;

function invalidMark(reason: string): PhaseMark {
  return {
    frameIndex: 0,
    timeMs: 0,
    confidence: 0,
    valid: false,
    reason,
  };
}

function mark(
  frameIndex: number,
  timeMs: number,
  confidence: number,
  reason: string | null,
): PhaseMark {
  return {
    frameIndex,
    timeMs,
    confidence: Math.max(0, Math.min(1, confidence)),
    valid: true,
    reason,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

function timeMsOf(frame: PoseFrame) {
  return frame.mediaTime * 1000;
}

function joint(
  frame: PoseFrame,
  index: number,
): { x: number; y: number; visibility: number } | null {
  const point = frame.landmarks[index];
  if (!point || point.visibility < VIS_MOTION) {
    return null;
  }
  return point;
}

function trailAndLead(handedness: "right" | "left") {
  return handedness === "left"
    ? { trail: LEFT_WRIST, lead: RIGHT_WRIST }
    : { trail: RIGHT_WRIST, lead: LEFT_WRIST };
}

function handPoint(
  frame: PoseFrame,
  trail: number,
  lead: number,
): { x: number; y: number; visibility: number } | null {
  const trailPt = joint(frame, trail);
  const leadPt = joint(frame, lead);
  if (trailPt && leadPt) {
    return {
      x: (trailPt.x + leadPt.x) / 2,
      y: (trailPt.y + leadPt.y) / 2,
      visibility: Math.min(trailPt.visibility, leadPt.visibility),
    };
  }
  return trailPt ?? leadPt;
}

type Kinematics = {
  times: number[];
  hands: Array<{ x: number; y: number } | null>;
  /** Average hip y per frame — hands must hang below this at address. */
  hipLineY: Array<number | null>;
  speed: number[];
  dt: number[];
  stillSpeed: number;
};

function kinematics(
  frames: PoseFrame[],
  handedness: "right" | "left",
): Kinematics {
  const { trail, lead } = trailAndLead(handedness);
  const times = frames.map(timeMsOf);
  const hands = frames.map((frame) => {
    const point = handPoint(frame, trail, lead);
    return point ? { x: point.x, y: point.y } : null;
  });
  const hipLineY = frames.map((frame) => {
    const left = joint(frame, LEFT_HIP);
    const right = joint(frame, RIGHT_HIP);
    if (left && right) {
      return (left.y + right.y) / 2;
    }
    return left?.y ?? right?.y ?? null;
  });
  const speed = new Array<number>(frames.length).fill(0);
  const dt = new Array<number>(frames.length).fill(0);
  for (let i = 1; i < frames.length; i++) {
    const prev = hands[i - 1];
    const cur = hands[i];
    const delta = times[i]! - times[i - 1]!;
    dt[i] = delta;
    if (!prev || !cur || delta <= 0) {
      continue;
    }
    speed[i] = (Math.hypot(cur.x - prev.x, cur.y - prev.y) / delta) * 1000;
  }
  const smoothedHands = hands.map((point, index) => {
    if (!point) {
      return null;
    }
    const window = [hands[index - 1], point, hands[index + 1]].filter(
      (item): item is { x: number; y: number } => Boolean(item),
    );
    if (window.length === 0) {
      return null;
    }
    return {
      x: window.reduce((sum, item) => sum + item.x, 0) / window.length,
      y: window.reduce((sum, item) => sum + item.y, 0) / window.length,
    };
  });
  const smoothed = speed.slice();
  for (let i = 1; i < speed.length - 1; i++) {
    smoothed[i] = (speed[i - 1]! + speed[i]! + speed[i + 1]!) / 3;
  }
  const finite = smoothed.filter((value) => value > 0);
  const peak = finite.length ? Math.max(...finite) : 1;
  const stillSpeed = Math.max(STILL_SPEED, peak * 0.12);
  return { times, hands: smoothedHands, hipLineY, speed: smoothed, dt, stillSpeed };
}

export function handCentroidSeries(
  frames: PoseFrame[],
  handedness: "right" | "left" = "right",
): HandCentroidSeries {
  const kin = kinematics(frames, handedness);
  return {
    times: kin.times,
    height: kin.hands.map((point) => (point ? 1 - point.y : 0)),
    speed: kin.speed,
  };
}

function hasPerson(frames: PoseFrame[]): boolean {
  if (frames.length === 0) {
    return false;
  }
  const visibilities: number[] = [];
  for (const frame of frames) {
    for (const index of PERSON_JOINTS) {
      visibilities.push(frame.landmarks[index]?.visibility ?? 0);
    }
  }
  return median(visibilities) >= VIS_PERSON;
}

function peakIndex(values: number[], from: number, to: number) {
  let best = from;
  let bestValue = -Infinity;
  for (let i = from; i <= to; i++) {
    if (values[i]! > bestValue) {
      bestValue = values[i]!;
      best = i;
    }
  }
  return best;
}

function interpolatePeakTime(
  times: number[],
  values: number[],
  index: number,
): number {
  const prev = values[index - 1] ?? values[index]!;
  const cur = values[index]!;
  const next = values[index + 1] ?? values[index]!;
  const denom = prev - 2 * cur + next;
  if (Math.abs(denom) < 1e-9) {
    return times[index]!;
  }
  const shift = clamp((prev - next) / (2 * denom), -0.49, 0.49);
  const left = times[index - 1] ?? times[index]!;
  const right = times[index + 1] ?? times[index]!;
  if (shift < 0) {
    return times[index]! + shift * (times[index]! - left);
  }
  return times[index]! + shift * (right - times[index]!);
}

function nearestFrame(times: number[], timeMs: number) {
  let best = 0;
  let bestErr = Infinity;
  for (let i = 0; i < times.length; i++) {
    const err = Math.abs(times[i]! - timeMs);
    if (err < bestErr) {
      bestErr = err;
      best = i;
    }
  }
  return best;
}

function isLocalMinimum(values: number[], index: number) {
  if (index <= 0 || index >= values.length - 1) {
    return false;
  }
  return values[index]! <= values[index - 1]! && values[index]! <= values[index + 1]!;
}

function invertedHandHeight(hands: Kinematics["hands"], index: number) {
  const point = hands[index];
  return point ? 1 - point.y : -Infinity;
}

function ballReferenceHands(kin: Kinematics, beforeIndex: number) {
  const limit = Math.max(1, Math.floor(beforeIndex * 0.55));
  let bestStart = 0;
  let bestScore = Infinity;
  const windowMs = STILLNESS_MS;
  for (let start = 0; start < limit; start++) {
    let end = start;
    while (
      end + 1 < limit &&
      kin.times[end + 1]! - kin.times[start]! <= windowMs
    ) {
      end += 1;
    }
    if (end <= start) {
      continue;
    }
    let sum = 0;
    let count = 0;
    for (let i = start; i <= end; i++) {
      sum += kin.speed[i]!;
      count += 1;
    }
    const score = count ? sum / count : Infinity;
    if (score < bestScore) {
      bestScore = score;
      bestStart = start;
    }
  }
  let end = bestStart;
  while (
    end + 1 < limit &&
    kin.times[end + 1]! - kin.times[bestStart]! <= windowMs
  ) {
    end += 1;
  }
  const mid = Math.floor((bestStart + end) / 2);
  return kin.hands[mid] ?? kin.hands[bestStart] ?? null;
}

function decelerationOnsetIndex(speed: number[], peakIndex: number) {
  let riseStart = peakIndex;
  while (riseStart > 1 && speed[riseStart - 1]! <= speed[riseStart]!) {
    riseStart -= 1;
  }
  let localMax = riseStart;
  for (let i = riseStart; i <= peakIndex; i++) {
    if (speed[i]! >= speed[localMax]!) {
      localMax = i;
    }
    if (i > riseStart && speed[i]! < speed[localMax]! * 0.82) {
      break;
    }
  }
  return localMax;
}

function motionImpact(kin: Kinematics): {
  index: number;
  timeMs: number;
  peakSpeed: number;
  peakIndex: number;
} | null {
  const { speed, times, hands } = kin;
  if (speed.length < 4) {
    return null;
  }
  const peakIdx = peakIndex(speed, 1, speed.length - 2);
  const peakSpeed = speed[peakIdx]!;
  if (peakSpeed < kin.stillSpeed * 1.6) {
    return null;
  }

  const ballRef = ballReferenceHands(kin, peakIdx);
  const searchEnd = peakIdx;
  const searchStart = Math.max(
    1,
    nearestFrame(times, times[peakIdx]! - 350),
  );

  let strikeIdx = peakIdx;
  let bestStrike = -Infinity;
  for (let i = searchStart; i <= searchEnd; i++) {
    const point = hands[i];
    if (!point) {
      continue;
    }
    const dist = ballRef
      ? Math.hypot(point.x - ballRef.x, point.y - ballRef.y)
      : 0;
    const score = point.y * 3 - dist;
    if (score > bestStrike) {
      bestStrike = score;
      strikeIdx = i;
    }
  }

  const handsAtPeak = hands[peakIdx]?.y ?? 0;
  const handsAtStrike = hands[strikeIdx]?.y ?? 0;
  const peakIsFollowThrough = handsAtPeak < handsAtStrike - 0.008;
  const decelIdx = decelerationOnsetIndex(speed, peakIdx);

  let impactIndex = peakIdx;
  if (peakIsFollowThrough || strikeIdx < peakIdx - 1) {
    impactIndex = Math.min(strikeIdx, decelIdx);
  } else {
    impactIndex = decelIdx;
  }
  impactIndex = clamp(impactIndex, searchStart, peakIdx);

  return {
    index: impactIndex,
    timeMs: times[impactIndex]!,
    peakSpeed,
    peakIndex: peakIdx,
  };
}

function hasAudio(
  samples: AudioSample[] | undefined,
): samples is AudioSample[] {
  if (!samples || samples.length < 3) {
    return false;
  }
  const values = samples.map((sample) => sample.rms);
  const peak = Math.max(...values);
  const mid = median(values);
  return peak >= AUDIO_SILENCE && peak >= mid * 2.2;
}

function audioImpact(
  samples: AudioSample[],
  offsetMs: number,
  gateMs?: { center: number; window: number },
): { timeMs: number; strength: number; frameIndex: number } | null {
  const times = samples.map((sample) => sample.timeMs - offsetMs);
  const onset = samples.map((sample, i) => {
    if (i === 0) {
      return 0;
    }
    return Math.max(0, sample.rms - samples[i - 1]!.rms);
  });
  let from = 1;
  let to = onset.length - 1;
  if (gateMs) {
    from = onset.findIndex(
      (_, i) => times[i]! >= gateMs.center - gateMs.window,
    );
    to = onset.length - 1;
    for (let i = onset.length - 1; i >= 0; i--) {
      if (times[i]! <= gateMs.center + gateMs.window) {
        to = i;
        break;
      }
    }
    if (from < 1) {
      from = 1;
    }
    if (to <= from) {
      return null;
    }
  }
  const peak = peakIndex(onset, from, to);
  const strength = onset[peak]!;
  if (strength < 0.008 && samples[peak]!.rms < AUDIO_SILENCE) {
    return null;
  }
  const timeMs = interpolatePeakTime(times, onset, peak);
  return {
    timeMs,
    strength,
    frameIndex: peak,
  };
}

function fuseImpact(
  motion: {
    index: number;
    timeMs: number;
    peakSpeed: number;
    peakIndex: number;
  } | null,
  audio: { timeMs: number; strength: number; frameIndex: number } | null,
  times: number[],
): {
  index: number;
  timeMs: number;
  candidate: Derived<ImpactCandidate>;
} {
  if (!motion && !audio) {
    return {
      index: 0,
      timeMs: times[0] ?? 0,
      candidate: invalidDerived("motion", "no impact candidate"),
    };
  }
  if (motion && !audio) {
    return {
      index: motion.index,
      timeMs: motion.timeMs,
      candidate: derived("motion", 0.55, true, "no audio"),
    };
  }
  if (!motion && audio) {
    const index = nearestFrame(times, audio.timeMs);
    return {
      index,
      timeMs: audio.timeMs,
      candidate: derived("audio", 0.6, true, "motion peak missing"),
    };
  }

  const dt = audio!.timeMs - motion!.timeMs;
  if (dt > FUSE_OK_MS) {
    return {
      index: motion!.index,
      timeMs: motion!.timeMs,
      candidate: derived(
        "motion",
        0.78,
        true,
        "audio transient late; motion strike",
      ),
    };
  }
  if (Math.abs(dt) <= FUSE_TIGHT_MS) {
    return {
      index: motion!.index,
      timeMs: motion!.timeMs,
      candidate: derived("fused", 0.92, true, "audio and motion agree"),
    };
  }
  if (Math.abs(dt) <= FUSE_OK_MS) {
    return {
      index: motion!.index,
      timeMs: motion!.timeMs,
      candidate: derived(
        "fused",
        0.78,
        true,
        "audio and motion within a few frames",
      ),
    };
  }
  if (audio!.strength > 0.04 && dt < -FUSE_OK_MS) {
    return {
      index: nearestFrame(times, audio!.timeMs),
      timeMs: audio!.timeMs,
      candidate: derived("audio", 0.5, true, "audio leads motion"),
    };
  }
  return {
    index: motion!.index,
    timeMs: motion!.timeMs,
    candidate: derived("motion", 0.72, true, "motion strike"),
  };
}

function stillAt(kin: Kinematics, index: number) {
  return Boolean(kin.hands[index]) && (kin.speed[index] ?? 0) <= kin.stillSpeed;
}

function findTop(
  kin: Kinematics,
  impactIndex: number,
  effectiveFps: number,
): { index: number | null; confidence: number; reason: string | null } {
  const { speed, hands, times } = kin;
  const minTime = times[impactIndex]! - MIN_TOP_BEFORE_IMPACT_MS;

  let globalHeightPeak = -Infinity;
  for (let i = 0; i < impactIndex; i++) {
    globalHeightPeak = Math.max(globalHeightPeak, invertedHandHeight(hands, i));
  }

  let best: {
    index: number;
    confidence: number;
    reason: string;
  } | null = null;

  for (let i = impactIndex - 1; i >= 2; i--) {
    if (times[i]! > minTime) {
      continue;
    }
    if (!isLocalMinimum(speed, i)) {
      continue;
    }

    const windowStartTime = times[i]! - TOP_HEIGHT_WINDOW_MS;
    let wStart = 0;
    for (let j = i; j >= 0; j--) {
      if (times[j]! <= windowStartTime) {
        wStart = j;
        break;
      }
    }

    let heightPeakIdx = i;
    let heightPeak = invertedHandHeight(hands, i);
    for (let j = wStart; j <= i; j++) {
      const h = invertedHandHeight(hands, j);
      if (h > heightPeak) {
        heightPeak = h;
        heightPeakIdx = j;
      }
    }

    if (Math.abs(heightPeakIdx - i) > 2) {
      continue;
    }

    if (invertedHandHeight(hands, i) < globalHeightPeak * 0.92) {
      continue;
    }

    let maxSpeedAfter = 0;
    for (let j = i + 1; j <= impactIndex; j++) {
      maxSpeedAfter = Math.max(maxSpeedAfter, speed[j]!);
    }
    if (maxSpeedAfter < kin.stillSpeed * 1.4) {
      continue;
    }

    let heightRange = 0;
    for (let j = wStart; j <= i; j++) {
      const point = hands[j];
      const peakPoint = hands[heightPeakIdx];
      if (point && peakPoint) {
        heightRange = Math.max(heightRange, Math.abs(point.y - peakPoint.y));
      }
    }

    const flatTop = heightRange < 0.012 && effectiveFps <= 32;
    best = {
      index: i,
      confidence: flatTop ? 0.55 : 0.82,
      reason: flatTop ? "30fps top ambiguity" : "hand-path reversal",
    };
    break;
  }

  if (!best) {
    return {
      index: null,
      confidence: 0,
      reason: "no speed minimum before impact",
    };
  }
  return best;
}

function findTakeaway(kin: Kinematics, topIndex: number) {
  const threshold = kin.stillSpeed * 1.12;
  for (let i = topIndex - 1; i >= 1; i--) {
    if (kin.speed[i]! <= threshold && kin.speed[i + 1]! > threshold) {
      return i + 1;
    }
  }
  for (let i = topIndex - 1; i >= 1; i--) {
    if (kin.speed[i]! > threshold) {
      return i;
    }
  }
  return Math.max(0, topIndex - 1);
}

function monotonicHeightRise(
  kin: Kinematics,
  fromIndex: number,
  toIndex: number,
) {
  let prev = invertedHandHeight(kin.hands, fromIndex);
  for (let i = fromIndex + 1; i <= toIndex; i++) {
    const cur = invertedHandHeight(kin.hands, i);
    if (cur === -Infinity) {
      continue;
    }
    if (cur < prev - 0.006) {
      return false;
    }
    prev = Math.max(prev, cur);
  }
  return true;
}

function handsBelowHipLine(kin: Kinematics, index: number): boolean {
  const hand = kin.hands[index];
  const hipY = kin.hipLineY[index];
  if (!hand || hipY === null) {
    return false;
  }
  // Image y grows downward — hanging hands sit below the hip line.
  return hand.y >= hipY - 0.015;
}

function stillnessBeforeTakeaway(kin: Kinematics, takeawayIndex: number) {
  let best: { start: number; end: number } | null = null;

  for (let end = takeawayIndex - 1; end >= 1; end--) {
    if (!stillAt(kin, end)) {
      continue;
    }

    let start = end;
    while (start > 0 && stillAt(kin, start - 1)) {
      start -= 1;
    }

    if (kin.times[end]! - kin.times[start]! < STILLNESS_MS) {
      end = start - 1;
      continue;
    }

    let handsHanging = true;
    for (let i = start; i <= end; i++) {
      if (!handsBelowHipLine(kin, i)) {
        handsHanging = false;
        break;
      }
    }
    if (!handsHanging) {
      end = start - 1;
      continue;
    }

    if (!monotonicHeightRise(kin, end, takeawayIndex)) {
      end = start - 1;
      continue;
    }

    if (!best || end > best.end) {
      best = { start, end };
    }

    end = start;
  }

  return best;
}

function dropWaggleToAddress(kin: Kinematics, topIndex: number) {
  let cursor = topIndex;
  while (cursor > 2) {
    const takeawayGuess = findTakeaway(kin, cursor);
    const still = stillnessBeforeTakeaway(kin, takeawayGuess);
    if (!still) {
      break;
    }
    const stillHands = kin.hands[still.end];
    if (!stillHands) {
      return still;
    }
    let returned = false;
    for (let i = still.end + 1; i < topIndex; i++) {
      const point = kin.hands[i];
      if (!point) {
        continue;
      }
      const back = Math.hypot(point.x - stillHands.x, point.y - stillHands.y);
      if (back <= WAGGLE_RETURN && i > still.end + 2 && i < topIndex - 2) {
        const later = kin.hands[Math.min(i + 3, topIndex)];
        if (
          later &&
          Math.hypot(later.x - stillHands.x, later.y - stillHands.y) >
            WAGGLE_RETURN * 2
        ) {
          returned = true;
          cursor = i;
          break;
        }
      }
    }
    if (!returned) {
      return still;
    }
  }
  return stillnessBeforeTakeaway(kin, findTakeaway(kin, topIndex));
}

function findFinish(kin: Kinematics, impactIndex: number) {
  const threshold = kin.stillSpeed;
  for (let i = impactIndex + 1; i < kin.speed.length; i++) {
    if (kin.speed[i]! > threshold) {
      continue;
    }
    let settled = true;
    for (let j = i; j < Math.min(i + 3, kin.speed.length); j++) {
      if (kin.speed[j]! > threshold) {
        settled = false;
        break;
      }
    }
    if (settled) {
      return i;
    }
  }
  return Math.max(
    impactIndex + 1,
    Math.min(kin.speed.length - 1, impactIndex + 1),
  );
}

function emptyPhases(reason: string, fps: Derived<number>): SwingPhases {
  const none = invalidMark(reason);
  return {
    address: none,
    takeaway: none,
    top: none,
    impact: none,
    finish: none,
    impactCandidate: invalidDerived("motion", reason),
    effectiveFrameRate: fps,
    sloMoReexportedAt30: derived(
      false,
      0.7,
      true,
      "effective rate matches the capture",
    ),
    trim: invalidDerived({ startMs: 0, endMs: 0 }, reason),
  };
}

function penalizePhaseTiming(mark: PhaseMark): PhaseMark {
  if (!mark.valid) {
    return mark;
  }
  return {
    ...mark,
    confidence: Math.min(mark.confidence, 0.35),
    reason: SLO_MO_TIMING_REASON,
  };
}

function applySloMoPhaseTimingPenalty(phases: SwingPhases): SwingPhases {
  if (!phases.sloMoReexportedAt30.value) {
    return phases;
  }
  return {
    ...phases,
    address: penalizePhaseTiming(phases.address),
    takeaway: penalizePhaseTiming(phases.takeaway),
    top: penalizePhaseTiming(phases.top),
    impact: penalizePhaseTiming(phases.impact),
    finish: penalizePhaseTiming(phases.finish),
  };
}

function sloMoReexport(
  fromTimestamps: boolean,
  detected: number,
  labeled: number | null | undefined,
  capturePath: CapturePathKey | undefined,
): Derived<boolean> {
  const labeledHigh =
    labeled !== null && labeled !== undefined && labeled >= 100;
  const detectedLow = detected > 0 && detected <= 32;
  const nativeSlow =
    (capturePath === "native_slomo" || capturePath === "upload") &&
    detectedLow &&
    (labeled === 30 ||
      labeled === null ||
      labeled === undefined ||
      labeledHigh);
  const flagged = fromTimestamps || (labeledHigh && detectedLow) || nativeSlow;
  return derived(
    flagged,
    flagged ? 0.8 : 0.7,
    true,
    flagged
      ? "Slo-mo clip arrived near 30 fps"
      : "effective rate matches the capture",
  );
}

export function findSwingPhases(
  frames: PoseFrame[],
  options: FindSwingOptions = {},
): SwingPhases {
  const timestamps = frames.map((frame) => frame.mediaTime);
  const rate = detectFrameRate(timestamps, options.fileName);
  const fps = derived(
    rate.detectedFrameRate,
    rate.detectedFrameRate > 0 ? 0.9 : 0,
    rate.detectedFrameRate > 0,
    rate.detectedFrameRate > 0
      ? "from frame timestamps"
      : "not enough timestamps",
  );
  const reexport = sloMoReexport(
    rate.sloMoReexportedAt30,
    rate.detectedFrameRate,
    options.labeledFrameRate,
    options.capturePath,
  );

  if (frames.length < 8) {
    return emptyPhases("not enough frames", fps);
  }
  if (!hasPerson(frames)) {
    return emptyPhases("no person", fps);
  }

  const handedness = options.handedness === "left" ? "left" : "right";
  const kin = kinematics(frames, handedness);
  const capturePath = options.capturePath ?? "upload";
  const offset =
    options.avClockOffsetMs ?? AV_CLOCK_OFFSET_MS[capturePath] ?? 0;
  const samples = options.audioSamples;
  const motion = motionImpact(kin);
  const audio = hasAudio(samples)
    ? audioImpact(
        samples,
        offset,
        motion ? { center: motion.timeMs, window: 280 } : undefined,
      )
    : null;

  if (options.diagnostics) {
    options.diagnostics.motionPeakFrameIndex = motion?.peakIndex ?? null;
    options.diagnostics.motionImpactFrameIndex = motion?.index ?? null;
    options.diagnostics.audioTransientFrameIndex = audio?.frameIndex ?? null;
    if (motion && audio) {
      options.diagnostics.measuredAvOffsetMs = audio.timeMs - motion.timeMs;
    }
  }

  const fused = fuseImpact(motion, audio, kin.times);
  if (!fused.candidate.valid) {
    return {
      ...emptyPhases(fused.candidate.reason ?? "no impact candidate", fps),
      impactCandidate: fused.candidate,
      sloMoReexportedAt30: reexport,
    };
  }

  const impactIndex = fused.index;
  const impact = mark(
    impactIndex,
    fused.timeMs,
    fused.candidate.confidence,
    fused.candidate.reason,
  );

  const topResult = findTop(kin, impactIndex, fps.value);
  const topIndex = topResult.index;
  if (topIndex === null || topIndex >= impactIndex) {
    return {
      address: invalidMark("could not find top"),
      takeaway: invalidMark("could not find top"),
      top: invalidMark("could not find top"),
      impact,
      finish: invalidMark("could not find top"),
      impactCandidate: fused.candidate,
      effectiveFrameRate: fps,
      sloMoReexportedAt30: reexport,
      trim: invalidDerived({ startMs: 0, endMs: 0 }, "could not find top"),
    };
  }

  const still = dropWaggleToAddress(kin, topIndex);
  let addressIndex = still?.end ?? Math.max(0, topIndex - 2);
  let takeawayIndex = findTakeaway(kin, topIndex);
  if (takeawayIndex >= topIndex) {
    takeawayIndex = Math.max(0, topIndex - 1);
  }
  if (addressIndex >= takeawayIndex) {
    addressIndex = Math.max(0, takeawayIndex - 1);
  }
  const finishIndex = findFinish(kin, impactIndex);

  const address = mark(
    addressIndex,
    kin.times[addressIndex]!,
    still ? 0.85 : 0.45,
    still ? "stillness window before takeaway; hands below hip line" : "no clear stillness window",
  );
  const takeaway = mark(
    takeawayIndex,
    kin.times[takeawayIndex]!,
    still ? 0.8 : 0.45,
    still ? "hand speed above address noise floor" : "estimated from top",
  );
  const top = mark(
    topIndex,
    kin.times[topIndex]!,
    topResult.confidence,
    topResult.reason,
  );
  const finish = mark(
    finishIndex,
    kin.times[finishIndex]!,
    0.7,
    "hand speed below threshold after impact",
  );

  const startMs = Math.max(0, address.timeMs - TRIM_PAD_MS);
  const lastMs = kin.times[kin.times.length - 1] ?? finish.timeMs;
  const endMs = Math.min(lastMs, finish.timeMs + TRIM_PAD_MS);

  return applySloMoPhaseTimingPenalty({
    address,
    takeaway,
    top,
    impact,
    finish,
    impactCandidate: fused.candidate,
    effectiveFrameRate: fps,
    sloMoReexportedAt30: reexport,
    trim: derived(
      { startMs, endMs },
      address.valid && finish.valid ? 0.85 : 0.4,
      address.valid && finish.valid,
      "0.5s before address to 0.5s after finish",
    ),
  });
}

export function phasesFromUnknown(value: unknown): SwingPhases | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Partial<SwingPhases>;
  if (!record.address || !record.impact || !record.finish) {
    return null;
  }
  return record as SwingPhases;
}
