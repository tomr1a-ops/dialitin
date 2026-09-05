import { derived, invalidDerived, type Derived } from "@/lib/engine/derived";
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
 * Rev 27 §5.2: measure on filming day with a clap-board event.
 * Default 0 until that constant is recorded.
 */
export const AV_CLOCK_OFFSET_MS = {
  "in-app": 0,
  upload: 0,
  in_app: 0,
  native_slomo: 0,
} as const;

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
const STILL_WINDOW_MS = 80;
const WAGGLE_RETURN = 0.035;
const TRIM_PAD_MS = 500;
const AUDIO_SILENCE = 0.035;
const FUSE_TIGHT_MS = 40;
const FUSE_OK_MS = 120;

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
  return { times, hands: smoothedHands, speed: smoothed, dt, stillSpeed };
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

function motionImpact(
  kin: Kinematics,
): { index: number; timeMs: number; peakSpeed: number } | null {
  const { speed, times } = kin;
  if (speed.length < 4) {
    return null;
  }
  const peak = peakIndex(speed, 1, speed.length - 2);
  const peakSpeed = speed[peak]!;
  if (peakSpeed < STILL_SPEED * 1.6) {
    return null;
  }
  let trough = peak;
  const limitMs = times[peak]! + 180;
  for (let i = peak + 1; i < speed.length && times[i]! <= limitMs; i++) {
    if (speed[i]! < speed[trough]!) {
      trough = i;
    }
  }
  const decelerated = speed[trough]! <= peakSpeed * 0.72;
  const timeMs = decelerated
    ? times[peak]! + 0.15 * (times[trough]! - times[peak]!)
    : interpolatePeakTime(times, speed, peak);
  return {
    index: nearestFrame(times, timeMs),
    timeMs,
    peakSpeed,
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
): { timeMs: number; strength: number } | null {
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
  return {
    timeMs: interpolatePeakTime(times, onset, peak),
    strength,
  };
}

function fuseImpact(
  motion: { index: number; timeMs: number; peakSpeed: number } | null,
  audio: { timeMs: number; strength: number } | null,
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

  const dt = Math.abs(motion!.timeMs - audio!.timeMs);
  if (dt <= FUSE_TIGHT_MS) {
    const timeMs = audio!.timeMs * 0.7 + motion!.timeMs * 0.3;
    return {
      index: nearestFrame(times, timeMs),
      timeMs,
      candidate: derived("fused", 0.92, true, "audio and motion agree"),
    };
  }
  if (dt <= FUSE_OK_MS) {
    const timeMs = audio!.timeMs * 0.65 + motion!.timeMs * 0.35;
    return {
      index: nearestFrame(times, timeMs),
      timeMs,
      candidate: derived(
        "fused",
        0.78,
        true,
        "audio and motion within a few frames",
      ),
    };
  }
  if (audio!.strength > 0.04) {
    return {
      index: nearestFrame(times, audio!.timeMs),
      timeMs: audio!.timeMs,
      candidate: derived("audio", 0.5, true, "audio and motion disagree"),
    };
  }
  return {
    index: motion!.index,
    timeMs: motion!.timeMs,
    candidate: derived("motion", 0.48, true, "audio and motion disagree"),
  };
}

function stillAt(kin: Kinematics, index: number) {
  return Boolean(kin.hands[index]) && (kin.speed[index] ?? 0) <= kin.stillSpeed;
}

function lastStillnessBefore(kin: Kinematics, before: number) {
  let end = -1;
  for (let i = before; i >= 1; i--) {
    if (stillAt(kin, i)) {
      end = i;
      break;
    }
  }
  if (end < 0) {
    return null;
  }
  let start = end;
  while (start > 0 && stillAt(kin, start - 1)) {
    start -= 1;
  }
  const duration = kin.times[end]! - kin.times[start]!;
  if (duration < STILL_WINDOW_MS && start > 0) {
    return null;
  }
  return { start, end };
}

function distTo(
  point: { x: number; y: number } | null,
  origin: { x: number; y: number },
) {
  if (!point) {
    return 0;
  }
  return Math.hypot(point.x - origin.x, point.y - origin.y);
}

function findTop(kin: Kinematics, impactIndex: number) {
  const impactHands = kin.hands[impactIndex];
  if (!impactHands) {
    return null;
  }
  const minGapMs = 180;
  for (let i = impactIndex - 1; i >= 2; i--) {
    if (kin.times[impactIndex]! - kin.times[i]! < minGapMs) {
      continue;
    }
    const point = kin.hands[i];
    if (!point) {
      continue;
    }
    const dist = distTo(point, impactHands);
    const prevDist = distTo(kin.hands[i - 1], impactHands);
    const nextDist = distTo(kin.hands[i + 1], impactHands);
    if (dist >= 0.05 && dist >= prevDist && dist >= nextDist) {
      return i;
    }
  }
  return null;
}

function quietestWindow(kin: Kinematics, from: number, to: number) {
  if (to - from < 2) {
    return null;
  }
  let bestStart = from;
  let bestScore = Infinity;
  const windowMs = 120;
  for (let start = from; start < to; start++) {
    let end = start;
    while (
      end + 1 <= to &&
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
      if (!kin.hands[i]) {
        continue;
      }
      sum += kin.speed[i]!;
      count += 1;
    }
    if (count < 2) {
      continue;
    }
    const score = sum / count;
    if (score < bestScore) {
      bestScore = score;
      bestStart = start;
    }
  }
  let end = bestStart;
  while (
    end + 1 <= to &&
    kin.times[end + 1]! - kin.times[bestStart]! <= windowMs
  ) {
    end += 1;
  }
  return { start: bestStart, end };
}

function dropWaggleToAddress(kin: Kinematics, topIndex: number) {
  let cursor = topIndex;
  while (cursor > 2) {
    const still = lastStillnessBefore(kin, cursor - 1);
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
  const fallbackFrom = kin.times.findIndex(
    (time) => kin.times[topIndex]! - time <= 2500,
  );
  return quietestWindow(
    kin,
    Math.max(0, fallbackFrom),
    Math.max(1, topIndex - 1),
  );
}

function findFinish(kin: Kinematics, impactIndex: number, peakSpeed: number) {
  const threshold = Math.max(STILL_SPEED, peakSpeed * 0.18);
  let movingEnd = impactIndex;
  for (let i = impactIndex + 1; i < kin.speed.length; i++) {
    if (kin.speed[i]! > threshold) {
      movingEnd = i;
    }
  }
  for (let i = movingEnd; i < kin.speed.length; i++) {
    if (stillAt(kin, i) && kin.times[i]! - kin.times[movingEnd]! >= 40) {
      return i;
    }
  }
  return Math.max(movingEnd, Math.min(kin.speed.length - 1, impactIndex + 1));
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
  const offset =
    options.avClockOffsetMs ??
    AV_CLOCK_OFFSET_MS[options.capturePath ?? "upload"];
  const samples = options.audioSamples;
  const motion = motionImpact(kin);
  const audio = hasAudio(samples)
    ? audioImpact(
        samples,
        offset,
        motion ? { center: motion.timeMs, window: 220 } : undefined,
      )
    : null;
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

  const topIndex = findTop(kin, impactIndex);
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
  let takeawayIndex = Math.min(topIndex, addressIndex + 1);
  if (takeawayIndex >= topIndex) {
    takeawayIndex = Math.max(0, topIndex - 1);
  }
  if (addressIndex >= takeawayIndex) {
    addressIndex = Math.max(0, takeawayIndex - 1);
  }
  const finishIndex = findFinish(
    kin,
    impactIndex,
    motion?.peakSpeed ?? kin.speed[impactIndex] ?? 1,
  );

  const address = mark(
    addressIndex,
    kin.times[addressIndex]!,
    still ? 0.8 : 0.45,
    still ? "stillness window before takeaway" : "no clear stillness window",
  );
  const takeaway = mark(
    takeawayIndex,
    kin.times[takeawayIndex]!,
    still ? 0.78 : 0.45,
    still ? "motion after address stillness" : "estimated from top",
  );
  const top = mark(
    topIndex,
    kin.times[topIndex]!,
    0.82,
    "hand-path direction reversal",
  );
  const finish = mark(
    finishIndex,
    kin.times[finishIndex]!,
    0.7,
    "follow-through settled",
  );

  const startMs = Math.max(0, address.timeMs - TRIM_PAD_MS);
  const lastMs = kin.times[kin.times.length - 1] ?? finish.timeMs;
  const endMs = Math.min(lastMs, finish.timeMs + TRIM_PAD_MS);

  return {
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
  };
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
