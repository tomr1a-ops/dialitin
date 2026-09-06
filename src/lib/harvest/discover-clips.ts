import { findSwingPhases } from "@/lib/engine/phases";
import {
  findSwingSegments,
  slicePoseFrames,
  type SwingSegment,
} from "@/lib/harvest/swing-finder";
import type { Handedness } from "@/lib/admin/test-swings";
import type { PoseFrame } from "@/lib/pose/types";

export type DiscoveredClip = {
  startMs: number;
  endMs: number;
  frames: PoseFrame[];
  frameRate: number;
  swingIndex: number;
};

function sliceFramesByTrim(
  frames: PoseFrame[],
  trimStartMs: number,
  trimEndMs: number,
): PoseFrame[] {
  const slice = frames.filter((frame) => {
    const ms = frame.mediaTime * 1000;
    return ms >= trimStartMs && ms <= trimEndMs;
  });
  if (slice.length === 0) {
    return [];
  }
  const baseTime = slice[0]!.mediaTime;
  return slice.map((frame, index) => ({
    ...frame,
    mediaTime: frame.mediaTime - baseTime,
    frameIndex: index,
  }));
}

function clipFromSegment(
  allFrames: PoseFrame[],
  segment: SwingSegment,
  frameRate: number,
  handedness: Handedness,
  swingIndex: number,
): DiscoveredClip | null {
  const segmentFrames = slicePoseFrames(allFrames, segment);
  const phases = findSwingPhases(segmentFrames, {
    handedness,
    capturePath: "native_slomo",
    labeledFrameRate: Math.round(frameRate),
  });
  const trim = phases.trim;
  if (trim.valid) {
    const frames = sliceFramesByTrim(
      segmentFrames,
      trim.value.startMs,
      trim.value.endMs,
    );
    if (frames.length === 0) {
      return null;
    }
    return {
      startMs: segment.startMs + trim.value.startMs,
      endMs: segment.startMs + trim.value.endMs,
      frames,
      frameRate,
      swingIndex,
    };
  }
  return {
    startMs: segment.startMs,
    endMs: segment.endMs,
    frames: segmentFrames,
    frameRate,
    swingIndex,
  };
}

/** Pose-based swing windows: 0.5s before address → 0.5s after finish per swing. */
export function discoverHarvestClips(
  frames: PoseFrame[],
  frameRate: number,
  handedness: Handedness = "right",
): DiscoveredClip[] {
  if (frames.length < 12) {
    return [];
  }

  const segments = findSwingSegments(frames, handedness);
  if (segments.length > 0) {
    return segments
      .map((segment, index) =>
        clipFromSegment(frames, segment, frameRate, handedness, index),
      )
      .filter((clip): clip is DiscoveredClip => clip !== null);
  }

  const phases = findSwingPhases(frames, {
    handedness,
    capturePath: "native_slomo",
    labeledFrameRate: Math.round(frameRate),
  });
  const trim = phases.trim;
  if (!trim.valid) {
    return [];
  }
  const clipFrames = sliceFramesByTrim(
    frames,
    trim.value.startMs,
    trim.value.endMs,
  );
  if (clipFrames.length === 0) {
    return [];
  }
  return [
    {
      startMs: trim.value.startMs,
      endMs: trim.value.endMs,
      frames: clipFrames,
      frameRate,
      swingIndex: 0,
    },
  ];
}
