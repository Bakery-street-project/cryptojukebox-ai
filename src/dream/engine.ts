import { fnv1a, mulberry32 } from "../dsp.ts";
import type { Artifacts, SpikeState, TrackProfile } from "../types.ts";
import { DEFAULT_BANK, type MemoryBank } from "./bank.ts";
import { pgoBursts, phospheneLine } from "./bursts.ts";
import { executiveState } from "./executive.ts";
import { renderIdea, renderPrompt, renderScript } from "./formats.ts";
import { dayResidue, morphResidue } from "./residue.ts";
import { fragmentWords, recallDecay, renderDream } from "./render.ts";
import { replayCandidates, salienceWeights, weightedSample } from "./replay.ts";
import { bitsToDreamSeed, dreamSeedToBits } from "./seed.ts";
import { assocWalk } from "./walk.ts";
import { endingRegister, resolutionOf, tensionArc } from "./arc.ts";
import type { DreamState, WalkNode } from "./types.ts";

export interface DreamOptions {
  dreamSeed?: string;
  bank?: MemoryBank;
}

/**
 * One rng stream per stage: changing an earlier stage's draw count must not silently
 * reshuffle the burst history of a dream somebody already recalled by seed.
 */
function stream(seedBits: number, stage: string): () => number {
  return mulberry32((seedBits ^ fnv1a(stage)) >>> 0);
}

function endingPhrase(node: WalkNode): string {
  const w = fragmentWords(node.frag);
  return node.frag.cat === "action" ? `the part where you ${w}` : w;
}

function endingLine(nodes: readonly WalkNode[], register: "settled" | "open" | "cut"): string {
  const last = nodes[nodes.length - 1];
  const what = last ? endingPhrase(last) : "the last room";
  switch (register) {
    case "settled":
      return `You come out of it level, at ${what}, and the level of it surprises you.`;
    case "open":
      return `The room keeps ${what} going after you stop being in it.`;
    case "cut":
      return `Cut — ${what}, then the track is over and you are holding nothing.`;
  }
}

export function signatureSeed(profile: TrackProfile, spike: SpikeState): number {
  return fnv1a(`${profile.signature}|${spike.meanRate.toFixed(5)}|${spike.sync.toFixed(5)}`);
}

export function dreamState(profile: TrackProfile, spike: SpikeState, seedBits: number, bank: MemoryBank): DreamState {
  const exec = executiveState(profile, spike);
  const bursts = pgoBursts(profile, spike, stream(seedBits, "bursts"));
  const replayRng = stream(seedBits, "replay");
  const seeds = bursts.map((burst) => {
    const pool = replayCandidates(bank, burst);
    return weightedSample(pool, salienceWeights(pool, profile, spike, 2.2), replayRng);
  });
  const nodes = assocWalk(bank, profile, spike, seeds, exec, stream(seedBits, "walk"));
  const arc = tensionArc(nodes, profile, spike);
  const residueRng = stream(seedBits, "residue");
  const residues = dayResidue(profile.title, residueRng);
  const morphed = residues.map((r) => morphResidue(r, residueRng));
  const renderRng = stream(seedBits, "render");
  const fades = recallDecay(nodes, exec, renderRng);
  const ending = endingLine(nodes, endingRegister(arc, resolutionOf(profile)));
  const rendered = renderDream(nodes, fades, exec, morphed, ending, renderRng);

  return {
    dreamSeed: bitsToDreamSeed(seedBits),
    bursts,
    exec,
    nodes,
    fades,
    arc,
    residues: morphed,
    phosphene: phospheneLine(spike),
    recallConfidence: rendered.recallConfidence,
    text: rendered.text,
    tiersA: rendered.tiersA,
  };
}

export function runDream(profile: TrackProfile, spike: SpikeState, opts?: DreamOptions): Artifacts {
  const bank = opts?.bank ?? DEFAULT_BANK;
  const seedBits = opts?.dreamSeed === undefined ? signatureSeed(profile, spike) : dreamSeedToBits(opts.dreamSeed);
  const state = dreamState(profile, spike, seedBits, bank);

  return {
    dream: state.text,
    idea: renderIdea(state.nodes, profile, state.residues),
    script: renderScript(state.nodes, profile),
    prompt: renderPrompt(state.nodes, profile, spike),
    sigil: spike.raster,
    engine: "local",
    dreamMeta: {
      dreamSeed: state.dreamSeed,
      execIndex: state.exec.execIndex,
      recallConfidence: state.recallConfidence,
      nodeCount: state.nodes.length,
      burstCount: state.bursts.length,
      residueCount: state.residues.length,
      phosphene: state.phosphene,
    },
  };
}
