"use client";

import { useCallback, useMemo, useState } from "react";
import { AnnotatedPlayback } from "@/components/reveal/annotated-playback";
import { BeforeAfterCompare } from "@/components/reveal/before-after-compare";
import { FixReceipt } from "@/components/reveal/fix-receipt";
import { ProcessingTheater } from "@/components/reveal/processing-theater";
import { ShowMeWhy } from "@/components/reveal/show-me-why";
import { SwingFoundScreen } from "@/components/reveal/swing-found-screen";
import { TargetPosition } from "@/components/reveal/target-position";
import { WhatChangedSince } from "@/components/reveal/what-changed-since";
import type { PoseStatus } from "@/lib/pose/status";
import { createPlaceholderRevealInput } from "@/lib/reveal/placeholder";
import type { RevealScreen, RevealSession } from "@/lib/reveal/types";

export function RevealFlow({
  session,
  poseStatus,
  autoAdvance = true,
  initialScreen = "processing",
  demoMode = false,
}: {
  session: RevealSession;
  poseStatus?: PoseStatus | null;
  autoAdvance?: boolean;
  initialScreen?: RevealScreen;
  demoMode?: boolean;
}) {
  const [screen, setScreen] = useState<RevealScreen>(initialScreen);
  const input = session.input;

  const trim = session.phases.trim;
  const windowStart = trim?.valid ? trim.value.startMs / 1000 : 0;
  const windowEnd = trim?.valid
    ? trim.value.endMs / 1000
    : session.keypoints.at(-1)?.mediaTime ?? 1;
  const impactFrameIndex = session.phases.impact.valid
    ? session.phases.impact.frameIndex
    : Math.max(0, session.keypoints.length - 1);

  const strikeWindow = useMemo(() => {
    const impact = session.phases.impact;
    if (!impact.valid) {
      return { start: 0, end: session.keypoints.at(-1)?.mediaTime ?? 1 };
    }
    return {
      start: Math.max(0, impact.timeMs / 1000 - 0.5),
      end: impact.timeMs / 1000 + 0.3,
    };
  }, [session.keypoints, session.phases.impact]);

  const resolvedScreen =
    autoAdvance &&
    !demoMode &&
    screen === "processing" &&
    poseStatus?.phase === "done"
      ? "swing_found"
      : screen;

  const advance = useCallback((next: RevealScreen) => {
    setScreen(next);
  }, []);

  const afterVideoSrc = session.retestVideoSrc ?? session.videoSrc;
  const afterKeypoints = session.retestKeypoints ?? session.keypoints;
  const afterPhases = session.retestPhases ?? session.phases;

  return (
    <div className="mx-auto w-full max-w-[22rem]" data-reveal-screen={resolvedScreen}>
      {resolvedScreen === "processing" ? (
        <ProcessingTheater
          videoSrc={session.videoSrc}
          status={poseStatus ?? null}
          strikeWindowStart={strikeWindow.start}
          strikeWindowEnd={strikeWindow.end}
        />
      ) : null}

      {resolvedScreen === "swing_found" ? (
        <SwingFoundScreen
          videoSrc={session.videoSrc}
          keypoints={session.keypoints}
          windowStart={windowStart}
          windowEnd={windowEnd}
          onComplete={() => {
            if (autoAdvance || demoMode) {
              advance("annotated");
            }
          }}
        />
      ) : null}

      {resolvedScreen === "annotated" ? (
        <>
          <AnnotatedPlayback
            videoSrc={session.videoSrc}
            keypoints={session.keypoints}
            phases={session.phases}
            handedness={session.handedness}
            angle={session.angle}
            input={input}
          />
          <ShowMeWhy input={input} />
        </>
      ) : null}

      {resolvedScreen === "show_me" ? (
        <>
          <AnnotatedPlayback
            videoSrc={session.videoSrc}
            keypoints={session.keypoints}
            phases={session.phases}
            handedness={session.handedness}
            angle={session.angle}
            input={input}
          />
          <ShowMeWhy input={input} />
        </>
      ) : null}

      {resolvedScreen === "target" ? (
        <TargetPosition
          still={session.videoSrc}
          keypoints={session.keypoints}
          frameIndex={impactFrameIndex}
          handedness={session.handedness}
          input={input}
        />
      ) : null}

      {resolvedScreen === "before_after" ? (
        <BeforeAfterCompare
          beforeVideoSrc={session.videoSrc}
          beforeKeypoints={session.keypoints}
          beforePhases={session.phases}
          afterVideoSrc={afterVideoSrc}
          afterKeypoints={afterKeypoints}
          afterPhases={afterPhases}
          bestVideoSrc={session.videoSrc}
          bestKeypoints={session.keypoints}
          bestPhases={session.phases}
          input={input}
        />
      ) : null}

      {resolvedScreen === "receipt" ? (
        <FixReceipt
          videoSrc={session.videoSrc}
          keypoints={session.keypoints}
          frameIndex={impactFrameIndex}
          handedness={session.handedness}
          input={input}
          showRetestDelta={Boolean(session.retestVideoSrc)}
        />
      ) : null}

      {input.whatChangedSince && resolvedScreen !== "processing" ? (
        <div className="mt-6">
          <WhatChangedSince display={input.whatChangedSince} />
        </div>
      ) : null}

      {demoMode ? (
        <DemoNav screen={resolvedScreen} onNavigate={advance} />
      ) : resolvedScreen !== "processing" && resolvedScreen !== "swing_found" ? (
        <footer className="mt-8 flex flex-wrap gap-2">
          {resolvedScreen !== "annotated" ? (
            <NavButton label="Reveal" onClick={() => advance("annotated")} />
          ) : null}
          <NavButton label="Target" onClick={() => advance("target")} />
          <NavButton label="Compare" onClick={() => advance("before_after")} />
          <NavButton label="Receipt" onClick={() => advance("receipt")} />
        </footer>
      ) : null}
    </div>
  );
}

function NavButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="min-h-10 rounded-full border border-white/20 px-4 text-xs font-semibold text-white/80"
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function DemoNav({
  screen,
  onNavigate,
}: {
  screen: RevealScreen;
  onNavigate: (screen: RevealScreen) => void;
}) {
  const screens: RevealScreen[] = [
    "processing",
    "swing_found",
    "annotated",
    "target",
    "before_after",
    "receipt",
  ];
  return (
    <nav className="mt-8 flex flex-wrap gap-2" data-testid="demo-nav">
      {screens.map((s) => (
        <button
          key={s}
          type="button"
          data-screen={s}
          className={`min-h-10 rounded-full px-3 text-xs font-semibold ${
            screen === s
              ? "bg-[#c8f542] text-[#0b1210]"
              : "border border-white/20 text-white/70"
          }`}
          onClick={() => onNavigate(s)}
        >
          {s.replace("_", " ")}
        </button>
      ))}
    </nav>
  );
}

export function buildRevealSessionFromCapture(
  videoSrc: string,
  keypoints: RevealSession["keypoints"],
  phases: RevealSession["phases"],
  options: {
    handedness?: RevealSession["handedness"];
    angle?: RevealSession["angle"];
    input?: RevealSession["input"];
  } = {},
): RevealSession {
  return {
    videoSrc,
    keypoints,
    phases,
    handedness: options.handedness ?? "right",
    angle: options.angle ?? "dtl",
    input: options.input ?? createPlaceholderRevealInput(),
  };
}
