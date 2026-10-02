import { describe, expect, test } from "bun:test";
import { dreamState, runDream, signatureSeed } from "../src/dream/engine.ts";
import { DEFAULT_BANK, type Fragment } from "../src/dream/bank.ts";
import type { SpikeState, TrackProfile } from "../src/types.ts";

const spike: SpikeState = {
  rates: Array.from({ length: 24 }, (_, i) => 0.02 + (i % 5) * 0.01),
  meanRate: 0.04,
  sync: 0.5,
  raster: "▓·░▓·▓",
};

function profile(over: Partial<TrackProfile>): TrackProfile {
  return {
    title: "test track",
    durationSec: 10,
    sampleRate: 22050,
    frames: Array.from({ length: 120 }, (_, i) => ({
      t: i / 30,
      rms: 0.1 + (i % 7) * 0.01,
      centroid: 1000,
      flux: i % 20 === 0 ? 1 : 0.05,
      zcr: 0.05 + (i % 3) * 0.02,
    })),
    bpm: 120,
    loudness: 0.1,
    brightness: 1500,
    dynamism: 0.6,
    tonal: { key: 9, mode: "minor", majorness: 0.2 },
    valence: 0.3,
    arousal: 0.7,
    signature: "deadbeef",
    ...over,
  };
}

const SEEDS = ["00000001", "00000002", "00000003", "cafe0000", "dddd1111", "beef5555", "0123abcd", "7777aaaa"];

/** 30 deterministic pseudo-random seeds — turns containment from seed-luck into a corpus invariant. */
const SWEEP_SEEDS = Array.from({ length: 30 }, (_, i) =>
  ((i + 1) * 2654435761)
    .toString(16)
    .padStart(8, "0")
    .slice(-8),
);

function phraseOf(f: Fragment): string {
  return f.words[0] ?? f.id;
}

/** Word-boundary phrase match — "hum" must not fire on "hums". */
function mentionsPhrase(text: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`).test(text);
}

/**
 * Unvisited fragments whose own phrase is named in `text` — minus those whose
 * phrase only appears nested inside a visited fragment's phrase (the container
 * legitimately embeds it; the dream did not invent a new memory).
 */
function findIntruders(text: string, visitedFrags: readonly Fragment[]): string[] {
  const visited = new Set(visitedFrags.map((f) => f.id));
  return DEFAULT_BANK.fragments
    .filter((f) => !visited.has(f.id))
    .filter((f) => mentionsPhrase(text, phraseOf(f)))
    .filter((f) => !visitedFrags.some((vf) => phraseOf(vf).includes(phraseOf(f))))
    .map((f) => f.id);
}

describe("dream render (M7) floors", () => {
  test("anti-salad caps hold across seeds", () => {
    for (const seed of SEEDS) {
      const s = dreamState(profile({}), spike, Number.parseInt(seed, 16), DEFAULT_BANK);
      expect(s.nodes.length).toBeLessThanOrEqual(9);
      expect(s.text.length).toBeLessThanOrEqual(900);
      expect(s.tiersA).toBeGreaterThanOrEqual(2);
      expect(s.recallConfidence).toBeGreaterThanOrEqual(0);
      expect(s.recallConfidence).toBeLessThanOrEqual(1);
      expect(s.text.charAt(0)).toBe(s.text.charAt(0)!.toUpperCase());
      expect(s.text.endsWith(".")).toBe(true);
    }
  });

  test("every sentence in the dream starts capitalised and the walk reads as sentences", () => {
    const s = dreamState(profile({}), spike, Number.parseInt("00000003", 16), DEFAULT_BANK);
    for (const sentence of s.text.split(/(?<=\.)\s+/)) {
      if (sentence.length === 0) continue;
      expect(sentence.charAt(0)).toBe(sentence.charAt(0)!.toUpperCase());
    }
  });

  test("unseeded runs fall back on the track signature", () => {
    const p = profile({});
    const a = runDream(p, spike);
    expect(a.dreamMeta.dreamSeed).toBe(
      dreamState(p, spike, signatureSeed(p, spike), DEFAULT_BANK).dreamSeed,
    );
  });
});

describe("cross-artifact containment", () => {
  test("word-boundary match rejects substring false positives", () => {
    expect(mentionsPhrase("the sergeant who hums a tune", "hum")).toBe(false);
    expect(mentionsPhrase("you hum under your breath", "hum")).toBe(true);
    expect(mentionsPhrase("visited the wet cavern once", "a wet cavern")).toBe(false);
  });

  test("nesting exemption spares a phrase only spoken inside its visited container", () => {
    const container = DEFAULT_BANK.byId.get("wedding_in_undercroft")!;
    expect(phraseOf(container)).toContain("the undercroft");
    const text = `A wedding in the undercroft went on. ${container.words[0]}`;
    const visited = [container];
    const undercroft = DEFAULT_BANK.byId.get("undercroft")!;
    expect(findIntruders(text, visited)).not.toContain(undercroft.id);
    // without the container visited, naming it IS an intruder
    expect(findIntruders(text, [])).toContain(undercroft.id);
  });

  test("dream text only names fragments the dream actually walked", () => {
    for (const seed of SEEDS) {
      const state = dreamState(profile({}), spike, Number.parseInt(seed, 16), DEFAULT_BANK);
      const arts = runDream(profile({}), spike, { dreamSeed: seed });
      expect(findIntruders(arts.dream, state.nodes.map((n) => n.frag))).toEqual([]);
    }
  });

  test("artifacts mention only walked fragments", () => {
    for (const seed of SEEDS) {
      const state = dreamState(profile({}), spike, Number.parseInt(seed, 16), DEFAULT_BANK);
      const arts = runDream(profile({}), spike, { dreamSeed: seed });
      const texts = `${arts.idea}\n${arts.script}\n${arts.prompt}`;
      expect(findIntruders(texts, state.nodes.map((n) => n.frag))).toEqual([]);
    }
  });

  test("30-seed sweep holds containment as a corpus invariant", () => {
    for (const seed of SWEEP_SEEDS) {
      const state = dreamState(profile({}), spike, Number.parseInt(seed, 16), DEFAULT_BANK);
      const arts = runDream(profile({}), spike, { dreamSeed: seed });
      const frags = state.nodes.map((n) => n.frag);
      expect(findIntruders(arts.dream, frags)).toEqual([]);
      expect(findIntruders(`${arts.idea}\n${arts.script}\n${arts.prompt}`, frags)).toEqual([]);
    }
  });
});
