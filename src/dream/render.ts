import { clamp01 } from "../dsp.ts";
import type { Fragment } from "./bank.ts";
import type { ExecutiveState } from "./executive.ts";
import type { Fade, WalkNode } from "./types.ts";

/**
 * M7 — the text you wake with is not the dream, it is a reconstruction of it. Each node is
 * marked clear, hazy or gone before it is spoken, and the sentence you get is whatever that
 * fade level allows. The idea/script/prompt are the same scene graph re-recalled in other
 * formats, so they can only name what the dream actually walked.
 */

const TIER_A = ["and then", "so", "after that", "because of that", "which is why"];
const TIER_B = ["close to the floor", "on the other side of it", "in the same breath", "just behind it"];
const TIER_C = ["a minute later, or a year later", "before you got there", "later than it should be", "the previous morning"];
const TIER_D = ["somehow", "without anyone opening it", "the way it always is there", "for no reason anyone would admit"];

const HEDGES = ["you think", "apparently", "if that is the word for it", "as far as you can tell"];
const ACCEPTANCES = [
  ", and nobody finds that strange",
  ", which is normal in there",
  ", and you accept it the way you accept weather",
];

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * The fade marks the fragment phrase, never the whole sentence: what decays is the memory,
 * not the grammar. Action fragments are bare verb phrases, so they take a clause-level mark.
 */
function frame(node: WalkNode, passive: boolean, fade: Fade): string {
  const raw = node.frag.words[0] ?? node.frag.id.replace(/_/g, " ");
  if (node.frag.cat === "action") {
    const w = fade === "clear" ? raw : fade === "hazy" ? `${raw}, or close to it` : `${raw} — you are not sure you did`;
    return passive ? `you are made to ${w}` : `you ${w}`;
  }
  const w =
    fade === "clear" ? raw : fade === "hazy" ? `something like ${raw}` : `${raw}, or what is left of it`;
  switch (node.frag.cat) {
    case "place":
      return passive ? `you are put down in ${w}` : `you keep walking toward ${w}`;
    case "figure":
      return passive ? `${w} decides the next corridor` : `${w} is already there, and knows the room better than you`;
    case "object":
      return passive ? `you are holding ${w}` : `there is ${w} where the switch should be`;
    case "emotion":
      return passive ? `under it all is ${w}` : `you let ${w} in`;
    case "sense":
      return passive ? `you notice ${w}` : `${w} reaches you first`;
    case "scene":
      return passive ? `you are ${w}` : `it is the part where you are ${w}`;
  }
}

/** Fade level per node: how much of it survived being remembered. */
export function recallDecay(nodes: readonly WalkNode[], exec: ExecutiveState, rng: () => number): Fade[] {
  const n = nodes.length;
  return nodes.map((_, i) => {
    const position = n <= 1 ? 0 : i / (n - 1);
    const decay = clamp01(position * 0.75 + (1 - exec.execIndex) * 0.35);
    const roll = rng();
    if (roll < decay * 0.45) return "gone";
    if (roll < decay * 0.75) return "hazy";
    return "clear";
  });
}

export interface DreamRender {
  readonly text: string;
  readonly recallConfidence: number;
  readonly tiersA: number;
}

/** Connector choice is exactly the thing executive function is supposed to supply. */
function connector(rng: () => number, exec: ExecutiveState, forceTierA: boolean): "A" | "B" | "C" | "D" {
  const r = rng();
  return forceTierA ? "A" : r < exec.execIndex * 0.55 ? "A" : r < 0.7 ? "B" : r < 0.86 ? "C" : "D";
}

export function renderDream(
  nodes: readonly WalkNode[],
  fades: readonly Fade[],
  exec: ExecutiveState,
  morphed: readonly string[],
  ending: string,
  rng: () => number,
): DreamRender {
  if (nodes.length === 0) return { text: "", recallConfidence: 0, tiersA: 0 };

  const sentences: string[] = [];
  let tiersA = 0;
  nodes.forEach((node, i) => {
    const passive = rng() < exec.passiveDreamerP;
    const body = frame(node, passive, fades[i] ?? "clear");
    if (i === 0) {
      sentences.push(`${cap(body)}.`);
    } else {
      const forceTierA = tiersA < 2 && i >= nodes.length - 2;
      const tier = connector(rng, exec, forceTierA);
      if (tier === "A") tiersA += 1;
      const pool = tier === "A" ? TIER_A : tier === "B" ? TIER_B : tier === "C" ? TIER_C : TIER_D;
      const phrase = pool[Math.floor(rng() * pool.length) % pool.length]!;
      sentences.push(`${cap(phrase)}, ${body}.`);
    }
    const nodeSlot = sentences.length - 1;

    if (i < morphed.length && morphed[i] !== undefined) {
      sentences.push(`${cap(morphed[i]!)} — a sound the track left in the room, like a word.`);
    }
    if (rng() < exec.acceptanceP) {
      sentences[nodeSlot] = `${sentences[nodeSlot]!.replace(/\.$/, "")}${ACCEPTANCES[Math.floor(rng() * ACCEPTANCES.length) % ACCEPTANCES.length]}.`;
    }
    if (exec.execIndex < 0.4 && rng() < 0.35 && i > 0) {
      const hedge = HEDGES[Math.floor(rng() * HEDGES.length) % HEDGES.length];
      sentences[nodeSlot] = `${sentences[nodeSlot]!.replace(/\.$/, "")} — ${hedge}.`;
    }
  });
  sentences.push(ending);

  let text = sentences.join(" ").replace(/\s+/g, " ").trim();
  while (text.length > 900 && sentences.length > 3) {
    sentences.splice(Math.max(1, sentences.length - 3), 1);
    text = sentences.join(" ").replace(/\s+/g, " ").trim();
  }
  const clear = fades.filter((f) => f === "clear").length;
  return { text, recallConfidence: nodes.length === 0 ? 0 : clear / nodes.length, tiersA };
}

export function fragmentWords(f: Fragment): string {
  return f.words[0] ?? f.id.replace(/_/g, " ");
}
