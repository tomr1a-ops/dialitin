import type {
  CapturePath,
  IngestResult,
  OrientationSample,
} from "@/lib/capture/types";
import { detectFrameRate } from "@/lib/ingest/detect-frame-rate";
import { grabVideoBitmap } from "@/lib/pose/frame-bitmap";
import {
  cropFromPerson,
  fullFrameCrop,
  padLandmarks,
  pickLargestCentralPerson,
  recenterCropOnHips,
} from "@/lib/pose/isolate";
import { createPoseRuntime, type PoseRuntime } from "@/lib/pose/pose-runtime";
import type { CropBox, PoseFrame } from "@/lib/pose/types";

export type IngestProgress = {
  currentTime: number;
  duration: number;
  phase: "pose-init" | "streaming";
};

export type IngestClipOptions = {
  capturePath: CapturePath;
  orientationSamples?: OrientationSample[];
  fileName?: string;
  grantedCamera?: MediaTrackSettings;
  onProgress?: (progress: IngestProgress) => void;
};

function attachHiddenVideo(video: HTMLVideoElement) {
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.playsInline = true;
  video.muted = false;
  video.volume = 0;
  video.preload = "auto";
  video.controls = false;
  video.style.position = "fixed";
  video.style.left = "0";
  video.style.top = "0";
  video.style.width = "2px";
  video.style.height = "2px";
  video.style.opacity = "0";
  video.style.pointerEvents = "none";
  document.body.appendChild(video);
}

function sampleAnalyserRms(
  analyser: AnalyserNode,
  buffer: Uint8Array<ArrayBuffer>,
): number {
  analyser.getByteTimeDomainData(buffer);
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) {
    const centered = (buffer[i]! - 128) / 128;
    sum += centered * centered;
  }
  return Math.sqrt(sum / buffer.length);
}

function connectAnalyser(video: HTMLVideoElement): {
  context: AudioContext;
  analyser: AnalyserNode;
} | null {
  try {
    const context = new AudioContext();
    const source = context.createMediaElementSource(video);
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    return { context, analyser };
  } catch {
    return null;
  }
}

async function poseOnBitmap(
  runtime: PoseRuntime | null,
  video: HTMLVideoElement,
  crop: CropBox | null,
  timestampMs: number,
) {
  if (!runtime) {
    return [];
  }
  const bitmap = grabVideoBitmap(video, crop);
  return runtime.detect(bitmap, timestampMs);
}

