import type { Fragment, FragmentCategory } from "./bank.ts";
import type { ExecutiveState } from "./executive.ts";

/** M1 — one phasic activation event: uncontrollable, timed by the track's own spectral flux. */
export interface Burst {
  readonly frame: number;
  readonly time: number;
  readonly flux: number;
  /** The SNN neuron whose firing rate won the draw for this burst. */
  readonly neuron: number;
  /** Which kind of memory the burst wakes. */
  readonly cat: FragmentCategory;
}

export type JumpKind = "seed" | "edge" | "remote" | "teleport";

/** One visited memory in the associative walk (M4). */
export interface WalkNode {
  readonly frag: Fragment;
  readonly via: JumpKind;
  readonly edgeW: number;
  readonly burst: number;
}

/** M7 — how much of the scene survived consolidation decay. */
export type Fade = "clear" | "hazy" | "gone";

export interface TensionPoint {
  readonly node: number;
  readonly tension: number;
}

/** The full decoded dream state: every number in the rendered text traces back to a measurement here. */
export interface DreamState {
  readonly dreamSeed: string;
  readonly bursts: readonly Burst[];
  readonly exec: ExecutiveState;
  readonly nodes: readonly WalkNode[];
  readonly fades: readonly Fade[];
  readonly arc: readonly TensionPoint[];
  readonly residues: readonly string[];
  readonly phosphene: string;
  readonly recallConfidence: number;
  readonly text: string;
  readonly tiersA: number;
}
