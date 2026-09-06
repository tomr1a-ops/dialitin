import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function runFfmpeg(args: string[]): Promise<void> {
  return execFileAsync("ffmpeg", args).then(() => undefined);
}

/** Probe duration (seconds) via ffprobe. */
export async function probeVideoDurationSec(inputPath: string): Promise<number> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    inputPath,
  ]);
  const value = Number.parseFloat(stdout.trim());
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Trim [startMs, endMs] from input, re-encode at max 1080p height (preserve aspect).
 */
export async function trimVideoClip(
  inputPath: string,
  startMs: number,
  endMs: number,
): Promise<{ outputPath: string; buffer: Buffer; durationSec: number }> {
  const startSec = Math.max(0, startMs / 1000);
  const endSec = Math.max(startSec + 0.25, endMs / 1000);
  const outputPath = join(tmpdir(), `dialitin-trim-${randomUUID()}.mp4`);

  await runFfmpeg([
    "-y",
    "-ss",
    startSec.toFixed(3),
    "-to",
    endSec.toFixed(3),
    "-i",
    inputPath,
    "-vf",
    "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease",
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "23",
    "-c:a",
    "aac",
    "-movflags",
    "+faststart",
    outputPath,
  ]);

  const buffer = await readFile(outputPath);
  return { outputPath, buffer, durationSec: endSec - startSec };
}

export async function writeTempVideo(buffer: Buffer, ext = "mp4"): Promise<string> {
  const path = join(tmpdir(), `dialitin-src-${randomUUID()}.${ext}`);
  await writeFile(path, buffer);
  return path;
}
