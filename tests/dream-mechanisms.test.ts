import { describe, expect, test } from "bun:test";
import { mulberry32 } from "../src/dsp.ts";
import { pgoBursts, phospheneLine } from "../src/dream/bursts.ts";
import { chaosOf, executiveState } from "../src/dream/executive.ts";
import { affectiveMatch, replayCandidates, salienceWeights, weightedSample } from "../src/dream/replay.ts";
import { dayResidue, morphResidue } from "../src/dream/residue.ts";
import { assocWalk, walkBudget } from "../src/dream/walk.ts";
import { DEFAULT_BANK, parseBank } from "../src/dream/bank.ts";
import type { FragmentCategory } from "../src/dream/bank.ts";
import type { Burst } from "../src/dream/types.ts";
import type { Frame, SpikeState, TrackProfile } from "../src/types.ts";

const CATEGORIES: FragmentCategory[] = ["place", "figure", "object", "action", "emotion", "sense", "scene"];

function framesOf(fluxes: readonly number[]): Frame[] {
  return fluxes.map((flux, i) => ({ t: i / 30, rms: 0.1, centroid: 1000, flux, zcr: 0.05 }));
}

function profile(over: Partial<TrackProfile>): TrackProfile {
  return {
    title: "test track",
    durationSec: 10,
    sampleRate: 22050,
    frames: framesOf(Array.from({ length: 120 }, (_, i) => (i % 12 === 0 ? 1 : 0.05))),
    bpm: 120,
    loudness: 0.1,
    brightness: 1500,
    dynamism: 0.4,
    tonal: { key: 9, mode: "minor", majorness: 0.2 },
    valence: 0.3,
    arousal: 0.7,
    signature: "deadbeef",
    ...over,
  };
}

const spike: SpikeState = {
  rates: Array.from({ length: 24 }, (_, i) => 0.02 + (i % 5) * 0.01),
  meanRate: 0.04,
  sync: 0.5,
  raster: "▓·░▓",
};

describe("executive state (M3)", () => {
  test("every dial stays inside its anti-salad envelope", () => {
    for (const p of [
      profile({ dynamism: 0, frames: framesOf(Array.from({ length: 60 }, () => 0.1)) }),
      profile({ dynamism: 1 }),
      profile({ frames: framesOf(Array.from({ length: 60 }, (_, i) => (i % 2 ? 0.9 : 0))) }),
    ]) {
      const e = executiveState(p, spike);
      expect(e.execIndex).toBeGreaterThanOrEqual(0.05);
      expect(e.execIndex).toBeLessThanOrEqual(0.95);
      expect(e.remoteEdgeP).toBeLessThanOrEqual(0.5);
      expect(e.hardCutP).toBeLessThanOrEqual(0.45);
      expect(e.teleportCap).toBeLessThanOrEqual(0.18);
      expect(e.tierAConnectors).toBeGreaterThanOrEqual(2);
    }
  });

  test("frame-to-frame chaos lowers executive function", () => {
    const calm = profile({ frames: Array.from({ length: 80 }, (_, i) => ({ ...framesOf([0.1])[0]!, zcr: 0.05, t: i / 30 })), dynamism: 0.1 });
    const wild = profile({
      frames: Array.from({ length: 80 }, (_, i) => ({ ...framesOf([0.1])[0]!, zcr: i % 2 ? 0.9 : 0.01, t: i / 30 })),
      dynamism: 0.1,
    });
    expect(chaosOf(wild)).toBeGreaterThan(chaosOf(calm));
    expect(executiveState(wild, spike).execIndex).toBeLessThan(executiveState(calm, spike).execIndex);
  });
});

