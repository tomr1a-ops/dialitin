import {
  PINNED_POSE_ASSETS,
  POSE_MODEL,
  type PinnedAsset,
} from "@/lib/pose/assets";
import { retryWithBackoff } from "@/lib/pose/retry";

export type LoadAssetsProgress = (
  loadedBytes: number,
  totalBytes: number,
) => void;

async function readWithProgress(
  response: Response,
  expectedBytes: number,
  onChunk: (loaded: number) => void,
): Promise<ArrayBuffer> {
  const total = Number(response.headers.get("content-length")) || expectedBytes;
  if (!response.body) {
    const buffer = await response.arrayBuffer();
    onChunk(buffer.byteLength);
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
    loaded += value.byteLength;
    onChunk(Math.min(loaded, total || loaded));
  }

  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
}

async function fetchAsset(
  asset: PinnedAsset,
  onChunk: (delta: number) => void,
): Promise<ArrayBuffer | null> {
  const response = await fetch(asset.url, { cache: "force-cache" });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${asset.url} (${response.status})`);
  }
  if (asset.url === POSE_MODEL.url) {
    return readWithProgress(response, asset.bytes, onChunk);
  }
  await readWithProgress(response, asset.bytes, onChunk);
  return null;
}

export async function loadPoseAssets(
  onProgress?: LoadAssetsProgress,
): Promise<Uint8Array> {
  const totalBytes = PINNED_POSE_ASSETS.reduce(
    (sum, asset) => sum + asset.bytes,
    0,
  );
  let loadedBytes = 0;
  onProgress?.(0, totalBytes);

  return retryWithBackoff(async () => {
    loadedBytes = 0;
    onProgress?.(0, totalBytes);
    let model: ArrayBuffer | null = null;
    for (const asset of PINNED_POSE_ASSETS) {
      const buffer = await fetchAsset(asset, (loaded) => {
        onProgress?.(Math.min(loadedBytes + loaded, totalBytes), totalBytes);
      });
      loadedBytes += asset.bytes;
      onProgress?.(Math.min(loadedBytes, totalBytes), totalBytes);
      if (buffer) {
        model = buffer;
      }
    }
    if (!model) {
      throw new Error("Failed to fetch pose model");
    }
    return new Uint8Array(model);
  });
}
