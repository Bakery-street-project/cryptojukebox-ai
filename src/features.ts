import { fnv1a, hann, makeFft } from "./dsp.ts";
import type { Frame, TrackProfile } from "./types.ts";

const FRAME_SIZE = 2048;
const HOP = 512;

const MAJOR_TEMPLATE = [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0];
const MINOR_TEMPLATE = [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0];

function rotate<T>(arr: T[], by: number): T[] {
  const n = arr.length;
  const out = new Array<T>(n);
  for (let i = 0; i < n; i++) out[i] = arr[(i + by) % n]!;
  return out;
}

function correlate(a: number[], b: number[]): number {
  const n = a.length;
  const ma = a.reduce((s, x) => s + x, 0) / n;
  const mb = b.reduce((s, x) => s + x, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i]! - ma;
    const y = b[i]! - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  const denom = Math.sqrt(da * db);
  return denom === 0 ? 0 : num / denom;
}

export function analyze(samples: Float32Array, sampleRate: number, title: string): TrackProfile {
  const frameCount = Math.max(1, Math.floor((samples.length - FRAME_SIZE) / HOP) + 1);
  const fft = makeFft(FRAME_SIZE);
  const window = hann(FRAME_SIZE);
  const re = new Float32Array(FRAME_SIZE);
  const im = new Float32Array(FRAME_SIZE);
  const half = FRAME_SIZE / 2;
  const binHz = sampleRate / FRAME_SIZE;

  const frames: Frame[] = [];
  const chromaSum = new Float64Array(12);
  const prevMag = new Float32Array(half);
  let havePrev = false;

  for (let f = 0; f < frameCount; f++) {
    const offset = f * HOP;
    let sumSq = 0;
    let zc = 0;
    for (let i = 0; i < FRAME_SIZE; i++) {
      const x = samples[offset + i] ?? 0;
      sumSq += x * x;
      re[i] = x * window[i]!;
      im[i] = 0;
      if (i > 0 && ((samples[offset + i - 1] ?? 0) < 0) !== (x < 0)) zc++;
    }
    fft(re, im);

    let magSum = 0;
    let weighted = 0;
    let flux = 0;
    for (let k = 1; k < half; k++) {
      const mag = Math.hypot(re[k]!, im[k]!);
      const freq = k * binHz;
      if (freq >= 80 && freq <= 4200) {
        const midi = 69 + 12 * Math.log2(freq / 440);
        const pc = ((Math.round(midi) % 12) + 12) % 12;
        chromaSum[pc] = (chromaSum[pc] ?? 0) + mag;
      }
      magSum += mag;
      weighted += mag * freq;
      const prev = prevMag[k] ?? 0;
      if (havePrev && mag > prev) flux += mag - prev;
      prevMag[k] = mag;
    }
    const rms = Math.sqrt(sumSq / FRAME_SIZE);
    const centroid = magSum > 0 ? weighted / magSum : 0;
    frames.push({ t: offset / sampleRate, rms, centroid, flux, zcr: zc / FRAME_SIZE });
    havePrev = true;
  }

  const profile = summarize(frames, chromaSum, sampleRate, title);
  return profile;
}

