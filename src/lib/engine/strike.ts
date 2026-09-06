import { derived, invalidDerived, type Derived } from "@/lib/engine/derived";

export type StrikeQualityLabel =
  | "center"
  | "heel"
  | "toe"
  | "thin"
  | "fat"
  | "unknown";

export type StrikeFeatures = {
  spectral_centroid_hz: number;
  rolloff_85_hz: number;
  decay_to_minus_20db_ms: number;
  band_energy_0_1k: number;
  band_energy_1_3k: number;
  band_energy_3_6k: number;
  band_energy_6k_plus: number;
  second_10ms_ratio: number;
  mel_spectrogram: number[];
  window_start_ms: number;
  window_end_ms: number;
  sample_rate: number;
  reverberant: boolean;
  echo_confidence_penalty: number;
};

export type StrikeQuality = Derived<StrikeQualityLabel>;

export type StrikeAnalysis = {
  strike_quality: StrikeQuality;
  features: StrikeFeatures | null;
  transient_found: boolean;
};

const ENERGY_THRESHOLD = 0.02;
const ECHO_WINDOW_MS = 40;
const PRE_ONSET_MS = 5;
const POST_ONSET_MS = 15;
const FEATURE_WINDOW_MS = 20;

function rms(samples: Float32Array, start: number, end: number): number {
  let sum = 0;
  const n = Math.max(1, end - start);
  for (let i = start; i < end; i++) {
    const v = samples[i] ?? 0;
    sum += v * v;
  }
  return Math.sqrt(sum / n);
}

function findRiseTimeOnset(
  samples: Float32Array,
  sampleRate: number,
): { onsetSample: number; reverberant: boolean; penalty: number } | null {
  const frameSize = Math.max(1, Math.round(sampleRate * 0.001));
  const hop = frameSize;
  let prev = 0;
  let firstOnset = -1;
  let secondOnset = -1;

  for (let i = 0; i + frameSize < samples.length; i += hop) {
    const e = rms(samples, i, i + frameSize);
    const rise = e - prev;
    if (e > ENERGY_THRESHOLD && rise > ENERGY_THRESHOLD * 0.35) {
      if (firstOnset < 0) {
        firstOnset = i;
      } else if (secondOnset < 0) {
        const dtMs = ((i - firstOnset) / sampleRate) * 1000;
        if (dtMs <= ECHO_WINDOW_MS) {
          secondOnset = i;
        }
      }
    }
    prev = e;
  }

  if (firstOnset < 0) {
    return null;
  }

  const reverberant = secondOnset >= 0;
  const penalty = reverberant ? 0.45 : 0;
  return { onsetSample: firstOnset, reverberant, penalty };
}

function hann(n: number, i: number): number {
  return 0.5 * (1 - Math.cos((2 * Math.PI * i) / Math.max(1, n - 1)));
}

function fftMag(samples: Float32Array): Float32Array {
  const n = samples.length;
  const out = new Float32Array(n / 2 + 1);
  for (let k = 0; k < out.length; k++) {
    let re = 0;
    let im = 0;
    for (let t = 0; t < n; t++) {
      const angle = (-2 * Math.PI * k * t) / n;
      re += samples[t]! * Math.cos(angle);
      im += samples[t]! * Math.sin(angle);
    }
    out[k] = Math.hypot(re, im);
  }
  return out;
}

function hzToBin(hz: number, sampleRate: number, fftSize: number): number {
  return Math.min(fftSize / 2, Math.round((hz * fftSize) / sampleRate));
}

function spectralCentroid(mag: Float32Array, sampleRate: number): number {
  let num = 0;
  let den = 0;
  for (let k = 1; k < mag.length; k++) {
    const f = (k * sampleRate) / (2 * (mag.length - 1));
    const m = mag[k]!;
    num += f * m;
    den += m;
  }
  return den > 0 ? num / den : 0;
}

