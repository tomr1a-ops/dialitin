import type { OrientationSample } from "@/lib/capture/types";
import { derived, invalidDerived, type Derived } from "@/lib/engine/derived";
import type { SwingPhases } from "@/lib/engine/phases";
import type { VerticalRollResult } from "@/lib/engine/vertical-hough";
import {
  LEFT_ANKLE,
  LEFT_HEEL,
  LEFT_HIP,
  LEFT_SHOULDER,
  RIGHT_ANKLE,
  RIGHT_HEEL,
  RIGHT_HIP,
  RIGHT_SHOULDER,
  type PoseFrame,
  type PoseLandmark,
} from "@/lib/pose/types";

/** Horizontal field of view (degrees) for assumed phone intrinsics — §5.1 */
export const HORIZONTAL_FOV_DEG = 68;

/** Vanishing-point LS residual (px) above this → Case B fallback — TODO(filming-day) */
export const VP_RESIDUAL_THRESHOLD_PX = 12;

/** TODO(filming-day): parallax hand-path scale constant */
export const K_PARALLAX = 1.0;

/** TODO(filming-day): effective pelvis radius for depth vs rotation separation */
export const PELVIS_RADIUS_EFFECTIVE = 1.0;

export const DTL_YAW_TOLERANCE_DEG = 12;
export const FACE_ON_YAW_TOLERANCE_DEG = 15;
export const FACE_ON_YAW_TARGET_DEG = 90;

/** Λ classifier bands — TODO(filming-day) calibrate on marked yaw offsets */
export const LAMBDA_FACE_ON_MIN = 0.65;
export const LAMBDA_DTL_MAX = 0.4;

export type AngleCase = "A" | "B";
export type AngleClassification = "face_on" | "dtl" | "refuse";

export type StoredAngle = {
  case: AngleCase;
  roll: Derived<number>;
  pitch: Derived<number>;
  yaw: Derived<number>;
  lambda: Derived<number>;
  classification: Derived<AngleClassification>;
  confidence: number;
  valid: boolean;
  reason: string | null;
  elapsedMs: number;
};

export type EstimateAngleOptions = {
  frames: PoseFrame[];
  phases: SwingPhases;
  imageWidth: number;
  imageHeight: number;
  capturePath?: "in-app" | "upload" | "in_app" | "native_slomo" | null;
  orientationSamples?: OrientationSample[];
  /** Pre-computed roll from background verticals (Case B worker pass). */
  verticalRoll?: VerticalRollResult | null;
  handedness?: "right" | "left";
};

export type EstimateAngleResult = {
  angle: StoredAngle;
  /** Normalized keypoints (Case A); null when Case B or invalid. */
  normalizedFrames: PoseFrame[] | null;
  /** Raw keypoints unchanged — same reference as input. */
  rawFrames: PoseFrame[];
};

const VIS = 0.35;

function deg(rad: number) {
  return (rad * 180) / Math.PI;
}

function rad(degValue: number) {
  return (degValue * Math.PI) / 180;
}

function focalLengthPx(width: number) {
  return width / 2 / Math.tan(rad(HORIZONTAL_FOV_DEG / 2));
}

function joint(
  frame: PoseFrame,
  index: number,
): { x: number; y: number; visibility: number } | null {
  const point = frame.landmarks[index];
  if (!point || point.visibility < VIS) {
    return null;
  }
  return point;
}

function midPoint(
  frame: PoseFrame,
  a: number,
  b: number,
): { x: number; y: number } | null {
  const left = joint(frame, a);
  const right = joint(frame, b);
  if (!left || !right) {
    return null;
  }
  return { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
}

function lineFromPoints(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
): [number, number, number] | null {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) {
    return null;
  }
  const a = -dy / len;
  const b = dx / len;
  const c = -(a * p1.x + b * p1.y);
  return [a, b, c];
}