describe("PGO bursts (M1)", () => {
  test("count tracks dynamism and every burst names a memory class", () => {
    for (const dynamism of [0, 0.5, 1]) {
      const p = profile({ dynamism });
      const bursts = pgoBursts(p, spike, mulberry32(7));
      expect(bursts.length).toBe(2 + Math.round(dynamism * 4));
      for (const b of bursts) {
        expect(CATEGORIES).toContain(b.cat);
        expect(b.neuron).toBeGreaterThanOrEqual(0);
        expect(b.neuron).toBeLessThan(24);
      }
    }
  });

  test("bursts land on flux peaks and keep their refractory distance", () => {
    const p = profile({ dynamism: 1 });
    const bursts = pgoBursts(p, spike, mulberry32(11));
    expect(bursts.length).toBeGreaterThanOrEqual(2);
    expect(bursts.length).toBeLessThanOrEqual(6);
    for (const b of bursts) expect(b.flux).toBeGreaterThan(0.5);
    const refractory = Math.max(2, Math.floor(p.frames.length / (6 * 2.5)));
    for (let i = 1; i < bursts.length; i++) {
      expect(bursts[i]!.frame - bursts[i - 1]!.frame).toBeGreaterThanOrEqual(refractory);
    }
  });

  test("a too-steady track still dreams", () => {
    const flat = profile({ frames: framesOf(Array.from({ length: 40 }, () => 0.1)) });
    const bursts = pgoBursts(flat, spike, mulberry32(3));
    expect(bursts.length).toBeGreaterThanOrEqual(2);
    for (const b of bursts) {
      expect(b.frame).toBeGreaterThanOrEqual(0);
      expect(b.frame).toBeLessThan(flat.frames.length);
    }
  });

  test("empty frame history does not crash the burst train", () => {
    const bursts = pgoBursts(profile({ frames: [] }), spike, mulberry32(5));
    expect(bursts.length).toBe(4);
    expect(bursts.every((b) => b.flux === 0)).toBe(true);
  });

  test("phosphene strip is one ramp glyph per neuron", () => {
    const line = phospheneLine(spike);
    expect(line.length).toBe(spike.rates.length);
    for (const ch of line) expect(" ·░▒▓█").toContain(ch);
    expect(phospheneLine({ ...spike, rates: [] }).length).toBeGreaterThan(0);
  });
});

describe("replay sampling (M2)", () => {
  const bank = parseBank([
    ["warm", "place", 0.9, 0.9, ["the warm room"], [["cold", 0.4]]],
    ["cold", "place", -0.9, -0.9, ["the cold room"]],
  ]);
  const warm = bank.byId.get("warm")!;
  const cold = bank.byId.get("cold")!;

  test("weights are never zero — the strange intrusion stays reachable", () => {
    const w = salienceWeights(bank.fragments, profile({ valence: 0.95, arousal: 0.95 }), spike, 2.2);
    for (const x of w) expect(x).toBeGreaterThan(0);
  });

  test("selection is biased monotonically toward the track's affect", () => {
    const matched = profile({ valence: 0.95, arousal: 0.95 });
    expect(affectiveMatch(warm, matched)).toBeGreaterThan(affectiveMatch(cold, matched));
    const weights = salienceWeights(bank.fragments, matched, spike, 2.2);
    let warmHits = 0;
    const rng = mulberry32(42);
    for (let i = 0; i < 400; i++) if (weightedSample(bank.fragments, weights, rng)!.id === "warm") warmHits += 1;
    expect(warmHits).toBeGreaterThan(240);
    expect(warmHits).toBeLessThan(400);
  });

  test("a burst only wakes fragments of its own class", () => {
    const burst: Burst = { frame: 0, time: 0, flux: 1, neuron: 0, cat: "place" };
    expect(replayCandidates(DEFAULT_BANK, burst).every((f) => f.cat === "place")).toBe(true);
    const empty = parseBank([["x", "figure", 0, 0]]);
    expect(replayCandidates(empty, burst).length).toBe(1);
  });
});

