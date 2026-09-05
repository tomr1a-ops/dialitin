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
};

export const POSE_LANDMARK_COUNT = 33;
export const LEFT_HIP = 23;
export const RIGHT_HIP = 24;
export const LEFT_WRIST = 15;
export const RIGHT_WRIST = 16;
export const CROP_MARGIN = 0.38;
/** Short side of the pose work canvas. Keep aspect; never upscale. */
export const POSE_SHORT_SIDE = 640;
