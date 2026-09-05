"use client";

import type { PoseStatus } from "@/lib/pose/status";
import { processingStageFromPose } from "@/lib/reveal/processing-stages";

export function ProcessingTheater({
  videoSrc,
  status,
  strikeWindowStart,
  strikeWindowEnd,
}: {
  videoSrc: string;
  status: PoseStatus | null;
  strikeWindowStart?: number;
  strikeWindowEnd?: number;
}) {
  const stage = processingStageFromPose(status);
  const trimStart = strikeWindowStart ?? 0;
  const trimEnd = strikeWindowEnd ?? 1;
  const windowPct = Math.max(trimEnd - trimStart, 0.001);

  return (
    <section
      className="flex min-h-[50vh] flex-col items-center justify-center"
      data-testid="reveal-processing"
      data-stage={stage.message}
    >
      <div className="relative w-full max-w-[16rem] overflow-hidden rounded-2xl bg-black opacity-60">
        <video
          className="aspect-[9/16] w-full object-contain"
          src={videoSrc}
          playsInline
          muted
          autoPlay
          loop
          preload="auto"
        />
        <div className="absolute inset-0 bg-black/35" />
        {strikeWindowStart != null && strikeWindowEnd != null ? (
          <div className="absolute inset-x-4 bottom-4 h-1 overflow-hidden rounded-full bg-white/15">
            <div
              className="absolute top-0 h-full rounded-full bg-[#c8f542]/70"
              style={{
                left: `${(trimStart / windowPct) * 0}%`,
                width: `${Math.min(100, ((trimEnd - trimStart) / windowPct) * 100)}%`,
              }}
            />
          </div>
        ) : null}
      </div>
      <p className="mt-6 text-lg font-semibold tracking-tight">{stage.message}</p>
      <div className="mt-4 h-1 w-48 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-[#c8f542] transition-all duration-300"
          style={{ width: `${Math.round(stage.progress * 100)}%` }}
        />
      </div>
    </section>
  );
}
