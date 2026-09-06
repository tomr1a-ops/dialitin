"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildRevealSessionFromCapture,
  RevealFlow,
} from "@/components/reveal/reveal-flow";
import { getCaptureSession, updateCaptureSession } from "@/lib/capture/session";
import type { IngestResult } from "@/lib/capture/types";
import { estimateCameraAngle } from "@/lib/engine/angle";
import { ingestClip } from "@/lib/ingest/ingest-clip";
import { createPlaceholderRevealInput } from "@/lib/reveal/placeholder";
import { explainPoseFailure } from "@/lib/pose/errors";
import { formatPoseStatus, type PoseStatus } from "@/lib/pose/status";

let poseInFlight: Promise<void> | null = null;

function readSession() {
  if (typeof window === "undefined") {
    return null;
  }
  return getCaptureSession();
}

export function RevealView() {
  const session = readSession();
  const [result, setResult] = useState<IngestResult | null>(
    session?.result ?? null,
  );
  const [poseError, setPoseError] = useState(session?.poseError ?? null);
  const [status, setStatus] = useState<PoseStatus | null>(
    session?.result ? { phase: "done" } : null,
  );

  const runPose = useCallback(() => {
    if (poseInFlight) {
      return poseInFlight;
    }
    poseInFlight = (async () => {
      const current = getCaptureSession();
      if (!current) {
        return;
      }
      setPoseError(null);
      setResult(null);
      updateCaptureSession({ result: null, poseError: null });
      setStatus({ phase: "loading-model", loadedBytes: 0, totalBytes: 1 });
      try {
        const next = await ingestClip(current.clip, {
          capturePath: current.capturePath,
          fileName: current.fileName,
          audioContext: current.audioContext,
          orientationSamples: current.orientationSamples,
          grantedCamera: current.grantedCamera,
          onProgress: setStatus,
        });
        setResult(next);
        setStatus({
          phase: "done",
          path: next.posePath === "unavailable" ? undefined : next.posePath,
        });
        updateCaptureSession({ result: next, poseError: null });
      } catch (error) {
        const explained = explainPoseFailure(error);
        setPoseError(explained);
        setStatus(null);
        updateCaptureSession({ result: null, poseError: explained });
      }
    })().finally(() => {
      poseInFlight = null;
    });
    return poseInFlight;
  }, []);

  useEffect(() => {
    if (session && !session.result && !session.poseError) {
      void runPose();
    }
  }, [runPose, session]);

  const revealSession = useMemo(() => {
    if (!session || !result) {
      return null;
    }
    const angleReport = estimateCameraAngle({
      frames: result.keypoints,
      phases: result.phases,
      imageWidth: result.resolution.width,
      imageHeight: result.resolution.height,
      capturePath: result.capturePath,
      orientationSamples: result.orientationSamples,
    });
    const angle =
      angleReport.angle.classification.value === "face_on" ? "face_on" : "dtl";
    return buildRevealSessionFromCapture(
      session.clipUrl,
      result.keypoints,
      result.phases,
      {
        handedness: "right",
        angle,
        input: createPlaceholderRevealInput(angle),
      },
    );
  }, [result, session]);

  if (!session) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center px-6">
        <p className="text-center text-white/70">
          No clip in this tab yet. Capture a swing first.
        </p>
        <Link
          href="/capture"
          className="mt-6 min-h-12 rounded-full bg-[#c8f542] px-6 py-3 text-[1.05rem] font-semibold text-[#0b1210]"
        >
          Start over
        </Link>
      </main>
    );
  }

  const statusText = status ? formatPoseStatus(status) : "";
  const swingFound = Boolean(result?.phases.impact.valid);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[22rem] flex-col px-5 py-5">
      <Link
        href="/capture"
        className="self-start text-sm text-white/55 underline-offset-4 hover:underline"
      >
        Start over
      </Link>

      {poseError ? (
        <div className="mt-4 space-y-3" data-pose-error="1">
          <p className="text-sm font-semibold leading-relaxed text-[#f3c36a]">
            {poseError.userMessage}
          </p>
          <p className="text-[0.72rem] leading-relaxed text-white/45">
            {poseError.technicalReason}
          </p>
          <button
            type="button"
            className="min-h-11 w-full rounded-full bg-[#c8f542] text-sm font-semibold text-[#0b1210]"
            onClick={() => void runPose()}
          >
            Try again
          </button>
        </div>
      ) : null}

      {!result || !revealSession ? (
        <>
          <RevealFlow
            session={buildRevealSessionFromCapture(
              session.clipUrl,
              [],
              {
                address: {
                  frameIndex: 0,
                  timeMs: 0,
                  confidence: 0,
                  valid: false,
                  reason: "pending",
                },
                takeaway: {
                  frameIndex: 0,
                  timeMs: 0,
                  confidence: 0,
                  valid: false,
                  reason: "pending",
                },
                top: {
                  frameIndex: 0,
                  timeMs: 0,
                  confidence: 0,
                  valid: false,
                  reason: "pending",
                },
                impact: {
                  frameIndex: 0,
                  timeMs: 0,
                  confidence: 0,
                  valid: false,
                  reason: "pending",
                },
                finish: {
                  frameIndex: 0,
                  timeMs: 0,
                  confidence: 0,
                  valid: false,
                  reason: "pending",
                },
                impactCandidate: {
                  valid: false,
                  value: "fused",
                  confidence: 0,
                  reason: "pending",
                },
                effectiveFrameRate: {
                  valid: false,
                  value: 30,
                  confidence: 0,
                  reason: "pending",
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
                  reason: "pending",
                },
              },
              { input: createPlaceholderRevealInput() },
            )}
            poseStatus={status}
          />
          {statusText ? (
            <p
              className="mt-3 text-sm leading-relaxed text-white/80"
              data-pose-status={status?.phase}
            >
              {statusText}
            </p>
          ) : null}
        </>
      ) : (
        <div className="mt-4" data-swing-found={swingFound ? "1" : "0"}>
          <RevealFlow
            session={revealSession}
            poseStatus={status}
            initialScreen="swing_found"
          />
        </div>
      )}

      {result ? (
        <footer
          className="mt-5 space-y-1 text-[0.72rem] leading-relaxed text-white/50"
          data-pose-fps={result.poseFpsProcessed.toFixed(2)}
          data-resolution={`${result.resolution.width}x${result.resolution.height}`}
          data-capture-path={session.capturePath}
          data-pose-path={result.posePath}
        >
          <p>
            {session.capturePath} · {result.resolution.width}×
            {result.resolution.height} · {result.posePath}
          </p>
        </footer>
      ) : null}
    </main>
  );
}
