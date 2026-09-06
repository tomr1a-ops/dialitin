#!/usr/bin/env npx tsx
/**
 * Phase 0a-1 automated harvest (local worker).
 * Requires: yt-dlp, dev server at --base (for MediaPipe ingest runner).
 *
 * Usage:
 *   npm run dev   # separate terminal
 *   npx tsx scripts/run-harvest.ts [--base http://localhost:3000] [--max-batch 10] [--seed]
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import WebSocket from "ws";
import { loadBandsSeedPreview, seedBandsFromReference } from "@/lib/admin/bands-seed";
import { safeClipFileName, TEST_SWING_BUCKET } from "@/lib/admin/test-swings";
import {
  HARVEST_FETCH_RATE_LIMIT,
  HARVEST_LICENSE_NOTE,
  type HarvestTier,
} from "@/lib/harvest/constants";
import { clubFamilyFromTitle, isKnownClubFamily } from "@/lib/harvest/club-family";
import { downloadYouTubeVideo, isYtDlpAvailable } from "@/lib/harvest/download";
import { suggestedFaultFromTitle } from "@/lib/harvest/fault-keywords";
import { runHarvestPipeline } from "@/lib/harvest/pipeline";
import { searchYouTubeQuery } from "@/lib/harvest/youtube-search";
import { POSE_MODEL_VERSION } from "@/lib/pose/joints";
import { jointCoverage, framesFromStoredKeypoints } from "@/lib/preview/coverage";
import { createSecretSupabaseClient } from "@/lib/supabase/admin";
import type { Handedness } from "@/lib/admin/test-swings";
import type { PoseFrame } from "@/lib/pose/types";

if (!globalThis.WebSocket) {
  globalThis.WebSocket = WebSocket as unknown as typeof WebSocket;
}

const REFERENCE_QUERIES = [
  "Rory McIlroy driver slow motion face on",
  "Rory McIlroy driver slow motion down the line",
  "Scottie Scheffler iron swing slow motion",
  "Nelly Korda driver slow motion",
  "Tommy Fleetwood 7 iron slow motion down the line",
  "Justin Thomas wedge slow motion face on",
  "Xander Schauffele driver slow motion",
  "Jon Rahm iron slow motion down the line",
  "Hideki Matsuyama driver slow motion",
  "Lydia Ko iron slow motion face on",
] as const;

const ANSWER_KEY_QUERIES = [
  "why do I slice driver my swing",
  "early extension my golf swing help",
  "over the top golf swing check mine",
  "sway golf swing analysis amateur",
] as const;

const ADMIN_USER_ID = "9402ff58-62fe-40fc-a36c-a723bbdf7b0a";
const ADMIN_EMAIL = "info@dialitin.ai";

function loadEnvFile(path: string) {
  try {
    const raw = readFileSync(path, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const eq = trimmed.indexOf("=");
      if (eq <= 0) {
        continue;
      }
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    /* optional */
  }
}

function loadEnv() {
  loadEnvFile(resolve(process.cwd(), ".env.local"));
}

type SelectedHit = Awaited<ReturnType<typeof searchYouTubeQuery>>[number];

type RunReport = {
  found: number;
  fetched: number;
  passedGate: number;
  split: number;
  fetchErrors: string[];
  pipelineErrors: string[];
  seedCells: Array<{ metricKey: string; clubFamily: string; angle: string; n: number }>;
  seedInserted: number;
  blockers: string[];
};

async function selectOnePerQuery(): Promise<SelectedHit[]> {
  const selected: SelectedHit[] = [];
  const seen = new Set<string>();

  for (const query of REFERENCE_QUERIES) {
    const hits = await searchYouTubeQuery(query, "reference", query, 8);
    const pick = hits.find((row) => row.passedFilters) ?? hits[0];
    if (pick && !seen.has(pick.videoId)) {
      seen.add(pick.videoId);
      selected.push(pick);
    }
  }

  for (const query of ANSWER_KEY_QUERIES) {
    const hits = await searchYouTubeQuery(query, "answer_key", query, 8);
    const pick = hits.find((row) => row.passedFilters) ?? hits[0];
    if (pick && !seen.has(pick.videoId)) {
      seen.add(pick.videoId);
      selected.push(pick);
    }
  }

  return selected;
}

async function runIngest(
  siteBase: string,
  clipBytes: ArrayBuffer,
  fileName: string,
): Promise<{
  keypoints: PoseFrame[];
  frameRate: number;
}> {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHROME_CHANNEL || "chrome",
    args: ["--autoplay-policy=no-user-gesture-required"],
  });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(600_000);
    await page.goto(`${siteBase}/debug/ingest-runner`, {
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    });
    await page.waitForFunction(() => window.__ingestReady === true, {
      timeout: 120_000,
    });
    const result = await page.evaluate(
      async ({ bytes, opts }) => {
        if (!window.__runIngest) {
          return { ok: false, error: "ingest runner missing" };
        }
        return window.__runIngest(new Uint8Array(bytes).buffer, opts);
      },
      {
        bytes: [...new Uint8Array(clipBytes)],
        opts: {
          capturePath: "upload" as const,
          fileName,
          handedness: "right" as const,
          labeledFrameRate: null,
        },
      },
    );
    if (!result.ok) {
      throw new Error(result.error ?? "ingest failed");
    }
    const frames = framesFromStoredKeypoints(
      (result.keypoints ?? []) as PoseFrame[],
    );
    const frameRate = Number(result.detectedFrameRate);
    if (frames.length === 0 || !Number.isFinite(frameRate) || frameRate <= 0) {
      throw new Error("ingest produced no frames");
    }
    return { keypoints: frames, frameRate };
  } finally {
    await browser.close();
  }
}

