"use client";

import type { WhatChangedSinceDisplay } from "@/lib/reveal/types";

/** Display-only What Changed Since? (Section 6.13) — no engine diff in Phase 2b. */
export function WhatChangedSince({
  display,
}: {
  display: WhatChangedSinceDisplay;
}) {
  return (
    <section
      className="rounded-2xl border border-white/10 bg-white/5 p-4"
      data-testid="reveal-what-changed-since"
    >
      <h3 className="text-sm font-semibold uppercase tracking-wide text-white/50">
        What changed since {display.baselineDate}?
      </h3>
      <p className="mt-3 text-sm leading-relaxed text-white/85">
        {display.headline}
      </p>
      {display.guardMessage ? (
        <p className="mt-2 text-xs text-[#f3c36a]">{display.guardMessage}</p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2 text-[0.65rem] text-white/40">
        <span data-guard-camera={display.sameCamera ? "ok" : "blocked"}>
          {display.sameCamera ? "Same camera" : "Different camera. Compare blocked."}
        </span>
        <span data-guard-club={display.sameClub ? "ok" : "blocked"}>
          {display.sameClub ? "Same club" : "Different club. Compare blocked."}
        </span>
      </div>
    </section>
  );
}
