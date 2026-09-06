"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PhonePropIllustration } from "@/components/capture/phone-prop-illustration";
import {
  acquireWakeLock,
  readGrantedCamera,
  requestOrientationPermission,
  requestRearCamera,
  speakCue,
  startMediaRecording,
  unlockSpeech,
} from "@/lib/capture/media";
import { startOrientationCapture } from "@/lib/capture/orientation";
import { setCaptureSession } from "@/lib/capture/session";
import { SELF_TIMER_SECONDS } from "@/lib/capture/types";
import type { OrientationSample } from "@/lib/capture/types";
import {
  CLIP_TOO_LONG_MESSAGE,
  isClipTooLong,
  readClipDurationSeconds,
} from "@/lib/ingest/duration";

type Phase = "choose" | "countdown" | "recording" | "error";

export function CaptureView() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const liveRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingRef = useRef<ReturnType<typeof startMediaRecording> | null>(
    null,
  );
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const stopOrientationRef = useRef<(() => void) | null>(null);
  const orientationSamplesRef = useRef<OrientationSample[]>([]);
  const grantedCameraRef = useRef<MediaTrackSettings | undefined>(undefined);

  const [phase, setPhase] = useState<Phase>("choose");
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(SELF_TIMER_SECONDS);
  const [recordSeconds, setRecordSeconds] = useState(0);

  useEffect(() => {
    return () => {
      stopLive();
    };
  }, []);

  function stopLive() {
    recordingRef.current?.stop();
    recordingRef.current = null;
    stopOrientationRef.current?.();
    stopOrientationRef.current = null;
    if (wakeLockRef.current) {
      void wakeLockRef.current.release();
      wakeLockRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (liveRef.current) {
      liveRef.current.srcObject = null;
    }
  }

  function unlockAudioContext() {
    try {
      const context = new AudioContext();
      void context.resume();
      return context;
    } catch {
      return undefined;
    }
  }

  function openReveal(
    clip: Blob,
    capturePath: "upload" | "in-app",
    fileName?: string,
    audioContext?: AudioContext,
  ) {
    setCaptureSession({
      clip,
      clipUrl: URL.createObjectURL(clip),
      capturePath,
      fileName,
      audioContext,
      orientationSamples:
        capturePath === "in-app" ? orientationSamplesRef.current : [],
      grantedCamera: grantedCameraRef.current,
      result: null,
      poseError: null,
    });
    router.push("/reveal");
  }

  async function onUpload(file: File | undefined) {
    if (!file) {
      return;
    }
    setError(null);
    const audioContext = unlockAudioContext();
    try {
      const duration = await readClipDurationSeconds(file);
      if (isClipTooLong(duration)) {
        setError(CLIP_TOO_LONG_MESSAGE);
        setPhase("choose");
        return;
      }
      openReveal(file, "upload", file.name, audioContext);
    } catch (caught) {
      setPhase("choose");
      setError(
        caught instanceof Error
          ? caught.message
          : "We couldn't read that video. Try another clip.",
      );
    }
  }

  async function startInApp() {
    setError(null);
    const audioContext = unlockAudioContext();
    unlockSpeech();
    orientationSamplesRef.current = [];
    try {
      await requestOrientationPermission();
      const stream = await requestRearCamera();
      streamRef.current = stream;
      grantedCameraRef.current = readGrantedCamera(stream);
      if (liveRef.current) {
        liveRef.current.srcObject = stream;
        await liveRef.current.play().catch(() => undefined);
      }
      setCountdown(SELF_TIMER_SECONDS);
      setPhase("countdown");

      for (let left = SELF_TIMER_SECONDS; left >= 1; left -= 1) {
        setCountdown(left);
        if (left === 3) {
          speakCue("Ready");
        } else if (left === 2) {
          speakCue("set");
        } else if (left === 1) {
          speakCue("swing");
        }
        await wait(1000);
      }

      const wakeLock = await acquireWakeLock();
      wakeLockRef.current = wakeLock;
      const startedAt = performance.now();
      stopOrientationRef.current = startOrientationCapture(
        startedAt,
        (sample) => {
          orientationSamplesRef.current.push(sample);
        },
      );

      const recording = startMediaRecording(stream);
      recordingRef.current = recording;
      setRecordSeconds(0);
      setPhase("recording");

      const tick = window.setInterval(() => {
        setRecordSeconds((value) => value + 1);
      }, 1000);

      const blob = await recording.result;
      window.clearInterval(tick);
      stopLive();
      openReveal(blob, "in-app", "in-app-recording", audioContext);
    } catch (caught) {
      stopLive();
      setPhase("choose");
      setError(
        caught instanceof Error
          ? caught.message
          : "Camera access is needed to record. You can upload a clip instead.",
      );
    }
  }

  function stopRecording() {
    recordingRef.current?.stop();
  }

  const live = phase === "countdown" || phase === "recording";

  return (
    <main className="flex min-h-dvh flex-col px-5 py-6">
      <div className="mx-auto flex w-full max-w-[22rem] flex-1 flex-col">
        <Link
          href="/"
          className="self-start text-sm text-white/55 underline-offset-4 hover:underline"
        >
          Back
        </Link>

        <video
          ref={liveRef}
          className={
            live
              ? "mt-4 aspect-[9/16] w-full rounded-2xl bg-black object-cover"
              : "pointer-events-none absolute h-px w-px opacity-0"
          }
          playsInline
          muted
          autoPlay
        />

        {phase === "choose" || phase === "error" ? (
          <>
            <h1 className="mt-8 text-[1.45rem] font-semibold tracking-tight">
              Film your swing
            </h1>
            <div className="mt-6 flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <PhonePropIllustration />
              <p className="text-left text-[0.92rem] leading-snug text-white/80">
                Shoot 1080p at 60 fps, or Slo-mo 120. Action mode off. Prop the
                phone. Don&apos;t hold it.
              </p>
            </div>
            <input
              ref={inputRef}
              id="swing-upload"
              type="file"
              accept="video/*"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                void onUpload(file);
              }}
            />
            <button
              type="button"
              className="mt-8 min-h-12 w-full rounded-full bg-[#c8f542] px-6 text-[1.05rem] font-semibold text-[#0b1210]"
              onClick={() => inputRef.current?.click()}
            >
              Upload a video
            </button>
            <button
              type="button"
              className="mt-3 min-h-12 w-full rounded-full border border-white/20 px-6 text-[1.05rem] font-semibold text-white"
              onClick={() => void startInApp()}
            >
              Record in-app
            </button>
          </>
        ) : null}

        {phase === "countdown" ? (
          <div className="mt-6 text-center">
            <p className="text-sm uppercase tracking-[0.2em] text-white/55">
              Self-timer
            </p>
            <p className="mt-2 text-[5rem] font-semibold leading-none text-[#c8f542]">
              {countdown}
            </p>
            <p className="mt-3 text-white/70">
              {countdown <= 3
                ? "Ready… set… swing"
                : "Prop the phone. Don't hold it."}
            </p>
          </div>
        ) : null}

        {phase === "recording" ? (
          <div className="mt-6 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-red-400">
              Recording {recordSeconds}s / 30s
            </p>
            <button
              type="button"
              className="mt-5 min-h-12 w-full rounded-full bg-white px-6 text-[1.05rem] font-semibold text-[#0b1210]"
              onClick={stopRecording}
            >
              Stop
            </button>
          </div>
        ) : null}

        {error ? (
          <p className="mt-6 text-center text-sm leading-relaxed text-[#f3c36a]">
            {error}
          </p>
        ) : null}
      </div>
    </main>
  );
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
