import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseYouTubeVideoId, youtubeWatchUrl } from "@/lib/harvest/constants";

function runCommand(
  command: string,
  args: string[],
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ stdout, stderr, code: code ?? 1 });
    });
  });
}

/** Download a YouTube clip up to 1080p60 via yt-dlp when available. */
export async function downloadYouTubeVideo(
  urlOrId: string,
): Promise<{ buffer: Buffer; title: string; ext: string }> {
  const videoId = parseYouTubeVideoId(urlOrId);
  const url = videoId ? youtubeWatchUrl(videoId) : urlOrId.trim();
  const dir = await mkdtemp(join(tmpdir(), "dialitin-harvest-"));
  const outputTemplate = join(dir, "clip.%(ext)s");

  try {
    const titleResult = await runCommand("yt-dlp", [
      "--no-playlist",
      "--skip-download",
      "--print",
      "title",
      url,
    ]);
    const title =
      titleResult.stdout
        .split("\n")
        .map((line) => line.trim())
        .find(Boolean) ?? "harvested-clip";

    const result = await runCommand("yt-dlp", [
      "--no-playlist",
      "-f",
      "bestvideo[height<=1080][fps<=60]+bestaudio/best[height<=1080]/best",
      "--merge-output-format",
      "mp4",
      "-o",
      outputTemplate,
      url,
    ]);
    if (result.code !== 0) {
      throw new Error(
        result.stderr.trim() || "yt-dlp failed — install yt-dlp on the worker.",
      );
    }
    const { readdir } = await import("node:fs/promises");
    const files = await readdir(dir);
    const media = files.find((name) => /\.(mp4|webm|mkv|m4v)$/i.test(name));
    if (!media) {
      throw new Error("yt-dlp produced no media file.");
    }
    const ext = media.split(".").pop()?.toLowerCase() ?? "mp4";
    const buffer = await readFile(join(dir, media));
    return { buffer, title, ext };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function isYtDlpAvailable(): Promise<boolean> {
  try {
    const result = await runCommand("yt-dlp", ["--version"]);
    return result.code === 0;
  } catch {
    return false;
  }
}