describe("day residue (M6)", () => {
  test("residue reads the signal, not the name", () => {
    const loud = profile({
      frames: framesOf([3, 2.5, 2, ...Array.from({ length: 40 }, () => 0.05)]).map((f, i) => ({
        ...f,
        zcr: 0.02 + (i % 3) * 0.08,
        centroid: 300 + i * 120,
        rms: 0.05 + (i % 4) * 0.1,
      })),
    });
    const quiet = profile({
      frames: framesOf([0.4, 0.35, 0.3, ...Array.from({ length: 40 }, () => 0.01)]).map((f, i) => ({
        ...f,
        zcr: 0.24 - (i % 3) * 0.07,
        centroid: 4800 - i * 150,
        rms: 0.02,
      })),
    });
    const fromLoud = dayResidue(loud, mulberry32(9));
    const fromQuiet = dayResidue(quiet, mulberry32(9));
    expect(fromLoud).not.toEqual(fromQuiet);
    // the title is not an input: renaming cannot change the residue
    expect(dayResidue({ ...loud, title: "totally different ✦ name" }, mulberry32(9))).toEqual(fromLoud);
    expect(fromLoud.length).toBeGreaterThan(0);
  });

  test("at most two tokens, always lowercase ASCII syllables", () => {
    for (const seed of [1, 2, 3, 7, 11, 42]) {
      const p = profile({
        frames: framesOf(Array.from({ length: 60 }, (_, i) => (i % 7 === 0 ? 1 : 0.05))),
      });
      const res = dayResidue(p, mulberry32(seed));
      expect(res.length).toBeLessThanOrEqual(2);
      for (const w of res) expect(w).toMatch(/^[a-z]{2,8}$/);
    }
  });

  test("no signal, no residue", () => {
    expect(dayResidue(profile({ frames: [] }), mulberry32(1))).toEqual([]);
  });

  test("same decode + same draw, same residue", () => {
    const p = profile({});
    expect(dayResidue(p, mulberry32(5))).toEqual(dayResidue(p, mulberry32(5)));
  });

  test("morphing is deterministic per draw and stays printable", () => {
    const rng = mulberry32(2);
    for (let i = 0; i < 50; i++) {
      const m = morphResidue("shooth", rng);
      expect(m).toMatch(/^[a-z0-9-]+$/);
    }
    expect(morphResidue("shooth", mulberry32(7))).toBe(morphResidue("shooth", mulberry32(7)));
  });
});

describe("associative walk (M4)", () => {
  test("budget tracks dynamism and caps the walk", () => {
    expect(walkBudget(profile({ dynamism: 0 }))).toBe(4);
    expect(walkBudget(profile({ dynamism: 1 }))).toBe(9);
  });

  test("every edge jump follows a real bank edge", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const rng = mulberry32(seed);
      const exec = executiveState(profile({ dynamism: 0.8 }), spike);
      const seeds = [0, 37, 91, 140].map((i) => DEFAULT_BANK.fragments[i % DEFAULT_BANK.fragments.length]!);
      const nodes = assocWalk(DEFAULT_BANK, profile({ dynamism: 0.8 }), spike, seeds, exec, rng);
      expect(nodes.length).toBeLessThanOrEqual(9);
      const ids = new Set(nodes.map((n) => n.frag.id));
      expect(ids.size).toBe(nodes.length);
      for (let i = 1; i < nodes.length; i++) {
        const prev = nodes[i - 1]!;
        const node = nodes[i]!;
        if (node.via === "edge" || node.via === "remote") {
          const edge = prev.frag.edges.find((e) => e.to === node.frag.id);
          expect(edge).toBeDefined();
          expect(edge!.w).toBe(node.edgeW);
          expect(node.via === "remote" ? edge!.w <= 0.25 : edge!.w > 0.25).toBe(true);
        }
      }
    }
  });

  test("teleports stay under their cap", () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const exec = executiveState(profile({}), spike);
      const nodes = assocWalk(
        DEFAULT_BANK,
        profile({}),
        spike,
        [0, 12, 60, 120].map((i) => DEFAULT_BANK.fragments[i]!),
        exec,
        mulberry32(seed),
      );
      const jumps = nodes.length - 1;
      const teleports = nodes.filter((n) => n.via === "teleport").length;
      if (jumps > 0) expect(teleports / jumps).toBeLessThanOrEqual(0.18 + 1e-9);
    }
  });
});
