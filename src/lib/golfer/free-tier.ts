/** Free tier: 1 diagnosis + 2 retests per golfer_id (Sec 7, 11). */

export type UsageCounts = {
  diagnosesUsed: number;
  retestsUsed: number;
};

export type FreeTierCheck = {
  allowed: boolean;
  reason?: string;
  showPaywall: boolean;
};

export function checkFreeTier(
  usage: UsageCounts,
  mode: "diagnose" | "retest",
): FreeTierCheck {
  if (mode === "diagnose") {
    if (usage.diagnosesUsed >= 1) {
      return {
        allowed: false,
        showPaywall: true,
        reason: "Free diagnosis used. Range Session coming soon.",
      };
    }
    return { allowed: true, showPaywall: false };
  }

  if (usage.retestsUsed >= 2) {
    return {
      allowed: false,
      showPaywall: true,
      reason: "Free retests used. Continue with a Range Session (coming soon).",
    };
  }
  return { allowed: true, showPaywall: false };
}

export function nextUsage(
  usage: UsageCounts,
  mode: "diagnose" | "retest",
): UsageCounts {
  if (mode === "diagnose") {
    return { ...usage, diagnosesUsed: usage.diagnosesUsed + 1 };
  }
  return { ...usage, retestsUsed: usage.retestsUsed + 1 };
}