function estimateBpm(onset: number[], frameRate: number): { bpm: number; bpmConfidence: number } {
  const n = onset.length;
  if (n < 8) return { bpm: 0, bpmConfidence: 0 };
  const mean = onset.reduce((s, x) => s + x, 0) / n;
  const centered = onset.map((x) => x - mean);
  const minLag = Math.max(2, Math.floor((frameRate * 60) / 200));
  const maxLag = Math.min(n - 2, Math.ceil((frameRate * 60) / 40));
  const corr = (lag: number): number => {
    let sum = 0;
    for (let i = 0; i + lag < n; i++) sum += centered[i]! * centered[i + lag]!;
    return sum;
  };
  const values: number[] = [];
  let bestLag = 0;
  let bestVal = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const v = corr(lag);
    values.push(v);
    if (v > bestVal) {
      bestVal = v;
      bestLag = lag;
    }
  }
  if (bestLag === 0) return { bpm: 0, bpmConfidence: 0 };
  while (Math.round(bestLag / 2) >= minLag && corr(Math.round(bestLag / 2)) >= bestVal * 0.45) {
    bestLag = Math.round(bestLag / 2);
  }
  const idx = bestLag - minLag;
  const at = (i: number) => values[i] ?? corr(minLag + i);
  const prev = at(idx - 1);
  const next = at(idx + 1);
  const denom = prev - 2 * (values[idx] ?? 0) + next;
  const shift = denom === 0 ? 0 : (0.5 * (prev - next)) / denom;
  const lag = bestLag + shift;
  // Confidence = how much of the onset signal's own energy the chosen
  // periodicity explains — peak prominence against the zero-lag energy
  // (energy), with the curve mean removed: clicks approach 1, aperiodic
  // flux stays near 0. Normalising against the curve's own max instead
  // would always score the argmax 1.0, even on noise.
  const curveMean = values.reduce((s, x) => s + x, 0) / values.length;
  const energy = centered.reduce((s, x) => s + x * x, 0);
  const span = energy - curveMean;
  const bpmConfidence = span <= 0 ? 0 : Math.max(0, Math.min(1, ((values[idx] ?? 0) - curveMean) / span));
  const bpm = lag <= 0 ? 0 : (60 * frameRate) / lag;
  return { bpm, bpmConfidence };
}

function summarize(frames: Frame[], chromaSum: Float64Array, sampleRate: number, title: string): TrackProfile {
  const n = frames.length;
  let rmsSum = 0;
  let centroidSum = 0;
  for (const fr of frames) {
    rmsSum += fr.rms;
    centroidSum += fr.centroid;
  }
  const loudness = rmsSum / n;
  const brightness = centroidSum / n;
  let rmsSq = 0;
  let fluxSum = 0;
  for (const fr of frames) {
    rmsSq += (fr.rms - loudness) ** 2;
    fluxSum += fr.flux;
  }
  const rmsStd = Math.sqrt(rmsSq / n);
  const dynamism = loudness > 0 ? Math.min(1, (rmsStd / loudness) * 0.7 + (fluxSum / n) / (loudness + 1e-9) * 0.3) : 0;

  const chroma = Array.from(chromaSum, (x) => x / (n + 1e-9));
  let best: { key: number; mode: "major" | "minor"; corr: number } = { key: 0, mode: "major", corr: -Infinity };
  let bestMinor = -Infinity;
  for (let r = 0; r < 12; r++) {
    const shifted = rotate(chroma, r);
    const cmaj = correlate(shifted, MAJOR_TEMPLATE);
    const cmin = correlate(shifted, MINOR_TEMPLATE);
    if (cmaj > best.corr) best = { key: r, mode: "major", corr: cmaj };
    if (cmin > best.corr) best = { key: r, mode: "minor", corr: cmin };
    if (cmin > bestMinor) bestMinor = cmin;
  }
  const majorness = best.mode === "major" ? best.corr - bestMinor : bestMinor - best.corr;

  const onset = frames.map((f) => f.flux);
  const frameRate = sampleRate / HOP;
  const { bpm, bpmConfidence } = estimateBpm(onset, frameRate);

  const brightnessNorm = Math.min(1, brightness / 5500);
  const loudnessNorm = Math.min(1, loudness / 0.25);
  const bpmNorm = Math.min(1, bpm / 160);
  const valence = Math.max(0, Math.min(1, 0.5 + majorness * 0.35 + (brightnessNorm - 0.4) * 0.3 - (best.mode === "minor" ? 0.08 : 0)));
  const arousal = Math.max(0, Math.min(1, bpmNorm * 0.45 + loudnessNorm * 0.3 + dynamism * 0.25));

  const signature = fnv1a(
    `${title}|${bpm.toFixed(1)}|${loudness.toFixed(4)}|${brightness.toFixed(1)}|${dynamism.toFixed(3)}|${best.key}${best.mode}|${n}`,
  ).toString(16);

  return {
    title,
    durationSec: n * (HOP / sampleRate),
    sampleRate,
    frames,
    bpm,
    bpmConfidence,
    loudness,
    brightness,
    dynamism,
    tonal: { key: best.key, mode: best.mode, majorness },
    valence,
    arousal,
    signature,
  };
}
