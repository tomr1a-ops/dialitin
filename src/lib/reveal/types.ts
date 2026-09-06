import type { SwingPhases } from "@/lib/engine/phases";
import type { Handedness } from "@/lib/admin/test-swings";
import type { PoseFrame } from "@/lib/pose/types";

export type RevealFaultKey = "early_extension" | "hip_slide_down";

export type RevealJointFamily = "pelvis" | "head" | "hands";

export type RevealMetric = {
  key: "tush_line_pelvis" | "hip_slide_down";
  label: string;
  /** Normalized: % of stance width — never inches or degrees. */
  value: number;
  unit: "pct_stance";
  confidence: number;
  reason: string;
  bandMin: number;
  bandMax: number;
};

export type RevealTargetPosition = {
  faultJointFamily: RevealJointFamily;
  /** Delta in % stance width to move joint family into band. */
  targetDelta: number;
  bandMin: number;
  bandMax: number;
};

/** Phase 2b placeholder — swap for real diagnosis output in Phase 2. */
export type RevealInput = {
  fault: RevealFaultKey;
  metric: RevealMetric;
  feelSentence: string;
  drillName: string;
  drillDurationSec: number;
  targetPosition: RevealTargetPosition;
  /** First frame pelvis crosses tush line (ms from trim start). */
  firstGuiltyFrameMs: number;
  guiltyLabel: string;
  /** Best Swing Today pairing placeholder. */
  bestSwingTimestamp: string;
  /** Display-only What Changed Since? (Section 6.13). */
  whatChangedSince?: WhatChangedSinceDisplay;
};

export type WhatChangedSinceDisplay = {
  baselineDate: string;
  headline: string;
  guardMessage?: string;
  sameCamera: boolean;
  sameClub: boolean;
};

export type RevealSession = {
  videoSrc: string;
  keypoints: PoseFrame[];
  phases: SwingPhases;
  handedness: Handedness;
  angle: "dtl" | "face_on";
  input: RevealInput;
  /** Optional retest clip for before|after. */
  retestVideoSrc?: string;
  retestKeypoints?: PoseFrame[];
  retestPhases?: SwingPhases;
};

export type RevealScreen =
  | "processing"
  | "swing_found"
  | "annotated"
  | "show_me"
  | "target"
  | "before_after"
  | "receipt";

export const REVEAL_SCREEN_ORDER: RevealScreen[] = [
  "processing",
  "swing_found",
  "annotated",
  "show_me",
  "target",
  "before_after",
  "receipt",
];
