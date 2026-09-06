export type PoseUserError = {
  userMessage: string;
  technicalReason: string;
};

function asMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}

export function explainPoseFailure(error: unknown): PoseUserError {
  const technicalReason = asMessage(error);
  const lowered = technicalReason.toLowerCase();
  const modelLoadFailed =
    lowered.includes("failed to fetch") ||
    lowered.includes("network") ||
    lowered.includes("load failed") ||
    lowered.includes("connection") ||
    lowered.includes("download");

  if (modelLoadFailed) {
    return {
      userMessage: "Couldn't load the pose model. Connection dropped",
      technicalReason,
    };
  }

  return {
    userMessage: `Pose failed to start: ${technicalReason}`,
    technicalReason,
  };
}
