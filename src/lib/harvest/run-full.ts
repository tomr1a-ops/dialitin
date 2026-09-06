import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { loadBandsSeedPreview, seedBandsFromReference } from "@/lib/admin/bands-seed";
import { safeClipFileName, TEST_SWING_BUCKET } from "@/lib/admin/test-swings";
import type { Handedness } from "@/lib/admin/test-swings";
import {
  HARVEST_FETCH_RATE_LIMIT,
  HARVEST_LICENSE_NOTE,
  type HarvestTier,
} from "@/lib/harvest/constants";
import { clubFamilyFromTitle, isKnownClubFamily } from "@/lib/harvest/club-family";
import { discoverHarvestClips } from "@/lib/harvest/discover-clips";
import { downloadYouTubeVideo, isYtDlpAvailable } from "@/lib/harvest/download";
import { suggestedFaultFromTitle } from "@/lib/harvest/fault-keywords";
import { runHarvestPipeline } from "@/lib/harvest/pipeline";
import { trimVideoClip, writeTempVideo } from "@/lib/harvest/trim-clip";
import { searchYouTubeQuery } from "@/lib/harvest/youtube-search";
import { POSE_MODEL_VERSION } from "@/lib/pose/joints";
import { jointCoverage } from "@/lib/preview/coverage";
import { createSecretSupabaseClient } from "@/lib/supabase/admin";
import type { PoseFrame } from "@/lib/pose/types";

export const REFERENCE_QUERIES = [
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

export const ANSWER_KEY_QUERIES = [
  "why do I slice driver my swing",
  "early extension my golf swing help",
  "over the top golf swing check mine",
  "sway golf swing analysis amateur",
] as const;

const ADMIN_USER_ID = "9402ff58-62fe-40fc-a36c-a723bbdf7b0a";
const ADMIN_EMAIL = "info@dialitin.ai";

export type HarvestRunReport = {
  found: number;
  fetched: number;
  clipsAfterSplit: number;
  uploaded: number;
  passedGate: number;
  fetchErrors: string[];
  pipelineErrors: string[];
  seedCells: Array<{ metricKey: string; clubFamily: string; angle: string; n: number }>;
  seedInserted: number;
  blockers: string[];
};

type SelectedHit = Awaited<ReturnType<typeof searchYouTubeQuery>>[number];

export type RunFullHarvestOptions = {
  siteBase?: string;
  shouldSeed?: boolean;
  maxBatch?: number;
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
  videoPath: string,
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
    await page.locator("input[data-ingest-file]").setInputFiles(videoPath);
    const result = await page.evaluate(
      async (opts) => {
        if (!window.__runIngestFromDom) {
          return { ok: false, error: "ingest runner missing file handler" };
        }
        return window.__runIngestFromDom(opts);
      },
      {
        capturePath: "upload" as const,
        fileName,
        handedness: "right" as const,
        labeledFrameRate: null,
      },
    );
    if (!result.ok) {
      throw new Error(result.error ?? "ingest failed");
    }
    const frames = (result.keypoints ?? []) as PoseFrame[];
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
): Promise<{ passedGate: boolean }> {
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
  return { passedGate: !pipeline.excluded };
}

async function fetchAndPipeline(
  hits: SelectedHit[],
  siteBase: string,
  report: HarvestRunReport,
  maxBatch: number,
) {
  const secret = createSecretSupabaseClient();

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
      let sourcePath: string | null = null;
      try {
        const { buffer, title, ext } = await downloadYouTubeVideo(item.url);
        sourcePath = await writeTempVideo(buffer, ext);
        report.fetched += 1;

        const ingest = await runIngest(siteBase, sourcePath, item.title);

        const clips = discoverHarvestClips(
          ingest.keypoints,
          ingest.frameRate,
          "right",
        );
        report.clipsAfterSplit += clips.length;

        if (clips.length === 0) {
          throw new Error("no swing clips detected after pose segmentation");
        }

        const club = clubFamilyFromTitle(item.title);
        const suggested =
          item.tier === "answer_key"
            ? suggestedFaultFromTitle(item.title)
            : null;

        for (const clip of clips) {
          let trimPath: string | null = null;
          try {
            const trimmed = await trimVideoClip(
              sourcePath,
              clip.startMs,
              clip.endMs,
            );
            trimPath = trimmed.outputPath;

            const swingLabel =
              clips.length > 1
                ? `${item.title.slice(0, 60)} · swing ${clip.swingIndex + 1}`
                : item.title.slice(0, 80);
            const fileName = safeClipFileName(
              `${item.videoId}-swing${clip.swingIndex + 1}.mp4`,
            );
            const storagePath = `harvest/${item.videoId}/${randomUUID()}-${fileName}`;

            const { error: uploadError } = await secret.storage
              .from(TEST_SWING_BUCKET)
              .upload(storagePath, trimmed.buffer, {
                contentType: "video/mp4",
                upsert: false,
              });
            if (uploadError) {
              throw new Error(uploadError.message);
            }
            report.uploaded += 1;

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
                golfer_label: swingLabel,
                club_family: isKnownClubFamily(club) ? club : null,
                intent: "stock",
                capture_path: "native_slomo",
                handedness: "right",
                consecutive_group: null,
                pro_label_fault_1: suggested,
                label_status: suggested ? "suggested" : null,
                excluded: false,
                segment_start_ms: clip.startMs,
                segment_end_ms: clip.endMs,
              })
              .select("*")
              .single();
            if (insertError || !swing) {
              throw new Error(insertError?.message ?? "Insert failed.");
            }

            const pipeline = await savePipeline(
              swing.id,
              swing,
              clip.frames,
              clip.frameRate,
              "right",
            );
            if (pipeline.passedGate) {
              report.passedGate += 1;
            }
          } finally {
            if (trimPath) {
              await rm(trimPath, { force: true });
            }
          }
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "fetch/pipeline failed";
        if (message.includes("yt-dlp")) {
          report.fetchErrors.push(`${item.videoId}: ${message}`);
        } else {
          report.pipelineErrors.push(`${item.videoId}: ${message}`);
        }
      } finally {
        if (sourcePath) {
          await rm(sourcePath, { force: true });
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

export async function runFullHarvest(
  options: RunFullHarvestOptions = {},
): Promise<HarvestRunReport> {
  const siteBase =
    options.siteBase?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "http://localhost:3000";
  const shouldSeed = options.shouldSeed ?? false;
  const maxBatch = options.maxBatch ?? HARVEST_FETCH_RATE_LIMIT;

  const report: HarvestRunReport = {
    found: 0,
    fetched: 0,
    clipsAfterSplit: 0,
    uploaded: 0,
    passedGate: 0,
    fetchErrors: [],
    pipelineErrors: [],
    seedCells: [],
    seedInserted: 0,
    blockers: [],
  };

  if (!process.env.YOUTUBE_API_KEY?.trim()) {
    report.blockers.push("YOUTUBE_API_KEY missing.");
    return report;
  }

  if (!(await isYtDlpAvailable())) {
    report.blockers.push("yt-dlp not installed on this host.");
    return report;
  }

  const hits = await selectOnePerQuery().catch((error) => {
    report.blockers.push(
      error instanceof Error ? error.message : "YouTube search failed.",
    );
    return [] as SelectedHit[];
  });
  report.found = hits.length;

  if (hits.length === 0) {
    report.blockers.push("YouTube search returned no videos.");
    return report;
  }

  await fetchAndPipeline(hits, siteBase, report, maxBatch);

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

  return report;
}
