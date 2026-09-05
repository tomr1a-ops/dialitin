import type { PoseFrame } from "@/lib/pose/types";

export function nearestPoseFrame(
  frames: PoseFrame[],
  mediaTime: number,
): PoseFrame | null {
  if (frames.length === 0) {
    return null;
  }
  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (frames[mid]!.mediaTime < mediaTime) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  const after = frames[lo]!;
  const before = frames[Math.max(lo - 1, 0)]!;
  return Math.abs(after.mediaTime - mediaTime) <
    Math.abs(before.mediaTime - mediaTime)
    ? after
    : before;
}
