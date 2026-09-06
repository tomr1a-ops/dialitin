"use client";

import { useCallback, useEffect } from "react";
import { estimateCameraAngle } from "@/lib/engine/angle";
import { computeSwingMetrics } from "@/lib/engine/metrics/storage";
import {
  AV_CLOCK_OFFSET_MS,
  AV_CLOCK_OFFSET_REASON,
  type CapturePathKey,
} from "@/lib/engine/phases";
import { ingestClip } from "@/lib/ingest/ingest-clip";

export type IngestRunnerResult = {
  ok: boolean;
  error?: string;
  detectedFrameRate?: number;
  frameCount?: number;
  sloMoReexportedAt30?: boolean;
  impactDiagnostics?: {
    audioTransientFrameIndex: number | null;
    motionPeakFrameIndex: number | null;
    motionImpactFrameIndex: number | null;
    measuredAvOffsetMs: number | null;
  };
  avClockOffsetMs?: number;
  avClockOffsetReason?: string;
  keypoints?: unknown[];
  lostFrameCount?: number;
  normalized_keypoints?: unknown[] | null;
  phases?: unknown;
  metrics?: unknown;
  angle?: unknown;
};

declare global {
  interface Window {
    __runIngest?: (
      clipBytes: ArrayBuffer,
      options: {
        capturePath: "upload" | "in-app";
        fileName?: string;
        handedness?: "right" | "left";
        labeledFrameRate?: number | null;
        clubFamily?: string | null;
        intent?: string | null;
      },
    ) => Promise<IngestRunnerResult>;
    __runIngestFromDom?: (
      options: {
        capturePath: "upload" | "in-app";
        fileName?: string;
        handedness?: "right" | "left";
        labeledFrameRate?: number | null;
        clubFamily?: string | null;
        intent?: string | null;
      },
    ) => Promise<IngestRunnerResult>;
    __ingestReady?: boolean;
  }
}

export default function IngestRunnerPage() {
  const runIngest = useCallback(
    async (
      clipBytes: ArrayBuffer,
      options: {
        capturePath: "upload" | "in-app";
        fileName?: string;
        handedness?: "right" | "left";
        labeledFrameRate?: number | null;
        clubFamily?: string | null;
        intent?: string | null;
      },
    ): Promise<IngestRunnerResult> => {
      try {
        const clip = new Blob([clipBytes], { type: "video/mp4" });
        const result = await ingestClip(clip, {
          capturePath: options.capturePath,
          fileName: options.fileName,
          handedness: options.handedness ?? "right",
          labeledFrameRate: options.labeledFrameRate,
        });
        const captureKey: CapturePathKey =
          options.capturePath === "in-app" ? "in_app" : "native_slomo";
        const angleResult = estimateCameraAngle({
          frames: result.keypoints,
          phases: result.phases,
          imageWidth: result.resolution.width,
          imageHeight: result.resolution.height,
          capturePath: captureKey,
          orientationSamples: result.orientationSamples,
          verticalRoll: null,
          handedness: options.handedness ?? "right",
        });
        const metrics = computeSwingMetrics({
          frames: result.keypoints,
          normalizedFrames: angleResult.normalizedFrames,
          phases: result.phases,
          angle: angleResult.angle,
          handedness: options.handedness ?? "right",
          clubFamily: options.clubFamily as never,
          intent: options.intent as never,
          capturePath: captureKey,
        });
        return {
          ok: true,
          detectedFrameRate: result.detectedFrameRate,
          frameCount: result.frameCount,
          sloMoReexportedAt30: result.phases.sloMoReexportedAt30.value,
          impactDiagnostics: result.impactDiagnostics,
          avClockOffsetMs: AV_CLOCK_OFFSET_MS[captureKey],
          avClockOffsetReason: AV_CLOCK_OFFSET_REASON[captureKey],
          keypoints: result.keypoints,
          lostFrameCount: result.lostFrameCount,
          normalized_keypoints: angleResult.normalizedFrames,
          phases: result.phases,
          metrics,
          angle: angleResult.angle,
        };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
    [],
  );

  useEffect(() => {
    window.__runIngest = runIngest;
    window.__runIngestFromDom = async (options) => {
      const input = document.querySelector(
        "input[data-ingest-file]",
      ) as HTMLInputElement | null;
      const file = input?.files?.[0];
      if (!file) {
        return { ok: false, error: "no file on ingest input" };
      }
      const clipBytes = await file.arrayBuffer();
      return runIngest(clipBytes, options);
    };
    window.__ingestReady = true;
    return () => {
      delete window.__runIngest;
      delete window.__runIngestFromDom;
      delete window.__ingestReady;
    };
  }, [runIngest]);

  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <input
        type="file"
        accept="video/*"
        data-ingest-file
        className="pointer-events-none fixed left-0 top-0 h-px w-px opacity-0"
        aria-hidden
      />
      <p data-ingest-ready="1" className="text-sm text-white/80">
        Ingest runner ready
      </p>
    </main>
  );
}
