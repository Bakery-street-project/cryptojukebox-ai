import type { SpikeState, TrackProfile } from "../types.ts";
import type { Fragment, MemoryBank } from "./bank.ts";
import type { Burst } from "./types.ts";

/**
 * M2 — hippocampal replay is not uniform: the tags amygdala wrote onto a memory decide
 * what gets re-activated during consolidation. So selection is weighted by how well a
 * fragment's own affect lines up with the affect the track actually measures, with a
 * never-zero floor: the strange intrusions are a property of the sampler, not a bug.
 */

export function affectiveMatch(fragment: Fragment, profile: TrackProfile): number {
  const dv = fragment.v - (profile.valence * 2 - 1);
  const da = fragment.a - (profile.arousal * 2 - 1);
  return 1 - Math.min(1, Math.hypot(dv, da) / 2.83);
}

/** Weights aligned to `fragments`, always > 0 so remote material stays reachable. */
export function salienceWeights(
  fragments: readonly Fragment[],
  profile: TrackProfile,
  spike: SpikeState,
  gain: number,
): number[] {
  const drive = 0.4 + spike.sync * 0.9;
  return fragments.map((f) => 0.08 + Math.exp(gain * drive * affectiveMatch(f, profile)));
}

export function weightedSample<T>(items: readonly T[], weights: readonly number[], rng: () => number): T {
  let total = 0;
  for (const w of weights) total += w;
  let target = rng() * total;
  for (let i = 0; i < items.length; i++) {
    target -= weights[i] ?? 0;
    if (target <= 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

/** The fragments a burst wakes: candidates restricted to the burst's memory class. */
export function replayCandidates(bank: MemoryBank, burst: Burst): readonly Fragment[] {
  const inClass = bank.fragments.filter((f) => f.cat === burst.cat);
  return inClass.length > 0 ? inClass : bank.fragments;
}
