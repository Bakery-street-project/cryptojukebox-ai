import { describe, expect, test } from "bun:test";
import { localGenerate } from "../src/generate.ts";
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

describe("localGenerate", () => {
  test("deterministic for identical decoded state", () => {
    const a = localGenerate(state({}), spike);
    const b = localGenerate(state({}), spike);
    expect(a.dream).toBe(b.dream);
    expect(a.prompt).toBe(b.prompt);
  });

  test("valence flips the imagery register", () => {
    const dark = localGenerate(state({ valence: 0.2 }), spike);
    const bright = localGenerate(state({ valence: 0.9 }), spike);
    expect(dark.dream).not.toBe(bright.dream);
  });

  test("emits every artifact plus sigil", () => {
    const a = localGenerate(state({}), spike);
    for (const key of ["dream", "idea", "script", "prompt", "sigil"] as const) {
      expect(a[key].length).toBeGreaterThan(5);
    }
    expect(a.engine).toBe("local");
  });
});
