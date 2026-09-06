#!/usr/bin/env npx tsx
/**
 * Phase 0a-1 automated harvest (local worker).
 * Requires: yt-dlp, ffmpeg, dev server at --base (for MediaPipe ingest runner).
 *
 * Usage:
 *   npm run dev   # separate terminal (or --base https://dialitin.ai)
 *   npx tsx --import ./scripts/ws-preload.mjs scripts/run-harvest.ts [--base URL] [--seed]
 */
import { runFullHarvest } from "@/lib/harvest/run-full";

async function main() {
  const siteBase = process.argv.includes("--base")
    ? process.argv[process.argv.indexOf("--base") + 1]!
    : undefined;
  const shouldSeed = process.argv.includes("--seed");
  const maxBatch = process.argv.includes("--max-batch")
    ? Number(process.argv[process.argv.indexOf("--max-batch") + 1])
    : undefined;

  const report = await runFullHarvest({ siteBase, shouldSeed, maxBatch });

  if (
    report.blockers.some((blocker) => blocker.includes("YOUTUBE_API_KEY")) ||
    report.blockers.some((blocker) => blocker.includes("yt-dlp not installed"))
  ) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  if (report.found === 0) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  console.error(`Selected ${report.found} videos; fetching in batches…`);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
