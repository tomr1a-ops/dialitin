#!/usr/bin/env node
/**
 * G01 audio-assisted phase diagnostics: ffmpeg audio RMS + stored keypoints.
 * Usage: node scripts/g01-audio-diagnostics.mjs
 */
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

function loadEnv() {
  try {
    const raw = readFileSync(join(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const k = trimmed.slice(0, eq).trim();
      let v = trimmed.slice(eq + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {
    /* optional */
  }
}

loadEnv();

const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!base || !key) {
  console.error("Missing Supabase env");
  process.exit(1);
}

async function rest(path, query = "") {
  const res = await fetch(`${base}/rest/v1/${path}?${query}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
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
  if (!res.ok) throw new Error(`sign: ${res.status}`);
  const json = await res.json();
  return `${base}/storage/v1${json.signedURL}`;
}

function rmsAtTimes(wavPath, timesMs) {
  const raw = readFileSync(wavPath);
  const sampleRate = 44100;
  const samples = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
  const windowMs = 33;
  return timesMs.map((timeMs) => {
    const center = Math.round((timeMs / 1000) * sampleRate);
    const half = Math.round((windowMs / 1000) * sampleRate);
    const from = Math.max(0, center - half);
    const to = Math.min(samples.length, center + half);
    let sum = 0;
    for (let i = from; i < to; i++) {
      const s = samples[i];
      sum += s * s;
    }
    const n = Math.max(1, to - from);
    return { timeMs, rms: Math.sqrt(sum / n) };
  });
}

async function main() {
  const swings = await rest(
    "test_swings",
    "select=id,golfer_label,handedness,capture_path,frame_rate,storage_path&golfer_label=eq.G01&order=created_at.desc",
  );
  const swing = swings.find((s) => s.storage_path?.includes("8642")) ?? swings[0];
  const kpRows = await rest(
    "test_swing_keypoints",
    `select=keypoints,phases&test_swing_id=eq.${swing.id}&order=created_at.desc&limit=1`,
  );
  const row = kpRows[0];
  if (!row?.keypoints) throw new Error("No keypoints — run pose first");

  const frames = row.keypoints;
  const timesMs = frames.map((f) => f.mediaTime * 1000);

  const clipUrl = await signedUrl(swing.storage_path);
  const clipRes = await fetch(clipUrl);
  if (!clipRes.ok) throw new Error(`clip: ${clipRes.status}`);
  const clipBuf = Buffer.from(await clipRes.arrayBuffer());

  const dir = mkdtempSync(join(tmpdir(), "g01-audio-"));
  const clipPath = join(dir, "clip.mov");
  const wavPath = join(dir, "audio.wav");
  writeFileSync(clipPath, clipBuf);
  execFileSync(
    "ffmpeg",
    ["-y", "-i", clipPath, "-ac", "1", "-ar", "44100", "-f", "f32le", wavPath],
    { stdio: "ignore" },
  );

  const audioSamples = rmsAtTimes(wavPath, timesMs);

  const { findSwingPhases, AV_CLOCK_OFFSET_MS, AV_CLOCK_OFFSET_REASON } =
    await import("../src/lib/engine/phases.ts");

  const diagnostics = {
    audioTransientFrameIndex: null,
    motionPeakFrameIndex: null,
    motionImpactFrameIndex: null,
    measuredAvOffsetMs: null,
  };

  const capturePath =
    swing.capture_path === "in_app" ? "in_app" : "native_slomo";

  const phases = findSwingPhases(frames, {
    audioSamples,
    handedness: swing.handedness === "left" ? "left" : "right",
    capturePath,
    labeledFrameRate: swing.frame_rate,
    fileName: swing.storage_path,
    diagnostics,
  });

  const report = {
    golfer: swing.golfer_label,
    storage_path: swing.storage_path,
    phase_frames: {
      address: phases.address.frameIndex,
      takeaway: phases.takeaway.frameIndex,
      top: phases.top.frameIndex,
      impact: phases.impact.frameIndex,
      finish: phases.finish.frameIndex,
    },
    audio_transient_frame: diagnostics.audioTransientFrameIndex,
    motion_strike_frame: diagnostics.motionImpactFrameIndex,
    motion_peak_frame: diagnostics.motionPeakFrameIndex,
    measured_av_offset_ms: diagnostics.measuredAvOffsetMs,
    av_clock_offset_ms: AV_CLOCK_OFFSET_MS[capturePath],
    av_clock_offset_reason: AV_CLOCK_OFFSET_REASON[capturePath],
    impact_candidate: phases.impactCandidate.value,
    slo_mo_reexport: phases.sloMoReexportedAt30.value,
  };

  console.info("\n--- G01 AUDIO DIAGNOSTICS ---\n" + JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
