"use client";

import Link from "next/link";
import type { RevealInput } from "@/lib/reveal/types";
import {
  assertRevealInputConfidence,
  isNonFaultReveal,
  metricEligibleForReveal,
} from "@/lib/reveal/confidence-gate";

export function FixScreen({
  input,
  isFirstResult = false,
}: {
  input: RevealInput;
  isFirstResult?: boolean;
}) {
  assertRevealInputConfidence(input);

  if (isNonFaultReveal(input)) {
    return (
      <section className="space-y-4" data-testid="fix-non-fault">
        <p className="text-sm text-white/70">
          No fix protocol for this result. Return to your reveal or film again.
        </p>
        <Link
          href="/reveal"
          className="inline-flex min-h-11 items-center rounded-full border border-white/20 px-5 text-sm font-semibold text-white"
        >
          Back to reveal
        </Link>
      </section>
    );
  }

  const showMetric = metricEligibleForReveal(input);

  return (
    <section className="space-y-5" data-testid="fix-screen">
      {input.headline ? (
        <h1 className="text-[1.35rem] font-semibold leading-snug">{input.headline}</h1>
      ) : null}

      {input.coachWhy ? (
        <p className="text-sm leading-relaxed text-white/80">{input.coachWhy}</p>
      ) : null}

      {input.feelSentence ? (
        <div className="rounded-2xl border border-[#c8f542]/30 bg-[#c8f542]/10 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#c8f542]">
            Feel cue
          </p>
          <p className="mt-2 text-sm leading-relaxed text-white/90">
            {input.feelSentence}
          </p>
        </div>
      ) : null}

      {isFirstResult && input.gripAndFaceLine ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/50">
            Grip and face
          </p>
          <p className="mt-2 text-sm leading-relaxed text-white/80">
            {input.gripAndFaceLine}
          </p>
        </div>
      ) : null}

      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/50">
          Drill · {input.drillDurationSec}s protocol
        </p>
        <p className="mt-2 text-lg font-semibold text-white">{input.drillName}</p>
        {showMetric ? (
          <p className="mt-2 text-sm text-white/60">
            Target: move {input.targetPosition.faultJointFamily}{" "}
            {Math.abs(input.targetPosition.targetDelta).toFixed(0)}% of stance width toward
            functional range.
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        {input.diagnosisId ? (
          <Link
            href="/capture?mode=retest"
            className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#c8f542] text-sm font-semibold text-[#0b1210]"
            data-testid="fix-retest-button"
          >
            Retest this fix
          </Link>
        ) : null}
        <Link
          href="/reveal"
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/20 text-sm font-semibold text-white/80"
        >
          Back to reveal
        </Link>
      </div>
    </section>
  );
}