function rolloff85(mag: Float32Array, sampleRate: number): number {
  let total = 0;
  for (let k = 1; k < mag.length; k++) {
    total += mag[k]!;
  }
  let acc = 0;
  for (let k = 1; k < mag.length; k++) {
    acc += mag[k]!;
    if (acc >= total * 0.85) {
      return (k * sampleRate) / (2 * (mag.length - 1));
    }
  }
  return 0;
}

function bandEnergy(
  mag: Float32Array,
  sampleRate: number,
  lowHz: number,
  highHz: number,
): number {
  const fftSize = (mag.length - 1) * 2;
  const k0 = hzToBin(lowHz, sampleRate, fftSize);
  const k1 = hzToBin(highHz, sampleRate, fftSize);
  let sum = 0;
  for (let k = k0; k <= k1 && k < mag.length; k++) {
    sum += (mag[k] ?? 0) ** 2;
  }
  return sum;
}

function decayToMinus20Db(
  samples: Float32Array,
  onset: number,
  sampleRate: number,
): number {
  const peak = rms(samples, onset, Math.min(samples.length, onset + Math.round(sampleRate * 0.002)));
  if (peak <= 1e-6) {
    return 0;
  }
  const target = peak * 0.1;
  const frame = Math.max(1, Math.round(sampleRate * 0.001));
  for (let i = onset; i + frame < samples.length; i += frame) {
    if (rms(samples, i, i + frame) <= target) {
      return ((i - onset) / sampleRate) * 1000;
    }
  }
  return FEATURE_WINDOW_MS;
}

function melScale(hz: number): number {
  return 2595 * Math.log10(1 + hz / 700);
}

function melSpectrogram64(
  mag: Float32Array,
  sampleRate: number,
): number[] {
  const bins = 64;
  const melMax = melScale(sampleRate / 2);
  const out = new Array<number>(bins).fill(0);
  for (let k = 1; k < mag.length; k++) {
    const hz = (k * sampleRate) / (2 * (mag.length - 1));
    const mel = melScale(hz);
    const idx = Math.min(bins - 1, Math.floor((mel / melMax) * bins));
    out[idx] = (out[idx] ?? 0) + (mag[k] ?? 0);
  }
  const peak = Math.max(...out, 1e-9);
  return out.map((v) => v / peak);
}

export function extractEchoGatedWindow(input: {
  samples: Float32Array;
  sampleRate: number;
  /** Optional hint onset in seconds from clip start. */
  onsetHintSec?: number | null;
}): {
  window: Float32Array;
  reverberant: boolean;
  penalty: number;
  onsetSample: number;
} | null {
  const { samples, sampleRate } = input;
  let onset = findRiseTimeOnset(samples, sampleRate);
  if (!onset && input.onsetHintSec != null) {
    const hint = Math.round(input.onsetHintSec * sampleRate);
    if (hint >= 0 && hint < samples.length) {
      onset = { onsetSample: hint, reverberant: false, penalty: 0 };
    }
  }
  if (!onset) {
    return null;
  }

  const pre = Math.round((PRE_ONSET_MS / 1000) * sampleRate);
  const post = Math.round((POST_ONSET_MS / 1000) * sampleRate);
  const start = Math.max(0, onset.onsetSample - pre);
  const end = Math.min(samples.length, onset.onsetSample + post);
  const window = samples.slice(start, end);
  return {
    window,
    reverberant: onset.reverberant,
    penalty: onset.penalty,
    onsetSample: onset.onsetSample,
  };
}