function fitVanishingPoint(
  lines: Array<[number, number, number]>,
): { u: number; v: number; residual: number } | null {
  if (lines.length < 2) {
    return null;
  }
  let suu = 0;
  let suv = 0;
  let svv = 0;
  let su = 0;
  let sv = 0;
  for (const [a, b, c] of lines) {
    suu += a * a;
    suv += a * b;
    svv += b * b;
    su += -a * c;
    sv += -b * c;
  }
  const det = suu * svv - suv * suv;
  if (Math.abs(det) < 1e-9) {
    return null;
  }
  const u = (su * svv - sv * suv) / det;
  const v = (suu * sv - suv * su) / det;
  let sumSq = 0;
  for (const [a, b, c] of lines) {
    const d = a * u + b * v + c;
    sumSq += d * d;
  }
  const residual = Math.sqrt(sumSq / lines.length);
  return { u, v, residual };
}

function orientationAtTime(
  samples: OrientationSample[],
  timeSec: number,
): { roll: number; pitch: number } | null {
  if (samples.length === 0) {
    return null;
  }
  let best = samples[0]!;
  let bestErr = Infinity;
  for (const sample of samples) {
    const err = Math.abs(sample.t - timeSec);
    if (err < bestErr) {
      bestErr = err;
      best = sample;
    }
  }
  if (best.gamma === null || best.beta === null) {
    return null;
  }
  if (best.roll !== null && best.pitch !== null) {
    return { roll: best.roll, pitch: best.pitch };
  }
  return {
    roll: best.gamma,
    pitch: best.beta - 90,
  };
}

function rotationMatrixRollPitch(rollDeg: number, pitchDeg: number) {
  const cr = Math.cos(rad(rollDeg));
  const sr = Math.sin(rad(rollDeg));
  const cp = Math.cos(rad(pitchDeg));
  const sp = Math.sin(rad(pitchDeg));
  return [
    [cp, 0, sp],
    [sr * sp, cr, -sr * cp],
    [-cr * sp, sr, cr * cp],
  ] as const;
}

function warpLandmark(
  landmark: PoseLandmark,
  width: number,
  height: number,
  f: number,
  cx: number,
  cy: number,
  r: readonly (readonly number[])[],
): PoseLandmark {
  const u = landmark.x * width;
  const v = landmark.y * height;
  const x = (u - cx) / f;
  const y = (v - cy) / f;
  const z = 1;
  const xp = r[0]![0]! * x + r[0]![1]! * y + r[0]![2]! * z;
  const yp = r[1]![0]! * x + r[1]![1]! * y + r[1]![2]! * z;
  const zp = r[2]![0]! * x + r[2]![1]! * y + r[2]![2]! * z;
  const u2 = (xp / zp) * f + cx;
  const v2 = (yp / zp) * f + cy;
  return {
    x: clamp01(u2 / width),
    y: clamp01(v2 / height),
    visibility: landmark.visibility,
  };
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function warpFramesRollPitch(
  frames: PoseFrame[],
  width: number,
  height: number,
  rollDeg: number,
  pitchDeg: number,
): PoseFrame[] {
  const f = focalLengthPx(width);
  const cx = width / 2;
  const cy = height / 2;
  const r = rotationMatrixRollPitch(rollDeg, pitchDeg);
  return frames.map((frame) => ({
    ...frame,
    landmarks: frame.landmarks.map((landmark) =>
      warpLandmark(landmark, width, height, f, cx, cy, r),
    ),
  }));
}

function computeLambda(frame: PoseFrame): Derived<number> {
  const ls = joint(frame, LEFT_SHOULDER);
  const rs = joint(frame, RIGHT_SHOULDER);
  const lh = joint(frame, LEFT_HIP);
  const rh = joint(frame, RIGHT_HIP);
  if (!ls || !rs || !lh || !rh) {
    return invalidDerived(0, "shoulders or hips not visible at address");
  }
  const shoulderWidth = Math.hypot(rs.x - ls.x, rs.y - ls.y);
  const midShoulder = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };
  const midHip = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 };
  const torsoLen = Math.hypot(
    midShoulder.x - midHip.x,
    midShoulder.y - midHip.y,
  );
  if (torsoLen < 1e-4) {
    return invalidDerived(0, "torso length too small");
  }
  const lambda = shoulderWidth / torsoLen;
  return derived(lambda, 0.75, true, "shoulder width ÷ hip-to-shoulder length");
}

