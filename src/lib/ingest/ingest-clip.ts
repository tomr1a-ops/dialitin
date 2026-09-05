import type {
  CapturePath,
  IngestResult,
  OrientationSample,
} from "@/lib/capture/types";
import { detectFrameRate } from "@/lib/ingest/detect-frame-rate";
import {
  drawVideoToPoseCanvas,
  grabCanvasBitmap,
} from "@/lib/pose/frame-bitmap";
import {
  cropFromPerson,
  fullFrameCrop,
  padLandmarks,
  pickLargestCentralPerson,
  recenterCropOnHips,
  scalePoseToFullFrame,
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
  audioContext?: AudioContext;
  onProgress?: (progress: IngestProgress) => void;
};

function attachHiddenVideo(video: HTMLVideoElement) {
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.playsInline = true;
  video.muted = true;
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

function createAnalyser(context?: AudioContext): {
  context: AudioContext;
  analyser: AnalyserNode;
  connected: boolean;
} | null {
  try {
    const audioContext = context ?? new AudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    return { context: audioContext, analyser, connected: false };
  } catch {
    return null;
  }
}

function attachAnalyser(
  audio: { context: AudioContext; analyser: AnalyserNode; connected: boolean },
  video: HTMLVideoElement,
) {
  if (audio.connected || audio.context.state !== "running") {
    return;
  }
  const source = audio.context.createMediaElementSource(video);
  source.connect(audio.analyser);
  audio.connected = true;
}

async function poseOnCanvas(
  runtime: PoseRuntime | null,
  canvas: OffscreenCanvas,
  crop: CropBox | null,
  timestampMs: number,
) {
  if (!runtime) {
    return [];
  }
  return runtime.detect(grabCanvasBitmap(canvas, crop), timestampMs);
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
  const audio = createAnalyser(options.audioContext);
  if (audio) {
    void audio.context.resume().catch(() => undefined);
    attachAnalyser(audio, video);
  }
  const timeDomain = audio
    ? new Uint8Array(new ArrayBuffer(audio.analyser.fftSize))
    : null;

  let frameHandle: number | null = null;
  let finished = false;
  let crop: CropBox | null = null;
  let poseRuntime: PoseRuntime | null = null;
  let poseBackend: IngestResult["poseBackend"] = "unavailable";
  let poseDelegate: IngestResult["poseDelegate"] = "unavailable";
  let poseWatchdogHit = false;
  let poseStartedAt = 0;
  let detectStamp = 1;
  const poseCanvas = new OffscreenCanvas(2, 2);

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
      const started = await Promise.race([
        createPoseRuntime(),
        new Promise<never>((_, reject) => {
          window.setTimeout(
            () => reject(new Error("Pose runtime init timed out")),
            20000,
          );
        }),
      ]);
      poseRuntime = started.runtime;
      poseBackend = started.backend;
      poseDelegate = started.delegate;
    } catch {
      poseRuntime = null;
      poseBackend = "unavailable";
      poseDelegate = "unavailable";
    }

    await new Promise<void>((resolve, reject) => {
      const onError = () => {
        finish();
        reject(new Error("We couldn't read that video. Try another clip."));
      };

      video.addEventListener("error", onError, { once: true });
      const startPlayback = () => {
        void (async () => {
          if (audio) {
            attachAnalyser(audio, video);
          }

          const durationMs = Number.isFinite(video.duration)
            ? video.duration * 1000
            : 45000;
          const watchdog = window.setTimeout(
            () => {
              if (!finished) {
                poseWatchdogHit = true;
                finish();
                resolve();
              }
            },
            Math.ceil(durationMs) + 20000,
          );

          let processing = false;
          let playEnded = false;

          const settle = () => {
            if (finished || processing) {
              return;
            }
            if (playEnded || video.ended) {
              window.clearTimeout(watchdog);
              finish();
              resolve();
            }
          };

          const onFrame: VideoFrameRequestCallback = (_now, metadata) => {
            if (finished) {
              return;
            }
            processing = true;
            void (async () => {
              try {
                timestamps.push(metadata.mediaTime);
                if (audio && timeDomain) {
                  audioRms.push(sampleAnalyserRms(audio.analyser, timeDomain));
                }

                const work = drawVideoToPoseCanvas(video, poseCanvas);

                if (!crop) {
                  const isolationPoses = await poseOnCanvas(
                    poseRuntime,
                    work.canvas,
                    null,
                    detectStamp,
                  );
                  detectStamp += 1;
                  const golfer = pickLargestCentralPerson(isolationPoses);
                  crop = golfer
                    ? (cropFromPerson(golfer, work.width, work.height) ??
                      fullFrameCrop(work.width, work.height))
                    : fullFrameCrop(work.width, work.height);
                }

                const croppedPoses = await poseOnCanvas(
                  poseRuntime,
                  work.canvas,
                  crop,
                  detectStamp,
                );
                detectStamp += 1;
                const tracked =
                  pickLargestCentralPerson(croppedPoses) ?? croppedPoses[0];
                const landmarks = padLandmarks(tracked);
                const mapped = scalePoseToFullFrame(
                  landmarks,
                  crop,
                  work.scale,
                  work.frameWidth,
                  work.frameHeight,
                );
                keypoints.push({
                  mediaTime: metadata.mediaTime,
                  landmarks: mapped.landmarks,
                  crop: mapped.crop,
                });
                if (tracked) {
                  crop = recenterCropOnHips(
                    crop,
                    landmarks,
                    work.width,
                    work.height,
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
                processing = false;
                if (finished) {
                  return;
                }
                if (playEnded || video.ended) {
                  settle();
                  return;
                }
                if (video.paused) {
                  void video.play().catch(() => undefined);
                }
                frameHandle = video.requestVideoFrameCallback(onFrame);
              }
            })();
          };

          video.addEventListener(
            "ended",
            () => {
              playEnded = true;
              settle();
            },
            { once: true },
          );

          poseStartedAt = performance.now();
          if (video.currentTime > 0) {
            video.currentTime = 0;
          }
          frameHandle = video.requestVideoFrameCallback(onFrame);
          video
            .play()
            .then(() => {
              if (audio) {
                attachAnalyser(audio, video);
              }
            })
            .catch((error: unknown) => {
              window.clearTimeout(watchdog);
              finish();
              reject(
                error instanceof Error
                  ? error
                  : new Error("Playback failed while reading the clip."),
              );
            });
        })();
      };

      if (video.readyState >= 1) {
        startPlayback();
      } else {
        video.addEventListener("loadedmetadata", startPlayback, { once: true });
      }
    });

    const poseElapsedMs = performance.now() - poseStartedAt;
    const poseFpsProcessed =
      poseElapsedMs > 0 ? (keypoints.length / poseElapsedMs) * 1000 : 0;
    const firstCrop = keypoints[0]?.crop;
    console.info(
      `[swingread] frames-processed-per-second ${poseFpsProcessed.toFixed(2)} (${keypoints.length} frames in ${poseElapsedMs.toFixed(0)}ms, ${poseBackend}/${poseDelegate}, watchdog=${poseWatchdogHit ? "hit" : "ok"})${
        firstCrop
          ? ` crop=${Math.round(firstCrop.x)},${Math.round(firstCrop.y)},${Math.round(firstCrop.width)}x${Math.round(firstCrop.height)}`
          : ""
      }`,
    );
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
      poseDelegate,
      poseWatchdogHit,
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
