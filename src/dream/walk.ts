import type { Fragment, MemoryBank } from "./bank.ts";
import type { ExecutiveState } from "./executive.ts";
import type { SpikeState, TrackProfile } from "../types.ts";
import { affectiveMatch, salienceWeights, weightedSample } from "./replay.ts";
import type { WalkNode } from "./types.ts";

/**
 * M4 — hyperpriming. Association strength in a dream decays slowly with semantic distance,
 * so remote links that waking thought would reject are live here. The walk follows normal
 * edges most of the time, deliberately takes weak/remote ones at a rate set by executive
 * state, and is allowed a small, capped number of outright teleports (the hard cut).
 */

export function walkBudget(profile: TrackProfile): number {
  return 4 + Math.round(Math.min(1, Math.max(0, profile.dynamism)) * 5);
}

function chooseEdge(
  bank: MemoryBank,
  from: Fragment,
  visited: ReadonlySet<string>,
  profile: TrackProfile,
  wantRemote: boolean,
  rng: () => number,
): { frag: Fragment; w: number } | null {
  const pool = from.edges.filter((e) => {
    const target = bank.byId.get(e.to);
    return target !== undefined && !visited.has(target.id) && (wantRemote ? e.w <= 0.25 : e.w > 0.25);
  });
  if (pool.length === 0) return null;
  const weights = pool.map((e) => {
    const frag = bank.byId.get(e.to)!;
    return e.w * (0.6 + affectiveMatch(frag, profile));
  });
  const hit = weightedSample(pool, weights, rng);
  return { frag: bank.byId.get(hit.to)!, w: hit.w };
}

function freshFragment(
  bank: MemoryBank,
  profile: TrackProfile,
  spike: SpikeState,
  visited: ReadonlySet<string>,
  rng: () => number,
): Fragment {
  const pool = bank.fragments.filter((f) => !visited.has(f.id));
  const candidates = pool.length > 0 ? pool : bank.fragments;
  return weightedSample(candidates, salienceWeights(candidates, profile, spike, 2.2), rng);
}

/**
 * `seeds` are the fragments each PGO burst woke. The walk binds them into one trajectory:
 * edges first, remote edges when executive control is low, then a burst seed as the hard cut.
 */
export function assocWalk(
  bank: MemoryBank,
  profile: TrackProfile,
  spike: SpikeState,
  seeds: readonly Fragment[],
  exec: ExecutiveState,
  rng: () => number,
): WalkNode[] {
  if (seeds.length === 0) return [];
  const budget = walkBudget(profile);
  const maxTeleports = Math.floor(exec.teleportCap * budget);
  const visited = new Set<string>();
  const nodes: WalkNode[] = [];

  let current = seeds[0]!;
  visited.add(current.id);
  nodes.push({ frag: current, via: "seed", edgeW: 0, burst: 0 });

  let seedCursor = 1;
  let teleports = 0;
  while (nodes.length < budget) {
    const wantRemote = rng() < exec.remoteEdgeP;
    const step = chooseEdge(bank, current, visited, profile, wantRemote, rng) ??
      (wantRemote ? chooseEdge(bank, current, visited, profile, false, rng) : null);

    const cutToBurst = rng() < exec.hardCutP && seedCursor < seeds.length && teleports < maxTeleports;
    if (step && !cutToBurst) {
      current = step.frag;
      nodes.push({ frag: current, via: step.w <= 0.25 ? "remote" : "edge", edgeW: step.w, burst: nodes[nodes.length - 1]!.burst });
    } else if (cutToBurst) {
      const next = seeds[seedCursor++]!;
      if (visited.has(next.id)) continue;
      current = next;
      teleports += 1;
      nodes.push({ frag: current, via: "teleport", edgeW: 0, burst: seedCursor - 1 });
    } else if (seedCursor < seeds.length && teleports < maxTeleports) {
      const next = seeds[seedCursor++]!;
      if (visited.has(next.id)) continue;
      current = next;
      teleports += 1;
      nodes.push({ frag: current, via: "teleport", edgeW: 0, burst: seedCursor - 1 });
    } else if (teleports < maxTeleports) {
      current = freshFragment(bank, profile, spike, visited, rng);
      teleports += 1;
      nodes.push({ frag: current, via: "teleport", edgeW: 0, burst: nodes[nodes.length - 1]!.burst });
    } else {
      // Out of budget for unannounced jumps: the walk stops rather than breaking the cap.
      break;
    }
    visited.add(current.id);
  }
  return nodes;
}