export function computeStrikeFeatures(input: {
  samples: Float32Array;
  sampleRate: number;
  reverberant: boolean;
  penalty: number;
  onsetSample: number;
}): StrikeFeatures {
  const { samples, sampleRate, reverberant, penalty, onsetSample } = input;
  const winLen = Math.min(
    samples.length,
    Math.round((FEATURE_WINDOW_MS / 1000) * sampleRate),
  );
  const win = new Float32Array(winLen);
  for (let i = 0; i < winLen; i++) {
    win[i] = (samples[onsetSample + i] ?? 0) * hann(winLen, i);
  }

  const mag = fftMag(win);
  const sr = sampleRate;

  const first10 = Math.min(
    winLen,
    Math.round(0.01 * sampleRate),
  );
  const second10Start = first10;
  const second10End = Math.min(winLen, first10 * 2);
  const e1 = rms(win, 0, first10);
  const e2 = rms(win, second10Start, second10End);

  return {
    spectral_centroid_hz: spectralCentroid(mag, sr),
    rolloff_85_hz: rolloff85(mag, sr),
    decay_to_minus_20db_ms: decayToMinus20Db(samples, onsetSample, sr),
    band_energy_0_1k: bandEnergy(mag, sr, 0, 1000),
    band_energy_1_3k: bandEnergy(mag, sr, 1000, 3000),
    band_energy_3_6k: bandEnergy(mag, sr, 3000, 6000),
    band_energy_6k_plus: bandEnergy(mag, sr, 6000, sr / 2),
    second_10ms_ratio: e1 > 1e-9 ? e2 / e1 : 0,
    mel_spectrogram: melSpectrogram64(mag, sr),
    window_start_ms: (onsetSample / sr) * 1000 - PRE_ONSET_MS,
    window_end_ms: (onsetSample / sr) * 1000 + POST_ONSET_MS,
    sample_rate: sr,
    reverberant,
    echo_confidence_penalty: penalty,
  };
}

export type AnalyzeStrikeInput = {
  samples: Float32Array | null;
  sampleRate: number;
  onsetHintSec?: number | null;
  capturePath?: string | null;
  clubFamily?: string | null;
  classifierEnabled?: boolean;
};

export function analyzeStrike(input: AnalyzeStrikeInput): StrikeAnalysis {
  if (!input.samples || input.samples.length < 64) {
    return {
      strike_quality: invalidDerived<StrikeQualityLabel>(
        "unknown",
        "no labels yet",
      ),
      features: null,
      transient_found: false,
    };
  }

  const gated = extractEchoGatedWindow({
    samples: input.samples,
    sampleRate: input.sampleRate,
    onsetHintSec: input.onsetHintSec,
  });

  if (!gated) {
    return {
      strike_quality: {
        value: "unknown",
        confidence: 0,
        valid: false,
        reason: "no labels yet",
      },
      features: null,
      transient_found: false,
    };
  }

  const features = computeStrikeFeatures({
    samples: input.samples,
    sampleRate: input.sampleRate,
    reverberant: gated.reverberant,
    penalty: gated.penalty,
    onsetSample: gated.onsetSample,
  });

  if (!input.capturePath || !input.clubFamily) {
    return {
      strike_quality: {
        value: "unknown",
        confidence: 0,
        valid: false,
        reason: "no labels yet",
      },
      features,
      transient_found: true,
    };
  }

  return {
    strike_quality: {
      value: "unknown",
      confidence: 0,
      valid: false,
      reason: "no labels yet",
    },
    features,
    transient_found: true,
  };
}

export function classifyStrikeQuality(
  _features: StrikeFeatures,
): StrikeQuality {
  return {
    value: "unknown",
    confidence: 0,
    valid: false,
    reason: "no labels yet",
  };
}

/** Copy gate: corroboration only — never overrides body metric headline. */
export function strikeCorroborationCopy(
  quality: StrikeQuality,
): string | null {
  if (!quality.valid || quality.value === "unknown") {
    return null;
  }
  const map: Record<Exclude<StrikeQualityLabel, "unknown" | "center">, string> =
    {
      thin: "that one sounded thin",
      fat: "that one sounded fat",
      heel: "that one sounded heel",
      toe: "that one sounded toe",
    };
  if (quality.value === "center") {
    return null;
  }
  return map[quality.value] ?? null;
}
