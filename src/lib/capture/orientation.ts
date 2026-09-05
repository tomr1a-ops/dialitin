import type { OrientationSample } from "@/lib/capture/types";

export function startOrientationCapture(
  startedAt: number,
  onSample: (sample: OrientationSample) => void,
): () => void {
  const handler = (event: DeviceOrientationEvent) => {
    onSample({
      t: (performance.now() - startedAt) / 1000,
      beta: event.beta,
      gamma: event.gamma,
    });
  };

  window.addEventListener("deviceorientation", handler);
  return () => {
    window.removeEventListener("deviceorientation", handler);
  };
}
