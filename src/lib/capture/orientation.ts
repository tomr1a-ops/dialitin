import type { OrientationSample } from "@/lib/capture/types";

export function startOrientationCapture(
  startedAt: number,
  onSample: (sample: OrientationSample) => void,
): () => void {
  const handler = (event: DeviceOrientationEvent) => {
    const roll = event.gamma;
    const pitch = event.beta === null ? null : event.beta - 90;
    onSample({
      t: (performance.now() - startedAt) / 1000,
      beta: event.beta,
      gamma: event.gamma,
      roll,
      pitch,
    });
  };

  window.addEventListener("deviceorientation", handler);
  return () => {
    window.removeEventListener("deviceorientation", handler);
  };
}
