import { applyAngleGate } from "@/lib/harvest/angle-gate";
import { clubFamilyFromTitle, isKnownClubFamily } from "@/lib/harvest/club-family";
import { HARVEST_LICENSE_NOTE } from "@/lib/harvest/constants";
import { suggestedFaultFromTitle } from "@/lib/harvest/fault-keywords";
import {
  findSwingSegments,
  slicePoseFrames,
  type SwingSegment,
} from "@/lib/harvest/swing-finder";
import type { HarvestTier } from "@/lib/harvest/constants";
import { estimateCameraAngle } from "@/lib/engine/angle";
import { computeSwingMetrics } from "@/lib/engine/metrics/storage";
import { findSwingPhases } from "@/lib/engine/phases";
import type { ClubFamily, Handedness } from "@/lib/admin/test-swings";
import type { PoseFrame } from "@/lib/pose/types";

export type PipelineInput = {
  swingId: string;
  title: string;
  tier: HarvestTier | null;
  storagePath: string;
  handedness: Handedness;
  frames: PoseFrame[];
  frameRateDetected: number;
  parentId?: string | null;
  segment?: SwingSegment | null;
};

export type PipelineResult = {
  excluded: boolean;
  excludeReason: string | null;
  angle: ReturnType<typeof estimateCameraAngle>["angle"];
  phases: ReturnType<typeof findSwingPhases>;
  metrics: ReturnType<typeof computeSwingMetrics>;
  normalizedFrames: PoseFrame[] | null;
  clubFamily: ClubFamily | null;
  proLabelFault1: string | null;
  labelStatus: "suggested" | "confirmed" | null;
  childSegments: SwingSegment[];
  updates: Record<string, unknown>;
};

export function runHarvestPipeline(input: PipelineInput): PipelineResult {
  let frames = input.frames;
  if (input.segment) {
    frames = slicePoseFrames(frames, input.segment);
  }

  const capturePath = "native_slomo" as const;
  const phases = findSwingPhases(frames, {
    handedness: input.handedness,
    capturePath,
    labeledFrameRate: Math.round(input.frameRateDetected),
    fileName: input.storagePath,
  });

  const angleResult = estimateCameraAngle({
    frames,
    phases,
    imageWidth: 1080,
    imageHeight: 1920,
    capturePath,
    handedness: input.handedness,
  });

  const gate = applyAngleGate(angleResult.angle);
  const clubFromTitle = clubFamilyFromTitle(input.title);
  const clubFamily = isKnownClubFamily(clubFromTitle) ? clubFromTitle : null;

  const metrics = computeSwingMetrics({
    frames,
    normalizedFrames: angleResult.normalizedFrames,
    phases,
    angle: angleResult.angle,
    handedness: input.handedness,
    clubFamily,
    intent: "stock",
    capturePath,
  });

  let proLabelFault1: string | null = null;
  let labelStatus: "suggested" | "confirmed" | null = null;
  if (input.tier === "answer_key") {
    proLabelFault1 = suggestedFaultFromTitle(input.title);
    labelStatus = proLabelFault1 ? "suggested" : null;
  }

  const childSegments =
    !input.parentId && !input.segment ? findSwingSegments(frames, input.handedness) : [];

  const excluded = !gate.pass;
  const excludeReason = excluded ? gate.reason : null;

  const updates: Record<string, unknown> = {
    angle: gate.pass ? gate.classification : null,
    club_family: clubFamily,
    capture_path: capturePath,
    frame_rate: Math.round(input.frameRateDetected),
    license_note: HARVEST_LICENSE_NOTE,
    excluded,
    exclude_reason: excludeReason,
    pro_label_fault_1: proLabelFault1,
    label_status: labelStatus,
  };

  if (input.segment) {
    updates.segment_start_ms = input.segment.startMs;
    updates.segment_end_ms = input.segment.endMs;
  }

  return {
    excluded,
    excludeReason,
    angle: angleResult.angle,
    phases,
    metrics,
    normalizedFrames: angleResult.normalizedFrames,
    clubFamily,
    proLabelFault1,
    labelStatus,
    childSegments,
    updates,
  };
}
