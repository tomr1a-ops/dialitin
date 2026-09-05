import {
  createPoseWorkCanvas,
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

export type AdminIngestResult = {
  keypoints: PoseFrame[];
  poseBackend: "worker" | "main-thread";
  poseElapsedMs: number;
};

function attachHiddenVideo(video: HTMLVideoElement) {
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.playsInline = true;
  video.muted = true;
  video.preload = "auto";
  video.controls = false;
  video.style.position = "fixed";
  video.style.left = "0";
  video.style.top = "0";
  video.style.width = "32px";
  video.style.height = "32px";
  video.style.opacity = "0.01";
  video.style.pointerEvents = "none";
  document.body.appendChild(video);
}

async function waitForMetadata(video: HTMLVideoElement) {
  if (video.readyState >= 1) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new Error("Video metadata timed out.")),
      8000,
    );
    const onError = () => {
      window.clearTimeout(timer);
      reject(new Error("We couldn't read that video."));
    };
    video.addEventListener("error", onError, { once: true });
    video.addEventListener(
      "loadedmetadata",
      () => {
        window.clearTimeout(timer);
        video.removeEventListener("error", onError);
        resolve();
      },
      { once: true },
    );
  });
}

async function waitForData(video: HTMLVideoElement) {
  if (video.readyState >= 2) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new Error("Video data timed out.")),
      8000,
    );
    const done = () => {
      window.clearTimeout(timer);
      resolve();
    };
    video.addEventListener("loadeddata", done, { once: true });
    video.addEventListener("canplay", done, { once: true });
  });
}

async function seekTo(video: HTMLVideoElement, time: number) {
  await waitForData(video);
  if (Math.abs(video.currentTime - time) < 0.001 && video.readyState >= 2) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new Error("Seek timed out.")),
      8000,
    );
    const cleanup = () => {
      window.clearTimeout(timer);
      video.removeEventListener("error", onError);
      video.removeEventListener("seeked", onSeeked);
    };
    const onError = () => {
      cleanup();
      reject(new Error("Seek failed while reading the clip."));
    };
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    video.addEventListener("error", onError);
    video.addEventListener("seeked", onSeeked);
    video.currentTime = time;
  });
}

async function poseOnCanvas(
  runtime: PoseRuntime,
  canvas: ReturnType<typeof createPoseWorkCanvas>,
  crop: CropBox | null,
  timestampMs: number,
) {
  return runtime.detect(await grabCanvasBitmap(canvas, crop), timestampMs);
}

export async function ingestAdminClip(
  clip: Blob,
  options?: {
    frameRate?: number;
    onProgress?: (frame: number, totalFrames: number) => void;
  },
): Promise<AdminIngestResult> {
  const clipUrl = URL.createObjectURL(clip);
  const video = document.createElement("video");
  video.src = clipUrl;
  attachHiddenVideo(video);
  const poseCanvas = createPoseWorkCanvas();
  let poseRuntime: PoseRuntime | null = null;
  let crop: CropBox | null = null;
  let detectStamp = 1;

  try {
    const started = await createPoseRuntime();
    poseRuntime = started.runtime;
    await waitForMetadata(video);
    await video.play().catch(() => undefined);
    video.pause();
    await waitForData(video);
    if (video.videoWidth < 2 || video.videoHeight < 2) {
      throw new Error("Video decoded without a usable frame.");
    }
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    console.info(
      `[dialitin] admin ingest ${video.videoWidth}x${video.videoHeight} ${duration.toFixed(2)}s ready=${video.readyState}`,
    );
    const fps = Math.min(Math.max(options?.frameRate ?? 30, 1), 60);
    const step = 1 / fps;
    const totalFrames = Math.max(1, Math.round(duration * fps) || 1);
    const keypoints: PoseFrame[] = [];
    const poseStartedAt = performance.now();

    for (let index = 0; index < totalFrames; index++) {
      const mediaTime = Math.min(index * step, Math.max(duration - 0.001, 0));
      await seekTo(video, mediaTime);
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
      const tracked = pickLargestCentralPerson(croppedPoses) ?? croppedPoses[0];
      const landmarks = padLandmarks(tracked);
      const mapped = scalePoseToFullFrame(
        landmarks,
        crop,
        work.scale,
        work.frameWidth,
        work.frameHeight,
      );
      keypoints.push({
        mediaTime,
        landmarks: mapped.landmarks,
        crop: mapped.crop,
      });
      if (tracked) {
        crop = recenterCropOnHips(crop, landmarks, work.width, work.height);
      }
      options?.onProgress?.(index + 1, totalFrames);
    }

    return {
      keypoints,
      poseBackend: started.backend,
      poseElapsedMs: performance.now() - poseStartedAt,
    };
  } finally {
    poseRuntime?.close();
    video.removeAttribute("src");
    video.load();
    video.remove();
    URL.revokeObjectURL(clipUrl);
  }
}
