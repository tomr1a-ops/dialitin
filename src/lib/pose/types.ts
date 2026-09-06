export type PoseLandmark = {
  x: number;
  y: number;
  visibility: number;
};

export type CropBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PoseFrame = {
  mediaTime: number;
  landmarks: PoseLandmark[];
  crop: CropBox;
  /** False when golfer tracking was lost and landmarks were zeroed. */
  tracked?: boolean;
};

export const POSE_LANDMARK_COUNT = 33;
export const LEFT_SHOULDER = 11;
export const RIGHT_SHOULDER = 12;
export const LEFT_ELBOW = 13;
export const RIGHT_ELBOW = 14;
export const LEFT_WRIST = 15;
export const RIGHT_WRIST = 16;
export const LEFT_HIP = 23;
export const RIGHT_HIP = 24;
export const LEFT_KNEE = 25;
export const RIGHT_KNEE = 26;
export const LEFT_ANKLE = 27;
export const RIGHT_ANKLE = 28;
export const LEFT_HEEL = 29;
export const RIGHT_HEEL = 30;
export const CROP_MARGIN = 0.38;
/** Short side of the pose work canvas. Keep aspect; never upscale. */
export const POSE_SHORT_SIDE = 640;
