import { clamp01, fnv1a, mulberry32 } from "./dsp.ts";
import type { SpikeState, TrackProfile } from "./types.ts";

const NEURONS = 24;
const STEPS_PER_FRAME = 4;
const TAU = 8; // membrane time constant, steps
const BASE_THRESHOLD = 1.0;
const TARGET_RATE = 0.15; // homeostatic firing target per neuron
const ADAPT = 0.02;

export function runLif(profile: TrackProfile, seed?: number): SpikeState {
  const rng = mulberry32(seed ?? fnv1a(profile.signature));
  const w = new Float32Array(NEURONS * 4);
  for (let i = 0; i < w.length; i++) w[i] = rng() * 2 - 0.5;
  const lateral = new Float32Array(NEURONS * NEURONS);
  for (let i = 0; i < NEURONS; i++) {
    for (let j = 0; j < NEURONS; j++) {
      lateral[i * NEURONS + j] = i === j ? 0 : -0.35 * rng();
    }
  }

  const v = new Float32Array(NEURONS);
  const thr = new Float32Array(NEURONS).fill(BASE_THRESHOLD);
  const lastSpike = new Int32Array(NEURONS).fill(-999);
  const spikesPerNeuron = new Float64Array(NEURONS);
  const pooled: number[] = [];
  const refractory = new Uint8Array(NEURONS);

  const frames = profile.frames;
  const maxRms = frames.reduce((m, f) => Math.max(m, f.rms), 1e-9);
  const stepRaster: string[] = [];

  for (let fi = 0; fi < frames.length; fi++) {
    const f = frames[fi]!;
    const channels = [
      clamp01(f.rms / maxRms),
      clamp01(f.centroid / 6000),
      clamp01(f.flux / (maxRms * 0.5)),
      clamp01(f.zcr * 4),
    ];
    for (let s = 0; s < STEPS_PER_FRAME; s++) {
      let fired = 0;
      const firedIdx: number[] = [];
      for (let i = 0; i < NEURONS; i++) {
        if (refractory[i]) {
          refractory[i] = 0;
          continue;
        }
        let current = 0;
        for (let c = 0; c < 4; c++) current += w[i * 4 + c]! * channels[c]!;
        for (let j = 0; j < NEURONS; j++) {
          const age = (s + fi * STEPS_PER_FRAME) - lastSpike[j]!;
          if (age < 3) current += lateral[i * NEURONS + j]! * 1.5;
        }
        v[i] = v[i]! * (1 - 1 / TAU) + current;
        if (v[i]! >= thr[i]!) {
          v[i] = 0;
          refractory[i] = 1;
          lastSpike[i] = s + fi * STEPS_PER_FRAME;
          spikesPerNeuron[i] = spikesPerNeuron[i]! + 1;
          firedIdx.push(i);
          fired++;
        }
      }
      pooled.push(fired);
      if (s === STEPS_PER_FRAME - 1) stepRaster.push(renderRow(firedIdx));
    }
    if (fi % 50 === 49) {
      for (let i = 0; i < NEURONS; i++) {
        const rate = spikesPerNeuron[i]! / ((fi + 1) * STEPS_PER_FRAME);
        thr[i] = Math.max(0.3, thr[i]! + ADAPT * (TARGET_RATE - rate));
      }
    }
  }

  const totalSteps = frames.length * STEPS_PER_FRAME;
  const rates = Array.from(spikesPerNeuron, (s) => s / Math.max(1, totalSteps));
  const meanRate = rates.reduce((a, b) => a + b, 0) / NEURONS;
  const pooledMean = pooled.reduce((a, b) => a + b, 0) / Math.max(1, pooled.length);
  const pooledVar = pooled.reduce((s, x) => s + (x - pooledMean) ** 2, 0) / Math.max(1, pooled.length);
  const sync = clamp01(Math.sqrt(pooledVar) / (pooledMean + 0.5));

  const maxRows = 160;
  const stride = Math.max(1, Math.ceil(stepRaster.length / maxRows));
  const sampled: string[] = [];
  for (let i = 0; i < stepRaster.length; i += stride) sampled.push(stepRaster[i]!);
  const raster = sampled.join("\n").slice(0, 4000);

  return { rates, meanRate, sync, raster: raster.slice(0, 4000) };
}

function renderRow(firedIdx: number[]): string {
  const chars = new Array<string>(NEURONS).fill("·");
  for (const i of firedIdx) chars[i] = "▓";
  return chars.join("");
}