export async function ingestClip(
  clip: Blob,
  options: IngestClipOptions,
): Promise<IngestResult> {
  const clipUrl = URL.createObjectURL(clip);
  const video = document.createElement("video");
  video.src = clipUrl;
  attachHiddenVideo(video);

  const timestamps: number[] = [];
  const audioRms: number[] = [];
  const keypoints: PoseFrame[] = [];
  let audio = connectAnalyser(video);
  const timeDomain = audio
    ? new Uint8Array(new ArrayBuffer(audio.analyser.fftSize))
    : null;

  let frameHandle: number | null = null;
  let finished = false;
  let crop: CropBox | null = null;
  let poseRuntime: PoseRuntime | null = null;
  let poseBackend: IngestResult["poseBackend"] = "unavailable";
  let poseStartedAt = 0;

  const finish = () => {
    finished = true;
    if (frameHandle !== null && video.cancelVideoFrameCallback) {
      video.cancelVideoFrameCallback(frameHandle);
    }
  };

  try {
    options.onProgress?.({
      currentTime: 0,
      duration: 0,
      phase: "pose-init",
    });
    try {
      const started = await createPoseRuntime();
      poseRuntime = started.runtime;
      poseBackend = started.backend;
    } catch {
      poseRuntime = null;
      poseBackend = "unavailable";
    }

    await new Promise<void>((resolve, reject) => {
      const onError = () => {
        finish();
        reject(new Error("We couldn't read that video. Try another clip."));
      };

      video.addEventListener("error", onError, { once: true });
      video.addEventListener(
        "loadedmetadata",
        () => {
          void (async () => {
            if (audio) {
              try {
                await audio.context.resume();
              } catch {
                audio = null;
              }
            }

            const durationMs = Number.isFinite(video.duration)
              ? video.duration * 1000
              : 45000;
            const watchdog = window.setTimeout(
              () => {
                if (!finished) {
                  finish();
                  resolve();
                }
              },
              Math.ceil(durationMs) + 20000,
            );

            const onFrame: VideoFrameRequestCallback = (_now, metadata) => {
              if (finished) {
                return;
              }
              void (async () => {
                try {
                  timestamps.push(metadata.mediaTime);
                  if (audio && timeDomain) {
                    audioRms.push(
                      sampleAnalyserRms(audio.analyser, timeDomain),
                    );
                  }

                  const frameWidth = video.videoWidth;
                  const frameHeight = video.videoHeight;
                  const timestampMs = metadata.mediaTime * 1000;

                  if (!crop) {
                    const isolationPoses = await poseOnBitmap(
                      poseRuntime,
                      video,
                      null,
                      timestampMs,
                    );
                    const golfer = pickLargestCentralPerson(isolationPoses);
                    crop = golfer
                      ? (cropFromPerson(golfer, frameWidth, frameHeight) ??
                        fullFrameCrop(frameWidth, frameHeight))
                      : fullFrameCrop(frameWidth, frameHeight);
                  }

                  const croppedPoses = await poseOnBitmap(
                    poseRuntime,
                    video,
                    crop,
                    timestampMs + 0.25,
                  );
                  const tracked =
                    pickLargestCentralPerson(croppedPoses) ?? croppedPoses[0];
                  const landmarks = padLandmarks(tracked);
                  keypoints.push({
                    mediaTime: metadata.mediaTime,
                    landmarks,
                    crop,
                  });
                  if (tracked) {
                    crop = recenterCropOnHips(
                      crop,
                      landmarks,
                      frameWidth,
                      frameHeight,
                    );
                  }

                  options.onProgress?.({
                    currentTime: video.currentTime,
                    duration: video.duration,
                    phase: "streaming",
                  });
                } catch {
                  // Keep streaming even if a single pose frame fails.
                } finally {
                  if (!finished && !video.ended) {
                    frameHandle = video.requestVideoFrameCallback(onFrame);
                  }
                }
              })();
            };

            video.addEventListener(
              "ended",
              () => {
                window.clearTimeout(watchdog);
                finish();
                resolve();
              },
              { once: true },
            );

            poseStartedAt = performance.now();
            frameHandle = video.requestVideoFrameCallback(onFrame);
            video.play().catch((error: unknown) => {
              window.clearTimeout(watchdog);
              finish();
              reject(
                error instanceof Error
                  ? error
                  : new Error("Playback failed while reading the clip."),
              );
            });
          })();
        },
        { once: true },
      );
    });

    const poseElapsedMs = performance.now() - poseStartedAt;
    const poseFpsProcessed =
      poseElapsedMs > 0 ? (keypoints.length / poseElapsedMs) * 1000 : 0;
    const rate = detectFrameRate(timestamps, options.fileName);
    const peak = audioRms.reduce((max, value) => Math.max(max, value), 0);

    return {
      clip,
      clipUrl,
      frameTimestamps: timestamps,
      detectedFrameRate: rate.detectedFrameRate,
      snappedFrameRate: rate.snappedFrameRate,
      minDeltaFps: rate.minDeltaFps,
      isVariableFrameRate: rate.isVariable,
      sloMoReexportedAt30: rate.sloMoReexportedAt30,
      resolution: {
        width: video.videoWidth,
        height: video.videoHeight,
      },
      capturePath: options.capturePath,
      orientationSamples: options.orientationSamples ?? [],
      durationSeconds: Number.isFinite(video.duration)
        ? video.duration
        : (timestamps.at(-1) ?? 0),
      frameCount: timestamps.length,
      audioSampleCount: audioRms.length,
      audioPeakRms: peak,
      audioRms,
      keypoints,
      poseFpsProcessed,
      poseElapsedMs,
      poseBackend,
      grantedCamera: options.grantedCamera,
    };
  } catch (error) {
    URL.revokeObjectURL(clipUrl);
    throw error;
  } finally {
    finish();
    poseRuntime?.close();
    if (audio) {
      void audio.context.close();
    }
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.remove();
  }
}