function classifyFromLambda(lambda: number): AngleClassification {
  if (lambda >= LAMBDA_FACE_ON_MIN) {
    return "face_on";
  }
  if (lambda <= LAMBDA_DTL_MAX) {
    return "dtl";
  }
  return "refuse";
}

function classifyFromYaw(yawDeg: number): AngleClassification {
  const dtlErr = Math.abs(yawDeg);
  const faceErr = Math.abs(yawDeg - FACE_ON_YAW_TARGET_DEG);
  const dtlOk = dtlErr <= DTL_YAW_TOLERANCE_DEG;
  const faceOk = faceErr <= FACE_ON_YAW_TOLERANCE_DEG;
  if (dtlOk && !faceOk) {
    return "dtl";
  }
  if (faceOk && !dtlOk) {
    return "face_on";
  }
  if (dtlOk && faceOk) {
    return dtlErr <= faceErr ? "dtl" : "face_on";
  }
  return "refuse";
}

function passesRefuseGate(classification: AngleClassification): boolean {
  return classification !== "refuse";
}

/** Hook for capture flow: refuse invalid angle without consuming credit. */
export function shouldRefuseAngle(angle: StoredAngle): boolean {
  return !angle.valid && angle.reason === "angle";
}

function yawFromAddressFrame(
  frame: PoseFrame,
  width: number,
): {
  yaw: Derived<number>;
  residual: number;
  linesUsed: number;
} {
  const f = focalLengthPx(width);
  const cx = width / 2;
  const lines: Array<[number, number, number]> = [];
  const ankleL = joint(frame, LEFT_ANKLE) ?? joint(frame, LEFT_HEEL);
  const ankleR = joint(frame, RIGHT_ANKLE) ?? joint(frame, RIGHT_HEEL);
  const hipL = joint(frame, LEFT_HIP);
  const hipR = joint(frame, RIGHT_HIP);
  const shL = joint(frame, LEFT_SHOULDER);
  const shR = joint(frame, RIGHT_SHOULDER);

  const ankleLine =
    ankleL && ankleR ? lineFromPoints(ankleL, ankleR) : null;
  const hipLine = hipL && hipR ? lineFromPoints(hipL, hipR) : null;
  const shoulderLine = shL && shR ? lineFromPoints(shL, shR) : null;
  if (ankleLine) {
    lines.push(ankleLine);
  }
  if (hipLine) {
    lines.push(hipLine);
  }
  if (shoulderLine) {
    lines.push(shoulderLine);
  }

  const vp = fitVanishingPoint(lines);
  if (!vp || lines.length < 2) {
    return {
      yaw: invalidDerived(0, "could not fit vanishing point"),
      residual: Infinity,
      linesUsed: lines.length,
    };
  }

  const uVp = vp.u * width;
  const yawRad = Math.atan((uVp - cx) / f);
  const yawDeg = deg(yawRad);
  const conf = clamp01(1 - vp.residual / VP_RESIDUAL_THRESHOLD_PX);
  return {
    yaw: derived(
      yawDeg,
      conf,
      true,
      `least-squares VP over ${lines.length} body lines`,
    ),
    residual: vp.residual,
    linesUsed: lines.length,
  };
}

