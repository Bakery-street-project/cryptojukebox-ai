import type { Artifacts, SpikeState, TrackProfile } from "../types.ts";
import { bitsToDreamSeed, dreamSeedToBits } from "./seed.ts";
import { localGenerate, signatureSeed } from "./legacy.ts";

export interface DreamOptions {
  dreamSeed?: string;
}

/**
 * Entry point of the dream pipeline. The template mad-lib still produces the
 * texts, so dreamMeta carries placeholders until the mechanism primitives land.
 */
export function runDream(profile: TrackProfile, spike: SpikeState, opts?: DreamOptions): Artifacts {
  const seedBits = opts?.dreamSeed === undefined
    ? signatureSeed(profile, spike)
    : dreamSeedToBits(opts.dreamSeed);
  return {
    ...localGenerate(profile, spike, seedBits),
    dreamMeta: {
      dreamSeed: bitsToDreamSeed(seedBits),
      execIndex: 0,
      recallConfidence: 1,
      nodeCount: 0,
      burstCount: 0,
      residueCount: 0,
    },
  };
}