async function savePipeline(
  swingId: string,
  swing: Record<string, unknown>,
  frames: PoseFrame[],
  frameRate: number,
  handedness: Handedness,
): Promise<{ passedGate: boolean; splitCount: number }> {
  const secret = createSecretSupabaseClient();
  const pipeline = runHarvestPipeline({
    swingId,
    title: String(swing.golfer_label ?? swing.source_url ?? swingId),
    tier: (swing.tier as HarvestTier | null) ?? null,
    storagePath: String(swing.storage_path),
    handedness,
    frames,
    frameRateDetected: frameRate,
  });

  const { error: kpError } = await secret.from("test_swing_keypoints").insert({
    test_swing_id: swingId,
    model_version: POSE_MODEL_VERSION,
    frame_rate_detected: frameRate,
    keypoints: frames,
    coverage: jointCoverage(frames),
    phases: pipeline.phases,
    angle: pipeline.angle,
    normalized_keypoints: pipeline.normalizedFrames,
    metrics: pipeline.metrics,
  });
  if (kpError) {
    throw new Error(kpError.message);
  }

  await secret.from("test_swings").update(pipeline.updates).eq("id", swingId);

  let splitCount = 0;
  if (pipeline.childSegments.length > 1) {
    for (const [index, segment] of pipeline.childSegments.entries()) {
      const childFrames = frames.slice(
        segment.startFrameIndex,
        segment.endFrameIndex + 1,
      );
      const childPipeline = runHarvestPipeline({
        swingId,
        title: `${swing.golfer_label ?? "clip"} · swing ${index + 1}`,
        tier: (swing.tier as HarvestTier | null) ?? null,
        storagePath: String(swing.storage_path),
        handedness,
        frames: childFrames,
        frameRateDetected: frameRate,
        parentId: swingId,
        segment,
      });
      const { data: child, error: childError } = await secret
        .from("test_swings")
        .insert({
          storage_path: swing.storage_path,
          parent_id: swingId,
          created_by: ADMIN_USER_ID,
          created_by_email: ADMIN_EMAIL,
          source_url: swing.source_url,
          channel: swing.channel,
          license_note: swing.license_note,
          tier: swing.tier,
          golfer_label: `${swing.golfer_label ?? "clip"} · swing ${index + 1}`,
          club_family: childPipeline.clubFamily,
          intent: "stock",
          capture_path: "native_slomo",
          handedness,
          segment_start_ms: segment.startMs,
          segment_end_ms: segment.endMs,
          excluded: childPipeline.excluded,
          exclude_reason: childPipeline.excludeReason,
          pro_label_fault_1: childPipeline.proLabelFault1,
          label_status: childPipeline.labelStatus,
        })
        .select("id")
        .single();
      if (childError || !child) {
        continue;
      }
      splitCount += 1;
      await secret.from("test_swing_keypoints").insert({
        test_swing_id: child.id,
        model_version: POSE_MODEL_VERSION,
        frame_rate_detected: frameRate,
        keypoints: childFrames.map((frame, frameIndex) => ({
          ...frame,
          frameIndex,
        })),
        coverage: jointCoverage(childFrames),
        phases: childPipeline.phases,
        angle: childPipeline.angle,
        normalized_keypoints: childPipeline.normalizedFrames,
        metrics: childPipeline.metrics,
      });
    }
  }

  return { passedGate: !pipeline.excluded, splitCount };
}

