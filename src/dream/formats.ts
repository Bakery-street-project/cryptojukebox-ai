import type { SpikeState, TrackProfile } from "../types.ts";
import type { Fragment } from "./bank.ts";
import type { WalkNode } from "./types.ts";
import { fragmentWords } from "./render.ts";

/**
 * M7 again, in the other direction: the idea, the script and the prompt are the same walked
 * scene recalled in three formats with different amounts of decay. They are not extra
 * generators — a fragment the dream did not visit cannot appear here.
 */

/** Pitch-class names, shared with the LLM re-brief in generate.ts. */
export const NOTE_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];

function pickByCat(nodes: readonly WalkNode[], cat: Fragment["cat"]): Fragment | null {
  for (const n of nodes) if (n.frag.cat === cat) return n.frag;
  return null;
}

function listOf(nodes: readonly WalkNode[], cat: Fragment["cat"]): Fragment[] {
  return nodes.filter((n) => n.frag.cat === cat).map((n) => n.frag);
}

export function renderIdea(nodes: readonly WalkNode[], profile: TrackProfile, residues: readonly string[]): string {
  const place = pickByCat(nodes, "place");
  const figure = pickByCat(nodes, "figure");
  const object = pickByCat(nodes, "object");
  const action = pickByCat(nodes, "action");
  const sense = pickByCat(nodes, "sense");
  const bpm = Math.round(profile.bpm) || 96;
  const parts = [
    place ? `Build ${fragmentWords(place)} as a walkable room, one loop of the track per pass` : "Build a walkable room, one loop of the track per pass",
    action ? `, ${fragmentWords(action)} on the downbeat` : "",
    figure ? `, ${fragmentWords(figure)} as the only interface` : "",
    sense ? `, ${fragmentWords(sense)} as the feedback channel` : "",
    object ? `. Nothing explains ${fragmentWords(object)}` : ". Nothing explains the missing part",
    ` at ${bpm} BPM.`,
  ];
  if (residues.length > 0) parts.push(` Label it ${residues.map((r) => `"${r}"`).join(" and ")}.`);
  return parts.join("").replace(/\s+/g, " ").trim();
}

const THIRD: Record<string, string> = { are: "is", have: "has", do: "does", go: "goes" };

/** Script lines put the figure in third person; bank actions are authored as bare verb phrases. */
function thirdPerson(phrase: string): string {
  const space = phrase.indexOf(" ");
  const head = (space === -1 ? phrase : phrase.slice(0, space)).toLowerCase();
  const tail = space === -1 ? "" : phrase.slice(space);
  const form =
    THIRD[head] ?? (/([sxz]|ch|sh)$/.test(head) ? `${head}es` : /[^aeiou]y$/.test(head) ? `${head.slice(0, -1)}ies` : `${head}s`);
  return `${form}${tail}`;
}

export function renderScript(nodes: readonly WalkNode[], profile: TrackProfile): string {
  const bpm = Math.round(profile.bpm) || 96;
  const places = listOf(nodes, "place");
  const figures = listOf(nodes, "figure");
  const objects = listOf(nodes, "object");
  const actions = listOf(nodes, "action");
  const emotions = listOf(nodes, "emotion");
  const scenes = listOf(nodes, "scene");
  const word = (arr: Fragment[], i: number): string | undefined => {
    const f = arr[i % Math.max(1, arr.length)];
    return f ? fragmentWords(f) : undefined;
  };
  const action0 = word(actions, 0);
  const fallbackScene = scenes[0] ? capWord(fragmentWords(scenes[0])) : "The room holds one object nobody brought";
  const lines = [
    `INT. ${word(places, 0) ?? "a room with one door too many"} — NIGHT`,
    `${fallbackScene}. The sound is steady.`,
    `${capWord(word(figures, 0) ?? "a figure without a name")} ${action0 ? thirdPerson(action0) : "waits"}. CUT IN on ${word(objects, 1) ?? word(objects, 0) ?? "the switch"}.`,
    "VOICE (V.O.)",
    `    Under this scene: ${word(emotions, 0) ?? "something you did not bring up"}. ${bpm} BPM, no note of it.`,
    `${capWord(word(emotions, 1) ?? word(emotions, 0) ?? "the same feeling")} answers. CUT TO BLACK.`,
  ];
  return lines.join("\n");
}

export function renderPrompt(nodes: readonly WalkNode[], profile: TrackProfile, spike: SpikeState): string {
  const bpm = Math.round(profile.bpm) || 96;
  const places = listOf(nodes, "place").slice(0, 2).map(fragmentWords);
  const objects = listOf(nodes, "object").slice(0, 3).map(fragmentWords);
  const senses = listOf(nodes, "sense").slice(0, 2).map(fragmentWords);
  const figures = listOf(nodes, "figure").slice(0, 1).map(fragmentWords);
  const key = NOTE_NAMES[profile.tonal.key % 12];
  const tone = profile.valence >= 0.5 ? "luminous, high-key" : "chthonic, low-key";
  return [
    `surreal ${tone} visualization`,
    places.length ? `set in ${places.join(" and ")}` : "",
    objects.length ? `with ${objects.join(", ")} in the foreground` : "",
    figures.length ? `and ${figures.join(", ")} not looking at the camera` : "",
    senses.length ? `lit by ${senses.join(", ")}` : "",
    `tempo-locked ${bpm} BPM motion, ${key} ${profile.tonal.mode} colour temperature`,
    `neural raster texture at ${Math.round(spike.meanRate * 100)}% neuron duty cycle, ${Math.round(spike.sync * 100)}% synchrony, 16:9, highly detailed`,
  ]
    .filter(Boolean)
    .join(", ");
}

function capWord(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
