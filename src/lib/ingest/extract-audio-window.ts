/**
 * Decode mono PCM from a video clip for strike-sound analysis.
 */

export async function decodeAudioFromClip(
  clip: Blob,
): Promise<{ samples: Float32Array; sampleRate: number } | null> {
  if (typeof AudioContext === "undefined") {
    return null;
  }
  const ctx = new AudioContext();
  try {
    const buffer = await clip.arrayBuffer();
    const decoded = await ctx.decodeAudioData(buffer.slice(0));
    const ch0 = decoded.getChannelData(0);
    const samples = new Float32Array(ch0.length);
    samples.set(ch0);
    return { samples, sampleRate: decoded.sampleRate };
  } catch {
    return null;
  } finally {
    void ctx.close();
  }
}

/** Extract RGBA ImageData for one video frame (browser). */
export async function extractFramePixels(
  clip: Blob,
  timeSec: number,
): Promise<{ image: ImageData; width: number; height: number } | null> {
  if (typeof document === "undefined") {
    return null;
  }
  const url = URL.createObjectURL(clip);
  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("video load failed"));
    });
    video.currentTime = Math.min(
      Math.max(0, timeSec),
      Math.max(0, video.duration - 0.001),
    );
    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
    });
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx || canvas.width === 0) {
      return null;
    }
    ctx.drawImage(video, 0, 0);
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return { image, width: canvas.width, height: canvas.height };
  } finally {
    URL.revokeObjectURL(url);
    video.remove();
  }
}

/** Sample frames around address and post-impact for ball analysis. */
export async function extractBallFramePixels(input: {
  clip: Blob;
  frames: { mediaTime: number }[];
  addressIndex: number;
  impactIndex: number;
  maxLaunchFrames?: number;
}): Promise<(ImageData | null)[]> {
  const maxLaunch = input.maxLaunchFrames ?? 15;
  const indices = new Set<number>();
  indices.add(input.addressIndex);
  for (
    let i = input.impactIndex + 1;
    i <= input.impactIndex + maxLaunch && i < input.frames.length;
    i += 1
  ) {
    indices.add(i);
  }

  const out: (ImageData | null)[] = new Array(input.frames.length).fill(null);
  for (const idx of indices) {
    const t = input.frames[idx]?.mediaTime;
    if (t == null) {
      continue;
    }
    const extracted = await extractFramePixels(input.clip, t);
    out[idx] = extracted?.image ?? null;
  }
  return out;
}
