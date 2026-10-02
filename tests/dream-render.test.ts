import { describe, expect, test } from "bun:test";
import { dreamState, runDream, signatureSeed } from "../src/dream/engine.ts";
import { DEFAULT_BANK } from "../src/dream/bank.ts";
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
  test("idea, script and prompt only name fragments the dream actually walked", () => {
    const walked = new Set<string>();
    for (const seed of SEEDS) {
      const state = dreamState(profile({}), spike, Number.parseInt(seed, 16), DEFAULT_BANK);
      const arts = runDream(profile({}), spike, { dreamSeed: seed });
      for (const n of state.nodes) walked.add(n.frag.id);
      const visited = new Set(state.nodes.map((n) => n.frag.id));
      const mentioned = DEFAULT_BANK.fragments.filter(
        (f) => !visited.has(f.id) && arts.dream.includes(f.words[0] ?? f.id),
      );
      expect(mentioned.map((f) => f.id)).toEqual([]);
    }
  });

  test("artifacts mention only walked fragments", () => {
    for (const seed of SEEDS) {
      const state = dreamState(profile({}), spike, Number.parseInt(seed, 16), DEFAULT_BANK);
      const arts = runDream(profile({}), spike, { dreamSeed: seed });
      const visited = new Set(state.nodes.map((n) => n.frag.id));
      const texts = `${arts.idea}\n${arts.script}\n${arts.prompt}`;
      const intruders = DEFAULT_BANK.fragments.filter((f) => {
        if (visited.has(f.id)) return false;
        const w = f.words[0] ?? f.id;
        return texts.includes(w);
      });
      expect(intruders.map((f) => f.id)).toEqual([]);
    }
  });
});
