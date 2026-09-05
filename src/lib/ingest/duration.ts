import { MAX_CLIP_SECONDS } from "@/lib/capture/types";

export const CLIP_TOO_LONG_MESSAGE =
  "That clip is longer than 30 seconds. Trim it to just your swing and try again.";

function waitForLoadedMetadata(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= 1 && Number.isFinite(video.duration)) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const onLoaded = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("We couldn't read that video. Try another clip."));
    };
    const cleanup = () => {
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("error", onError);
    };
    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("error", onError);
  });
}

export async function readClipDurationSeconds(file: Blob): Promise<number> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  video.playsInline = true;
  video.src = url;

  try {
    await waitForLoadedMetadata(video);
    return video.duration;
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

export function isClipTooLong(durationSeconds: number): boolean {
  return Number.isFinite(durationSeconds) && durationSeconds > MAX_CLIP_SECONDS;
}
