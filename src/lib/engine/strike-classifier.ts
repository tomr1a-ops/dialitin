/**
 * Strike classifier scaffold — gradient boosting / tiny CNN placeholder.
 * Training script reads labeled rows from test_swing_keypoints.strike_label.
 */

import type { StrikeFeatures, StrikeQuality } from "@/lib/engine/strike";
import { classifyStrikeQuality } from "@/lib/engine/strike";

export type StrikeLabel =
  | "center"
  | "heel"
  | "toe"
  | "thin"
  | "fat";

export type LabeledStrikeRow = {
  id: string;
  strike_features: StrikeFeatures;
  strike_label: StrikeLabel;
  capture_path: string;
  club_family: string;
};

export type StrikeClassifier = {
  enabled: boolean;
  predict(features: StrikeFeatures): StrikeQuality;
};

export const STRIKE_CLASSIFIER_OFF: StrikeClassifier = {
  enabled: false,
  predict: classifyStrikeQuality,
};

export function createStrikeClassifier(enabled: boolean): StrikeClassifier {
  if (!enabled) {
    return STRIKE_CLASSIFIER_OFF;
  }
  return {
    enabled: true,
    predict: classifyStrikeQuality,
  };
}

/** Read labeled rows and train — no-op until labels exist. */
export async function trainStrikeClassifier(
  _rows: LabeledStrikeRow[],
): Promise<StrikeClassifier> {
  return STRIKE_CLASSIFIER_OFF;
}