function normalizeForParallax(
  frames: PoseFrame[],
  phases: SwingPhases,
  yawDeg: number,
  width: number,
  height: number,
): PoseFrame[] {
  const yawRad = rad(yawDeg);
  const deltaPsi = yawRad;
  const addressIdx = phases.address.frameIndex;
  const topIdx = phases.top.frameIndex;
  const impactIdx = phases.impact.frameIndex;
  const addressFrame = frames[addressIdx];
  const topFrame = frames[topIdx];
  const impactFrame = frames[impactIdx];
  if (!addressFrame || !topFrame || !impactFrame) {
    return frames;
  }

  const handYs = [LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_HIP, RIGHT_HIP].flatMap(
    (index) => {
      const topPt = joint(topFrame, index);
      const impactPt = joint(impactFrame, index);
      if (!topPt || !impactPt) {
        return [];
      }
      return [Math.abs(impactPt.y - topPt.y)];
    },
  );
  const downswingVerticalExtent =
    handYs.length > 0 ? Math.max(...handYs) * height : height * 0.15;
  const handParallaxOffset =
    K_PARALLAX * Math.tan(deltaPsi) * downswingVerticalExtent;

  const cosYaw = Math.cos(yawRad);
  const tanYaw = Math.tan(yawRad);
  const pelvisScale = cosYaw;
  const pelvisDepthShift =
    PELVIS_RADIUS_EFFECTIVE * tanYaw * (1 / width);

  return frames.map((frame) => ({
    ...frame,
    landmarks: frame.landmarks.map((landmark, index) => {
      const isHand =
        index === 15 ||
        index === 16 ||
        index === 13 ||
        index === 14;
      const isPelvis = index === LEFT_HIP || index === RIGHT_HIP;
      let x = landmark.x;
      const y = landmark.y;
      if (isHand) {
        x = clamp01(x - handParallaxOffset / width);
      }
      if (isPelvis) {
        x = clamp01(x * pelvisScale - pelvisDepthShift);
      }
      return { ...landmark, x, y };
    }),
  }));
}

function isInAppCapture(
  capturePath: EstimateAngleOptions["capturePath"],
  orientationSamples?: OrientationSample[],
) {
  const path = capturePath === "in_app" ? "in-app" : capturePath;
  return (
    path === "in-app" &&
    Boolean(orientationSamples && orientationSamples.length > 0)
  );
}

