import { acquireWakeLock, startMediaRecording } from "@/lib/capture/media";
import { startOrientationCapture } from "@/lib/capture/orientation";
import type { CaptureSession } from "@/lib/capture/session";
import type { OrientationSample } from "@/lib/capture/types";

function drawTestFrame(ctx: CanvasRenderingContext2D, frame: number) {
  ctx.fillStyle = `hsl(${frame % 360} 65% 35%)`;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.fillStyle = "#f4f7f2";
  ctx.font = "48px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(`DialItIn selftest ${frame}`, 36, 80);
}

export async function runInAppPipelineSelftest(): Promise<CaptureSession> {
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D is unavailable.");
  }

  let frame = 0;
  drawTestFrame(ctx, frame);
  const drawId = window.setInterval(() => {
    frame += 1;
    drawTestFrame(ctx, frame);
  }, 1000 / 30);

  const stream = canvas.captureStream(30);
  const audioContext = new AudioContext();
  const oscillator = audioContext.createOscillator();
  const dest = audioContext.createMediaStreamDestination();
  oscillator.frequency.value = 880;
  oscillator.connect(dest);
  oscillator.start();
  dest.stream.getAudioTracks().forEach((track) => stream.addTrack(track));

  const wakeLock = await acquireWakeLock();
  const   orientationSamples: OrientationSample[] = [
    { t: 0, beta: 12.5, gamma: -3.2, roll: -3.2, pitch: -77.5 },
  ];
  const startedAt = performance.now();
  const stopOrientation = startOrientationCapture(startedAt, (sample) => {
    orientationSamples.push(sample);
  });

  const recording = startMediaRecording(stream);
  await new Promise((resolve) => window.setTimeout(resolve, 1600));
  recording.stop();
  const blob = await recording.result;

  stopOrientation();
  window.clearInterval(drawId);
  oscillator.stop();
  await audioContext.close();
  stream.getTracks().forEach((track) => track.stop());
  if (wakeLock) {
    await wakeLock.release();
  }

  return {
    clip: blob,
    clipUrl: URL.createObjectURL(blob),
    capturePath: "in-app",
    orientationSamples,
    fileName: "selftest.webm",
    grantedCamera: { width: 1280, height: 720, frameRate: 30 },
    result: null,
    poseError: null,
  };
}