async function fetchAndPipeline(
  hits: SelectedHit[],
  siteBase: string,
  report: RunReport,
) {
  const secret = createSecretSupabaseClient();
  const maxBatch = Number(
    process.argv.includes("--max-batch")
      ? process.argv[process.argv.indexOf("--max-batch") + 1]
      : HARVEST_FETCH_RATE_LIMIT,
  );

  for (let offset = 0; offset < hits.length; offset += maxBatch) {
    const batch = hits.slice(offset, offset + maxBatch);
    const { data: run, error: runError } = await secret
      .from("harvest_runs")
      .insert({
        created_by: ADMIN_USER_ID,
        created_by_email: ADMIN_EMAIL,
        status: "running",
        requested_count: batch.length,
        summary: { items: batch.map((item) => item.videoId) },
      })
      .select("id")
      .single();
    if (runError) {
      report.blockers.push(`harvest_run insert: ${runError.message}`);
    }

    for (const item of batch) {
      try {
        const { buffer, title, ext } = await downloadYouTubeVideo(item.url);
        const fileName = safeClipFileName(
          `${item.videoId}-${title}.${ext === "mp4" ? "mp4" : "mp4"}`,
        );
        const storagePath = `harvest/${item.videoId}/${randomUUID()}-${fileName}`;
        const { error: uploadError } = await secret.storage
          .from(TEST_SWING_BUCKET)
          .upload(storagePath, buffer, {
            contentType: "video/mp4",
            upsert: false,
          });
        if (uploadError) {
          throw new Error(uploadError.message);
        }

        const club = clubFamilyFromTitle(item.title);
        const suggested =
          item.tier === "answer_key"
            ? suggestedFaultFromTitle(item.title)
            : null;

        const { data: swing, error: insertError } = await secret
          .from("test_swings")
          .insert({
            storage_path: storagePath,
            created_by: ADMIN_USER_ID,
            created_by_email: ADMIN_EMAIL,
            source_url: item.url,
            channel: item.channelTitle,
            license_note: HARVEST_LICENSE_NOTE,
            tier: item.tier,
            golfer_label: item.title.slice(0, 80),
            club_family: isKnownClubFamily(club) ? club : null,
            intent: "stock",
            capture_path: "native_slomo",
            handedness: "right",
            consecutive_group: null,
            pro_label_fault_1: suggested,
            label_status: suggested ? "suggested" : null,
            excluded: false,
          })
          .select("*")
          .single();
        if (insertError || !swing) {
          throw new Error(insertError?.message ?? "Insert failed.");
        }

        report.fetched += 1;

        const signRes = await secret.storage
          .from(TEST_SWING_BUCKET)
          .createSignedUrl(storagePath, 3600);
        if (signRes.error || !signRes.data?.signedUrl) {
          throw new Error(signRes.error?.message ?? "Could not sign clip.");
        }
        const clipRes = await fetch(signRes.data.signedUrl);
        if (!clipRes.ok) {
          throw new Error(`clip download ${clipRes.status}`);
        }
        const clipBytes = await clipRes.arrayBuffer();
        const ingest = await runIngest(siteBase, clipBytes, item.title);
        const pipeline = await savePipeline(
          swing.id,
          swing,
          ingest.keypoints,
          ingest.frameRate,
          "right",
        );
        if (pipeline.passedGate) {
          report.passedGate += 1;
        }
        report.split += pipeline.splitCount;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "fetch/pipeline failed";
        if (message.includes("yt-dlp")) {
          report.fetchErrors.push(`${item.videoId}: ${message}`);
        } else {
          report.pipelineErrors.push(`${item.videoId}: ${message}`);
        }
      }
    }

    if (run?.id) {
      await secret
        .from("harvest_runs")
        .update({
          status: "completed",
          fetched_count: report.fetched,
        })
        .eq("id", run.id);
    }
  }
}

async function main() {
  loadEnv();
  const siteBase = process.argv.includes("--base")
    ? process.argv[process.argv.indexOf("--base") + 1]!
    : process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const shouldSeed = process.argv.includes("--seed");

  const report: RunReport = {
    found: 0,
    fetched: 0,
    passedGate: 0,
    split: 0,
    fetchErrors: [],
    pipelineErrors: [],
    seedCells: [],
    seedInserted: 0,
    blockers: [],
  };

  if (!process.env.YOUTUBE_API_KEY?.trim()) {
    report.blockers.push(
      "YOUTUBE_API_KEY missing locally and on Vercel — add to .env.local and redeploy.",
    );
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  if (!(await isYtDlpAvailable())) {
    report.blockers.push("yt-dlp not installed on this host.");
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  report.blockers.push(
    "yt-dlp cannot run on Vercel serverless — fetch uses this local worker script.",
  );

  const hits = await selectOnePerQuery().catch((error) => {
    report.blockers.push(
      error instanceof Error ? error.message : "YouTube search failed.",
    );
    return [] as SelectedHit[];
  });
  report.found = hits.length;

  if (hits.length === 0) {
    report.blockers.push("YouTube search returned no videos.");
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  console.error(`Selected ${hits.length} videos; fetching in batches…`);
  await fetchAndPipeline(hits, siteBase, report);

  if (shouldSeed) {
    try {
      const seed = await seedBandsFromReference({
        userId: ADMIN_USER_ID,
        email: ADMIN_EMAIL,
      });
      report.seedInserted = seed.inserted;
      report.seedCells = seed.cells.map((cell) => ({
        metricKey: cell.metricKey,
        clubFamily: cell.clubFamily,
        angle: cell.angle,
        n: cell.n,
      }));
    } catch (error) {
      const preview = await loadBandsSeedPreview();
      report.seedCells = preview.cells.map((cell) => ({
        metricKey: cell.metricKey,
        clubFamily: cell.clubFamily,
        angle: cell.angle,
        n: cell.n,
      }));
      report.blockers.push(
        error instanceof Error ? error.message : "Seed from reference failed.",
      );
    }
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
