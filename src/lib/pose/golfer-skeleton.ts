import {
  LEFT_ANKLE,
  LEFT_ELBOW,
  LEFT_HIP,
  LEFT_KNEE,
  LEFT_SHOULDER,
  LEFT_WRIST,
  RIGHT_ANKLE,
  RIGHT_ELBOW,
  RIGHT_HIP,
  RIGHT_KNEE,
  RIGHT_SHOULDER,
  RIGHT_WRIST,
} from "@/lib/pose/types";

/** MediaPipe BlazePose — left/right ear (midpoint becomes head point). */
export const LEFT_EAR = 7;
export const RIGHT_EAR = 8;

/** Virtual joint — ear midpoint; not a raw MediaPipe index. */
export const GOLFER_HEAD = "head" as const;

export type GolferSkeletonJoint =
  | typeof GOLFER_HEAD
  | typeof LEFT_SHOULDER
  | typeof RIGHT_SHOULDER
  | typeof LEFT_ELBOW
  | typeof RIGHT_ELBOW
  | typeof LEFT_WRIST
  | typeof RIGHT_WRIST
  | typeof LEFT_HIP
  | typeof RIGHT_HIP
  | typeof LEFT_KNEE
  | typeof RIGHT_KNEE
  | typeof LEFT_ANKLE
  | typeof RIGHT_ANKLE;

/** Golfer-facing overlay: 12 body joints + one head point (ear midpoint). */
export const GOLFER_SKELETON_JOINTS: readonly GolferSkeletonJoint[] = [
  GOLFER_HEAD,
  LEFT_SHOULDER,
  RIGHT_SHOULDER,
  LEFT_ELBOW,
  RIGHT_ELBOW,
  LEFT_WRIST,
  RIGHT_WRIST,
  LEFT_HIP,
  RIGHT_HIP,
  LEFT_KNEE,
  RIGHT_KNEE,
  LEFT_ANKLE,
  RIGHT_ANKLE,
];

export const GOLFER_SKELETON_CONNECTIONS: ReadonlyArray<
  readonly [GolferSkeletonJoint, GolferSkeletonJoint]
> = [
  [GOLFER_HEAD, LEFT_SHOULDER],
  [GOLFER_HEAD, RIGHT_SHOULDER],
  [LEFT_SHOULDER, RIGHT_SHOULDER],
  [LEFT_SHOULDER, LEFT_ELBOW],
  [LEFT_ELBOW, LEFT_WRIST],
  [RIGHT_SHOULDER, RIGHT_ELBOW],
  [RIGHT_ELBOW, RIGHT_WRIST],
  [LEFT_SHOULDER, LEFT_HIP],
  [RIGHT_SHOULDER, RIGHT_HIP],
  [LEFT_HIP, RIGHT_HIP],
  [LEFT_HIP, LEFT_KNEE],
  [LEFT_KNEE, LEFT_ANKLE],
  [RIGHT_HIP, RIGHT_KNEE],
  [RIGHT_KNEE, RIGHT_ANKLE],
];

const JOINT_TO_LANDMARK: Partial<Record<GolferSkeletonJoint, number>> = {
  [LEFT_SHOULDER]: LEFT_SHOULDER,
  [RIGHT_SHOULDER]: RIGHT_SHOULDER,
  [LEFT_ELBOW]: LEFT_ELBOW,
  [RIGHT_ELBOW]: RIGHT_ELBOW,
  [LEFT_WRIST]: LEFT_WRIST,
  [RIGHT_WRIST]: RIGHT_WRIST,
  [LEFT_HIP]: LEFT_HIP,
  [RIGHT_HIP]: RIGHT_HIP,
  [LEFT_KNEE]: LEFT_KNEE,
  [RIGHT_KNEE]: RIGHT_KNEE,
  [LEFT_ANKLE]: LEFT_ANKLE,
  [RIGHT_ANKLE]: RIGHT_ANKLE,
};

export function golferJointLandmarkIndex(joint: GolferSkeletonJoint): number | null {
  if (joint === GOLFER_HEAD) {
    return null;
  }
  return JOINT_TO_LANDMARK[joint] ?? null;
}
