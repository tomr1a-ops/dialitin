"use client";

import { RevealFlow } from "@/components/reveal/reveal-flow";
import type { RevealSession } from "@/lib/reveal/types";

export function DemoRevealWorkspace({
  session,
}: {
  session: RevealSession;
}) {
  return (
    <div className="max-w-[22rem]">
      <h1 className="text-xl font-semibold tracking-tight">Reveal demo (G01)</h1>
      <p className="mt-1 text-sm text-white/60">
        Phase 2 end-to-end with real rules-engine diagnosis.
      </p>
      <div className="mt-6">
        <RevealFlow
          session={session}
          poseStatus={{ phase: "done" }}
          demoMode
          initialScreen="annotated"
          autoAdvance={false}
        />
      </div>
    </div>
  );
}
