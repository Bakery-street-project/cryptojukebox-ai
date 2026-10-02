import { describe, expect, test } from "bun:test";
import { mulberry32 } from "../src/dsp.ts";
import { executiveState } from "../src/dream/executive.ts";
import { assocWalk } from "../src/dream/walk.ts";
import { runDream } from "../src/dream/engine.ts";
import { DEFAULT_BANK } from "../src/dream/bank.ts";
import type { Frame, SpikeState, TrackProfile } from "../src/types.ts";

const spike: SpikeState = {
  rates: Array.from({ length: 24 }, (_, i) => 0.02 + (i % 5) * 0.01),
  meanRate: 0.04,
  sync: 0.5,
  raster: "▓·░▓",
};

function frames(n: number, zcrAt: (i: number) => number): Frame[] {
  return Array.from({ length: n }, (_, i) => ({
    t: i / 30,
    rms: 0.1,
    centroid: 1000,
    flux: i % 12 === 0 ? 1 : 0.05,
    zcr: zcrAt(i),
  }));
}

function profile(over: Partial<TrackProfile>): TrackProfile {
  return {
    title: "statistical suite",
    durationSec: 10,
    sampleRate: 22050,
    frames: frames(120, () => 0.05),
    bpm: 120,
    loudness: 0.1,
    brightness: 1500,
    dynamism: 0.2,
    tonal: { key: 9, mode: "minor", majorness: 0.2 },
    valence: 0.3,
    arousal: 0.7,
    signature: "deadbeef",
    ...over,
  };
}

const calm = profile({});
const wild = profile({ dynamism: 0.95, frames: frames(120, (i) => (i % 2 ? 0.9 : 0.01)) });

function remoteJumpRate(p: TrackProfile, trials: number): number {
  let remote = 0;
  let jumps = 0;
  for (let t = 0; t < trials; t++) {
    const exec = executiveState(p, spike);
    const seeds = [0, 37, 91, 140, 200].map((i) => DEFAULT_BANK.fragments[i % DEFAULT_BANK.fragments.length]!);
    const nodes = assocWalk(DEFAULT_BANK, p, spike, seeds, exec, mulberry32(1000 + t));
    for (let i = 1; i < nodes.length; i++) {
      jumps += 1;
      if (nodes[i]!.via === "remote") remote += 1;
    }
  }
  return jumps === 0 ? 0 : remote / jumps;
}

describe("statistical suite (plan phase 8)", () => {
  test("remote-association rate rises as executive function collapses", () => {
    const calmRate = remoteJumpRate(calm, 40);
    const wildRate = remoteJumpRate(wild, 40);
    expect(executiveState(wild, spike).execIndex).toBeLessThan(executiveState(calm, spike).execIndex);
    expect(wildRate).toBeGreaterThan(calmRate);
  });

  test("distinct seeds produce distinct dreams", () => {
    const texts = new Set<string>();
    for (let i = 1; i <= 20; i++) {
      const seed = i.toString(16).padStart(8, "0");
      texts.add(runDream(calm, spike, { dreamSeed: seed }).dream);
    }
    expect(texts.size).toBeGreaterThanOrEqual(19);
  });

  test("aggregate recall confidence sits strictly between total amnesia and perfect recall", () => {
    let sum = 0;
    for (let i = 1; i <= 20; i++) {
      sum += runDream(calm, spike, { dreamSeed: i.toString(16).padStart(8, "0") }).dreamMeta.recallConfidence;
    }
    const mean = sum / 20;
    expect(mean).toBeGreaterThan(0.1);
    expect(mean).toBeLessThan(0.95);
  });
});
