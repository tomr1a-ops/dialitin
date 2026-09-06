import { describe, expect, test } from "vitest";
import {
  analyzeStrike,
  computeStrikeFeatures,
  extractEchoGatedWindow,
} from "@/lib/engine/strike";

function syntheticClick(input: {
  sampleRate: number;
  durationSec: number;
  echoDelayMs?: number;
  echoGain?: number;
}): Float32Array {
  const n = Math.round(input.sampleRate * input.durationSec);
  const out = new Float32Array(n);
  const onset = Math.round(input.sampleRate * 0.05);
  for (let i = 0; i < 200; i++) {
    const t = i / input.sampleRate;
    out[onset + i] = Math.sin(2 * Math.PI * 3000 * t) * Math.exp(-t * 800);
  }
  if (input.echoDelayMs != null && input.echoGain != null) {
    const delay = Math.round((input.echoDelayMs / 1000) * input.sampleRate);
    for (let i = 0; i < n - delay; i++) {
      out[i + delay] += (out[i] ?? 0) * input.echoGain;
    }
  }
  return out;
}

describe("extractEchoGatedWindow", () => {
  test("clean click finds onset", () => {
    const sr = 44100;
    const samples = syntheticClick({ sampleRate: sr, durationSec: 0.2 });
    const gated = extractEchoGatedWindow({ samples, sampleRate: sr });
    expect(gated).not.toBeNull();
    expect(gated!.reverberant).toBe(false);
    expect(gated!.window.length).toBeGreaterThan(100);
  });

  test("click + 30ms echo marks reverberant", () => {
    const sr = 44100;
    const samples = syntheticClick({
      sampleRate: sr,
      durationSec: 0.25,
      echoDelayMs: 30,
      echoGain: 0.6,
    });
    const gated = extractEchoGatedWindow({ samples, sampleRate: sr });
    expect(gated).not.toBeNull();
    expect(gated!.reverberant).toBe(true);
    expect(gated!.penalty).toBeGreaterThan(0);
  });
});

describe("computeStrikeFeatures", () => {
  test("extracts spectral features from synthetic click", () => {
    const sr = 44100;
    const samples = syntheticClick({ sampleRate: sr, durationSec: 0.2 });
    const gated = extractEchoGatedWindow({ samples, sampleRate: sr });
    expect(gated).not.toBeNull();
    const features = computeStrikeFeatures({
      samples,
      sampleRate: sr,
      reverberant: gated!.reverberant,
      penalty: gated!.penalty,
      onsetSample: gated!.onsetSample,
    });
    expect(features.spectral_centroid_hz).toBeGreaterThan(500);
    expect(features.mel_spectrogram).toHaveLength(64);
    expect(features.band_energy_1_3k).toBeGreaterThan(0);
  });
});

describe("analyzeStrike", () => {
  test("classifier off returns unknown", () => {
    const sr = 44100;
    const samples = syntheticClick({ sampleRate: sr, durationSec: 0.2 });
    const result = analyzeStrike({
      samples,
      sampleRate: sr,
      capturePath: "native_slomo",
      clubFamily: "wedge",
    });
    expect(result.strike_quality.value).toBe("unknown");
    expect(result.strike_quality.valid).toBe(false);
    expect(result.features).not.toBeNull();
    expect(result.transient_found).toBe(true);
  });
});
