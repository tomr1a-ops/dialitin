#!/usr/bin/env node
/**
 * Full G01 ingest: pose + audio via browser ingest runner.
 * Usage: node scripts/g01-full-ingest.mjs [--base http://localhost:3000]
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  const path = resolve(process.cwd(), ".env.local");
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

loadEnv();

const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
const siteBase = process.argv.includes("--base")
  ? process.argv[process.argv.indexOf("--base") + 1]
  : process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

if (!base || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY");
  process.exit(1);
}

async function rest(path, query = "", init) {
  const res = await fetch(`${base}/rest/v1/${path}?${query}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`${path}: ${res.status} ${await res.text()}`);
  }
  if (res.status === 204) {
    return null;
  }
  return res.json();
}

async function signedUrl(storagePath) {
  const res = await fetch(
    `${base}/storage/v1/object/sign/test-swings/${storagePath}`,
    {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expiresIn: 3600 }),
    },
  );
  if (!res.ok) {
    throw new Error(`sign: ${res.status}`);
  }
  const json = await res.json();
  return `${base}/storage/v1${json.signedURL}`;
}

async function main() {
  const swings = await rest(
    "test_swings",
    "select=id,golfer_label,angle,handedness,club_family,intent,capture_path,frame_rate,storage_path&golfer_label=eq.G01&order=created_at.desc",
  );
  if (!swings?.length) {
    throw new Error("No G01 swing found");
  }

  let swing = swings[0];
  for (const candidate of swings) {
    if (
      candidate.angle === "face_on" ||
      candidate.storage_path?.includes("8642")
    ) {
      swing = candidate;
      break;
    }
  }

  const clipUrl = await signedUrl(swing.storage_path);
  const clipRes = await fetch(clipUrl);
  if (!clipRes.ok) {
    throw new Error(`clip download: ${clipRes.status}`);
  }
  const clipBytes = await clipRes.arrayBuffer();

  const puppeteer = await import("puppeteer");
  const browser = await puppeteer.default.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    protocolTimeout: 600_000,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
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
      async (bytes, opts) => {
        if (!window.__runIngest) {
          return { ok: false, error: "ingest runner missing" };
        }
        return window.__runIngest(bytes, opts);
      },
      [...new Uint8Array(clipBytes)],
      {
        capturePath: swing.capture_path === "in_app" ? "in-app" : "upload",
        fileName: swing.storage_path,
        handedness: swing.handedness === "left" ? "left" : "right",
        labeledFrameRate: swing.frame_rate,
        clubFamily: swing.club_family,
        intent: swing.intent,
      },
    );

    if (!result.ok) {
      throw new Error(result.error ?? "ingest failed");
    }

    console.info(
      "\n--- G01 FULL INGEST ---\n" +
        JSON.stringify(
          {
            golfer: swing.golfer_label,
            storage_path: swing.storage_path,
            frame_count: result.frameCount,
            detected_fps: result.detectedFrameRate,
            slo_mo_reexport: result.sloMoReexportedAt30,
            audio_transient_frame:
              result.impactDiagnostics?.audioTransientFrameIndex,
            motion_peak_frame: result.impactDiagnostics?.motionPeakFrameIndex,
            measured_av_offset_ms:
              result.impactDiagnostics?.measuredAvOffsetMs,
            av_clock_offset_ms: result.avClockOffsetMs,
            av_clock_offset_reason: result.avClockOffsetReason,
            metrics: result.metrics,
          },
          null,
          2,
        ),
    );
    return result;
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
