import { describe, expect, test } from "bun:test";
import { runLif } from "../src/snn.ts";
import type { Frame, TrackProfile } from "../src/types.ts";

function profileWith(frames: Frame[]): TrackProfile {
  return {
    title: "t",
    durationSec: frames.length * 0.023,
    sampleRate: 22050,
    frames,
    bpm: 120,
    loudness: 0.1,
    brightness: 1000,
    dynamism: 0.3,
    tonal: { key: 0, mode: "major", majorness: 0.5 },
    valence: 0.6,
    arousal: 0.5,
    signature: "abc123",
  };
}

function framesOf(rms: number, centroid: number, flux: number): Frame[] {
  return Array.from({ length: 400 }, (_, i) => ({ t: i * 0.023, rms, centroid, flux, zcr: 0.1 }));
}

describe("runLif", () => {
  test("strong drive produces more spikes than silence", () => {
    const silence = runLif(profileWith(framesOf(0, 0, 0)), 42);
    const loud = runLif(profileWith(framesOf(0.3, 3000, 0.1)), 42);
    expect(loud.meanRate).toBeGreaterThan(silence.meanRate);
  });

  test("same seed decodes deterministically", () => {
    const p = profileWith(framesOf(0.2, 2000, 0.05));
    const a = runLif(p, 7);
    const b = runLif(p, 7);
    expect(a.raster).toBe(b.raster);
    expect(a.rates).toEqual(b.rates);
  });

  test("rates stay within [0,1]", () => {
    const s = runLif(profileWith(framesOf(0.9, 9000, 0.9)), 3);
    for (const r of s.rates) {
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
    }
  });
});
