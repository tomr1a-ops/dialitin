import { RECORD_MAX_MS } from "@/lib/capture/types";

export const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: true,
  video: {
    facingMode: { ideal: "environment" },
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: { ideal: 60 },
  },
};

type DeviceOrientationConstructor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

export async function requestRearCamera(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
}

export function pickRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") {
    return undefined;
  }
  const types = [
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  return types.find((type) => MediaRecorder.isTypeSupported(type));
}

export function readGrantedCamera(stream: MediaStream): MediaTrackSettings {
  return stream.getVideoTracks()[0]?.getSettings() ?? {};
}

export async function acquireWakeLock(): Promise<WakeLockSentinel | null> {
  try {
    if (!navigator.wakeLock) {
      return null;
    }
    return await navigator.wakeLock.request("screen");
  } catch {
    return null;
  }
}

export async function requestOrientationPermission(): Promise<boolean> {
  const ctor = DeviceOrientationEvent as DeviceOrientationConstructor;
  if (typeof ctor.requestPermission !== "function") {
    return true;
  }
  try {
    const result = await ctor.requestPermission();
    return result === "granted";
  } catch {
    return false;
  }
}

export function speakCue(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    return;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1;
  utterance.pitch = 1;
  utterance.volume = 1;
  window.speechSynthesis.speak(utterance);
}

export function unlockSpeech() {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    return;
  }
  window.speechSynthesis.getVoices();
}

export type RecordingSession = {
  stop: () => void;
  result: Promise<Blob>;
};

export function startMediaRecording(stream: MediaStream): RecordingSession {
  const mimeType = pickRecorderMimeType();
  const recorder = mimeType
    ? new MediaRecorder(stream, { mimeType })
    : new MediaRecorder(stream);
  const chunks: Blob[] = [];

  let settle: (blob: Blob) => void;
  let fail: (error: Error) => void;
  const result = new Promise<Blob>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });

  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data);
    }
  });
  recorder.addEventListener("error", () => {
    fail(new Error("Recording failed. Try upload instead."));
  });
  recorder.addEventListener("stop", () => {
    settle(
      new Blob(chunks, {
        type: recorder.mimeType || mimeType || "video/webm",
      }),
    );
  });

  recorder.start(1000);

  const timeoutId = window.setTimeout(() => {
    if (recorder.state !== "inactive") {
      recorder.stop();
    }
  }, RECORD_MAX_MS);

  return {
    stop() {
      window.clearTimeout(timeoutId);
      if (recorder.state !== "inactive") {
        recorder.stop();
      }
    },
    result,
  };
}
