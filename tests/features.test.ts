import { describe, expect, test } from "bun:test";
import { analyze } from "../src/features.ts";

const SR = 22050;

function sine(freq: number, seconds: number, amp = 0.3): Float32Array {
  const n = Math.floor(SR * seconds);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin((2 * Math.PI * freq * i) / SR);
  return out;
}

function clickTrack(bpm: number, seconds: number): Float32Array {
  const n = Math.floor(SR * seconds);
  const out = new Float32Array(n);
  const period = Math.round((60 / bpm) * SR);
  for (let i = 0; i < n; i += period) {
    for (let k = 0; k < 400 && i + k < n; k++) {
      out[i + k] = Math.exp(-k / 60) * Math.sin(2 * Math.PI * 900 * (k / SR));
    }
  }
  return out;
}

// deterministic white noise (LCG) — aperiodic onset flux, no beat to find
function noise(seconds: number, seed = 1): Float32Array {
  const n = Math.floor(SR * seconds);
  const out = new Float32Array(n);
  let s = seed;
  for (let i = 0; i < n; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    out[i] = (s / 0x100000000) * 2 - 1;
  }
  return out;
}

describe("analyze", () => {
  test("detects spectral centroid near a pure tone", () => {
    const samples = new Float32Array(Math.floor(SR * 2));
    for (let i = 0; i < samples.length; i++) samples[i] = 0.3 * Math.sin((2 * Math.PI * 440 * i) / SR);
    const profile = analyze(samples, SR, "a440");
    expect(profile.frames.length).toBeGreaterThan(30);
    expect(profile.brightness).toBeGreaterThan(380);
    expect(profile.brightness).toBeLessThan(520);
  });

  test("estimates tempo of a click track within 15%", () => {
    const samples = clickTrack(120, 8);
    const profile = analyze(samples, SR, "clicks");
    expect(profile.bpm).toBeGreaterThan(102);
    expect(profile.bpm).toBeLessThan(138);
  });

  test("louder input raises loudness and arousal", () => {
    const quiet = analyze(sine(300, 3, 0.02), SR, "quiet");
    const loud = analyze(sine(300, 3, 0.4), SR, "loud");
    expect(loud.loudness).toBeGreaterThan(quiet.loudness);
  });

  test("signature is stable and title-sensitive", () => {
    const a = analyze(sine(300, 2), SR, "one");
    const b = analyze(sine(300, 2), SR, "one");
    const c = analyze(sine(300, 2), SR, "two");
    expect(a.signature).toBe(b.signature);
    expect(a.signature).not.toBe(c.signature);
  });

  test("bpmConfidence is a finite fraction for measured signals", () => {
    for (const samples of [clickTrack(120, 8), sine(440, 4), noise(8)]) {
      const c = analyze(samples, SR, "x").bpmConfidence;
      expect(Number.isFinite(c)).toBe(true);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
    }
  });

  test("a periodic click track out-confidences aperiodic noise", () => {
    const clicks = analyze(clickTrack(120, 8), SR, "clicks").bpmConfidence;
    const hiss = analyze(noise(8), SR, "hiss").bpmConfidence;
    expect(clicks).toBeGreaterThan(hiss);
    expect(clicks).toBeGreaterThan(0.5);
    expect(hiss).toBeLessThan(0.5);
  });

  test("bpmConfidence is deterministic for identical samples", () => {
    const samples = clickTrack(100, 6);
    expect(analyze(samples, SR, "x").bpmConfidence).toBe(analyze(samples, SR, "x").bpmConfidence);
  });
});