export function estimateCameraAngle(
  options: EstimateAngleOptions,
): EstimateAngleResult {
  const started = performance.now();
  const {
    frames,
    phases,
    imageWidth,
    imageHeight,
    capturePath,
    orientationSamples = [],
    verticalRoll,
  } = options;

  const rawFrames = frames;
  if (!phases.address.valid || frames.length === 0) {
    const elapsedMs = performance.now() - started;
    return {
      rawFrames,
      normalizedFrames: null,
      angle: {
        case: "B",
        roll: invalidDerived(0, "no address frame"),
        pitch: invalidDerived(0, "no address frame"),
        yaw: invalidDerived(0, "no address frame"),
        lambda: invalidDerived(0, "no address frame"),
        classification: invalidDerived("refuse", "no address frame"),
        confidence: 0,
        valid: false,
        reason: "angle",
        elapsedMs,
      },
    };
  }

  const addressFrame = frames[phases.address.frameIndex]!;
  const lambdaDerived = computeLambda(addressFrame);
  const lambdaValue = lambdaDerived.valid ? lambdaDerived.value : 0;

  let angleCase: AngleCase = "B";
  let rollDeg = 0;
  let pitchDeg = 0;
  let rollDerived: Derived<number>;
  let pitchDerived: Derived<number>;
  let yawDerived: Derived<number>;
  let classification: AngleClassification = "refuse";
  let overallConfidence = 0;
  let reason: string | null = null;
  let workingFrames = frames;

  const useCaseA = isInAppCapture(capturePath, orientationSamples);
  if (useCaseA) {
    angleCase = "A";
    const orient = orientationAtTime(
      orientationSamples,
      phases.address.timeMs / 1000,
    );
    if (!orient) {
      rollDerived = invalidDerived(0, "no orientation at address");
      pitchDerived = invalidDerived(0, "no orientation at address");
      yawDerived = invalidDerived(0, "no orientation at address");
      classification = "refuse";
      reason = "angle";
    } else {
      rollDeg = orient.roll;
      pitchDeg = orient.pitch;
      rollDerived = derived(rollDeg, 0.85, true, "DeviceOrientation gamma");
      pitchDerived = derived(pitchDeg, 0.85, true, "DeviceOrientation beta−90");
      workingFrames = warpFramesRollPitch(
        frames,
        imageWidth,
        imageHeight,
        rollDeg,
        pitchDeg,
      );
      const addressWarped = workingFrames[phases.address.frameIndex]!;
      const yawResult = yawFromAddressFrame(addressWarped, imageWidth);
      yawDerived = yawResult.yaw;

      if (
        !yawResult.yaw.valid ||
        yawResult.residual > VP_RESIDUAL_THRESHOLD_PX
      ) {
        angleCase = "B";
        reason = `VP residual ${yawResult.residual.toFixed(1)}px exceeds threshold; Case B classifier`;
        const rollFromHough = verticalRoll;
        if (rollFromHough?.valid) {
          rollDeg = rollFromHough.rollDeg;
          rollDerived = derived(
            rollDeg,
            rollFromHough.confidence,
            true,
            rollFromHough.reason,
          );
        } else {
          rollDerived = invalidDerived(
            0,
            rollFromHough?.reason ?? "no vertical Hough roll",
          );
        }
        pitchDerived = invalidDerived(0, "Case B upload path has no pitch");
        classification = classifyFromLambda(lambdaValue);
        yawDerived = invalidDerived(0, "Case B classifier — yaw not measured");
        overallConfidence = rollFromHough?.valid
          ? rollFromHough.confidence * 0.6
          : 0.35;
      } else {
        classification = classifyFromYaw(yawResult.yaw.value);
        overallConfidence = yawResult.yaw.confidence;
      }
    }
  } else {
    angleCase = "B";
    const rollFromHough = verticalRoll;
    if (rollFromHough?.valid) {
      rollDeg = rollFromHough.rollDeg;
      rollDerived = derived(
        rollDeg,
        rollFromHough.confidence,
        true,
        rollFromHough.reason ?? "background vertical Hough",
      );
    } else {
      rollDerived = invalidDerived(
        0,
        rollFromHough?.reason ?? "no confident vertical — skipped",
      );
    }
    pitchDerived = invalidDerived(0, "upload path has no tilt sensor");
    yawDerived = invalidDerived(0, "Case B classifier — yaw not measured");
    classification = classifyFromLambda(lambdaValue);
    overallConfidence = rollFromHough?.valid
      ? rollFromHough.confidence * 0.55 + (lambdaDerived.valid ? 0.25 : 0)
      : lambdaDerived.valid
        ? 0.45
        : 0.2;
    if (!rollFromHough?.valid && rollFromHough?.reason) {
      reason = rollFromHough.reason;
    }
  }

  const valid = passesRefuseGate(classification);
  if (!valid) {
    reason = "angle";
  }

  const classificationDerived = derived(
    classification,
    overallConfidence,
    valid,
    valid ? null : "angle",
  );

  let normalizedFrames: PoseFrame[] | null = null;
  if (angleCase === "A" && valid && yawDerived.valid) {
    normalizedFrames = normalizeForParallax(
      workingFrames,
      phases,
      yawDerived.value,
      imageWidth,
      imageHeight,
    );
  }

  const elapsedMs = performance.now() - started;

  return {
    rawFrames,
    normalizedFrames,
    angle: {
      case: angleCase,
      roll: rollDerived,
      pitch: pitchDerived,
      yaw: yawDerived,
      lambda: lambdaDerived,
      classification: classificationDerived,
      confidence: overallConfidence,
      valid,
      reason,
      elapsedMs,
    },
  };
}

export function angleFromUnknown(value: unknown): StoredAngle | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Partial<StoredAngle>;
  if (record.case !== "A" && record.case !== "B") {
    return null;
  }
  if (!record.roll || !record.pitch || !record.yaw || !record.lambda) {
    return null;
  }
  if (!record.classification) {
    return null;
  }
  return record as StoredAngle;
}

export function labeledAngleMismatch(
  labeled: "dtl" | "face_on" | null | undefined,
  angle: StoredAngle | null,
): boolean {
  if (!labeled || !angle?.classification.valid) {
    return false;
  }
  return angle.classification.value !== labeled;
}
