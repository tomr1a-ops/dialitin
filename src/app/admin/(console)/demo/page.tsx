import { DemoRevealWorkspace } from "@/components/reveal/demo-reveal-workspace";
import { getG01DemoSession } from "@/lib/reveal/g01-demo";
import { createPlaceholderRevealInput } from "@/lib/reveal/placeholder";
import type { RevealSession } from "@/lib/reveal/types";

export const dynamic = "force-dynamic";

function placeholderDemoSession(angle: "dtl" | "face_on" = "dtl"): RevealSession {
  return {
    videoSrc: "",
    keypoints: [],
    phases: {
      address: {
        frameIndex: 0,
        timeMs: 0,
        confidence: 0,
        valid: false,
        reason: "demo",
      },
      takeaway: {
        frameIndex: 0,
        timeMs: 0,
        confidence: 0,
        valid: false,
        reason: "demo",
      },
      top: {
        frameIndex: 0,
        timeMs: 0,
        confidence: 0,
        valid: false,
        reason: "demo",
      },
      impact: {
        frameIndex: 0,
        timeMs: 0,
        confidence: 0,
        valid: false,
        reason: "demo",
      },
      finish: {
        frameIndex: 0,
        timeMs: 0,
        confidence: 0,
        valid: false,
        reason: "demo",
      },
      impactCandidate: {
        valid: false,
        value: "fused",
        confidence: 0,
        reason: "demo",
      },
      effectiveFrameRate: {
        valid: false,
        value: 30,
        confidence: 0,
        reason: "demo",
      },
      sloMoReexportedAt30: {
        valid: true,
        value: false,
        confidence: 1,
        reason: null,
      },
      trim: {
        valid: false,
        value: { startMs: 0, endMs: 0 },
        confidence: 0,
        reason: "demo",
      },
    },
    handedness: "right",
    angle,
    input: createPlaceholderRevealInput(angle),
  };
}

export default async function AdminDemoPage() {
  const session = await getG01DemoSession();

  if (!session) {
    return (
      <div className="space-y-6">
        <div className="space-y-3">
          <h1 className="text-xl font-semibold">Reveal demo</h1>
          <p className="text-sm text-white/70">
            G01 test swing not found. Showing Phase 2b placeholder screens below.
          </p>
        </div>
        <DemoRevealWorkspace session={placeholderDemoSession("dtl")} />
      </div>
    );
  }

  return <DemoRevealWorkspace session={session} />;
}
