import { clamp01 } from "../dsp.ts";
import type { Frame, SpikeState, TrackProfile } from "../types.ts";
import type { Burst } from "./types.ts";
import type { FragmentCategory } from "./bank.ts";

/**
 * M1 — phasic pontine-geniculate-occipital bursts. In REM the pons fires in stereotyped
 * bursts that the cortex cannot veto; each burst drags whatever it lands on into the
 * narrative. Here the burst train is driven by the track's own spectral flux: the loudest
 * transients are the pontine generator, and a refractory window keeps them from clustering.
 */

/** Populations 0…23 of the 24-neuron LIF bank, projected onto memory classes. */
const NEURON_CLASS: readonly FragmentCategory[] = [
  "place",
  "figure",
  "object",
  "sense",
  "place",
  "action",
  "emotion",
  "scene",
  "object",
  "place",
  "figure",
  "sense",
  "emotion",
  "action",
  "place",
  "object",
  "scene",
  "figure",
  "emotion",
  "sense",
  "action",
  "place",
  "scene",
  "object",
];

function fluxStats(frames: readonly Frame[]): { mean: number; std: number } {
  let mean = 0;
  for (const f of frames) mean += f.flux;
  mean /= frames.length;
  let varSum = 0;
  for (const f of frames) varSum += (f.flux - mean) ** 2;
  return { mean, std: Math.sqrt(varSum / frames.length) };
}

function pickNeuron(spike: SpikeState, rng: () => number): number {
  const total = spike.rates.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return Math.floor(rng() * NEURON_CLASS.length) % NEURON_CLASS.length;
  let target = rng() * total;
  for (let i = 0; i < spike.rates.length; i++) {
    target -= spike.rates[i] ?? 0;
    if (target <= 0) return i % NEURON_CLASS.length;
  }
  return spike.rates.length - 1;
}

/**
 * Burst count tracks measured dynamism (2…6). Peaks are thinned to one per refractory
 * window, then ranked by flux so the strongest transients are the ones that wake memory.
 */
export function pgoBursts(profile: TrackProfile, spike: SpikeState, rng: () => number): Burst[] {
  const frames = profile.frames;
  const count = 2 + Math.round(clamp01(profile.dynamism) * 4);
  if (frames.length < 4) {
    return Array.from({ length: count }, (_, i) => {
      const neuron = pickNeuron(spike, rng);
      return { frame: i, time: i / 30, flux: 0, neuron, cat: NEURON_CLASS[neuron]! };
    });
  }

  const { mean, std } = fluxStats(frames);
  const floor = mean + std * 0.6;
  const refractory = Math.max(2, Math.floor(frames.length / (count * 2.5)));
  const peaks: { frame: number; flux: number }[] = [];
  for (let i = 1; i < frames.length - 1; i++) {
    const flux = frames[i]!.flux;
    if (flux < floor || flux < frames[i - 1]!.flux || flux < frames[i + 1]!.flux) continue;
    if (peaks.length > 0 && i - peaks[peaks.length - 1]!.frame < refractory) {
      if (flux > peaks[peaks.length - 1]!.flux) peaks[peaks.length - 1] = { frame: i, flux };
      continue;
    }
    peaks.push({ frame: i, flux });
  }

  // Controllable input, uncontrollable timing: if the track is too steady to peak,
  // the bursts are placed by chance anyway — a flat trace still dreams.
  const chosen = peaks.length >= 2 ? peaks.slice(-count) : Array.from({ length: count }, (_, i) => ({
    frame: Math.min(frames.length - 1, Math.floor(rng() * frames.length) + i),
    flux: frames[Math.floor(rng() * frames.length)]!.flux,
  }));

  return chosen.map((p) => {
    const neuron = pickNeuron(spike, rng);
    return {
      frame: p.frame,
      time: frames[p.frame]!.t,
      flux: p.flux,
      neuron,
      cat: NEURON_CLASS[neuron]!,
    };
  });
}

const PHOSPHENE_RAMP = " ·░▒▓█";

/** M8 — the hypnagogic strip: firing rate per neuron as luminance, drawn under the dream. */
export function phospheneLine(spike: SpikeState): string {
  const rates = spike.rates.length > 0 ? spike.rates : [0];
  const peak = Math.max(...rates, 0.02);
  return rates
    .map((r) => PHOSPHENE_RAMP[Math.min(PHOSPHENE_RAMP.length - 1, Math.round((r / peak) * (PHOSPHENE_RAMP.length - 1)))]!)
    .join("");
}
