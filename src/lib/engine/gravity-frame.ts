import type { StoredAngle } from "@/lib/engine/angle";

/** Rotate normalized image coords so plumb vertical aligns with gravity (§5.1 roll). */
export function gravityCorrectPoint(
  point: { x: number; y: number },
  rollDeg: number,
  center = { x: 0.5, y: 0.5 },
): { x: number; y: number } {
  const theta = (-rollDeg * Math.PI) / 180;
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

export function rollForGravityFrame(angle: StoredAngle | null): number {
  if (angle?.roll.valid) {
    return angle.roll.value;
  }
  return 0;
}

/** Signed degrees from vertical (0° = plumb); + = lean toward target side in image. */
export function tiltFromVerticalDeg(
  top: { x: number; y: number },
  bottom: { x: number; y: number },
): number {
  const dx = top.x - bottom.x;
  const dy = top.y - bottom.y;
  if (Math.hypot(dx, dy) < 1e-6) {
    return 0;
  }
  return (Math.atan2(dx, -dy) * 180) / Math.PI;
}
