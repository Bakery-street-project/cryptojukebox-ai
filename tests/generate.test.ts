import { describe, expect, test } from "bun:test";
import { runDream } from "../src/dream/engine.ts";
import { bitsToDreamSeed, dreamSeedToBits } from "../src/dream/seed.ts";
import type { SpikeState, TrackProfile } from "../src/types.ts";

function state(over: Partial<TrackProfile>): TrackProfile {
  return {
    title: "test track",
    durationSec: 10,
    sampleRate: 22050,
    frames: [],
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

const spike: SpikeState = { rates: [0.1], meanRate: 0.12, sync: 0.4, raster: "▓··▓·▓··▓·▓··▓" };

describe("runDream", () => {
  test("unseeded runs are stable for identical decoded state", () => {
    expect(runDream(state({}), spike).dream).toBe(runDream(state({}), spike).dream);
  });

  test("recalling the emitted seed replays the byte-identical dream", () => {
    const first = runDream(state({}), spike);
    const replay = runDream(state({}), spike, { dreamSeed: first.dreamMeta.dreamSeed });
    expect(replay.dream).toBe(first.dream);
    expect(replay.dreamMeta.dreamSeed).toBe(first.dreamMeta.dreamSeed);
  });

  test("different seeds dream differently", () => {
    const a = runDream(state({}), spike, { dreamSeed: "00000001" });
    const b = runDream(state({}), spike, { dreamSeed: "00000002" });
    expect(a.dream).not.toBe(b.dream);
  });

  test("seed bits round-trip through the canonical hex form", () => {
    for (const bits of [0, 1, 0xdeadbeef, 0xffffffff]) {
      expect(dreamSeedToBits(bitsToDreamSeed(bits))).toBe(bits);
    }
  });

  test("valence flips the imagery register", () => {
    expect(runDream(state({ valence: 0.2 }), spike).dream).not.toBe(runDream(state({ valence: 0.9 }), spike).dream);
  });

  test("emits every artifact plus sigil and dream meta", () => {
    const a = runDream(state({}), spike);
    for (const key of ["dream", "idea", "script", "prompt", "sigil"] as const) {
      expect(a[key].length).toBeGreaterThan(5);
    }
    expect(a.engine).toBe("local");
    expect(a.dreamMeta.dreamSeed).toMatch(/^[0-9a-f]{8}$/);
  });
});
