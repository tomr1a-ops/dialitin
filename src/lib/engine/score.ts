import type { ClubFamily } from "@/lib/admin/test-swings";
import type { SkillLevel } from "@/lib/engine/bands";
import type { MetricEvaluation } from "@/lib/engine/evaluate";

/** Sec 6.5 — internal only; never rendered to golfers. */
export function computeDialItInScore(input: {
  evaluations: Record<string, MetricEvaluation>;
  level: SkillLevel;
  clubFamily: ClubFamily;
}): number | null {
  const readable = Object.values(input.evaluations).filter(
    (ev) =>
      ev.status === "pass" ||
      ev.status === "fail" ||
      (ev.status === "no-band" && ev.value !== null && ev.confidence >= 0.5),
  );

  if (readable.length === 0) {
    return null;
  }

  let totalWeight = 0;
  let weighted = 0;

  for (const ev of readable) {
    if (ev.value === null) {
      continue;
    }
    const weight = ev.confidence;
    totalWeight += weight;
    if (ev.status === "pass") {
      weighted += 100 * weight;
    } else if (ev.status === "fail" && ev.deviation !== null) {
      const penalty = Math.min(100, ev.deviation * 35);
      weighted += Math.max(0, 100 - penalty) * weight;
    } else {
      weighted += 50 * weight;
    }
  }

  if (totalWeight <= 0) {
    return null;
  }

  return Math.round(weighted / totalWeight);
}

/** Rolling best-of-three for stability (6.5). */
export function rollingBestOfThree(scores: number[]): number | null {
  const valid = scores.filter((s) => Number.isFinite(s));
  if (valid.length === 0) {
    return null;
  }
  const sorted = [...valid].sort((a, b) => b - a);
  const top = sorted.slice(0, 3);
  return Math.round(top.reduce((a, b) => a + b, 0) / top.length);
}
