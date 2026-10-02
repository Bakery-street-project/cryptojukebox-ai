import { clamp01 } from "../dsp.ts";
import type { SpikeState, TrackProfile } from "../types.ts";
import type { TensionPoint, WalkNode } from "./types.ts";

/**
 * M5 — threat simulation and the overnight regulation of emotion. The dream runs the
 * negative material at a lowered arousal and, if the day's material actually resolves,
 * ends the sequence calmer than it began. Resolution here is measured, not asserted:
 * how much energy the track leaves on the floor at its end versus its middle.
 */

/** 0 = the track dissipates or cuts out; 1 = it ends on its own peak. */
export function resolutionOf(profile: TrackProfile): number {
  const frames = profile.frames;
  if (frames.length < 8) return 0.5;
  const mid = Math.floor(frames.length / 2);
  const tail = Math.max(1, Math.floor(frames.length * 0.1));
  const rms = (from: number, to: number): number => {
    let s = 0;
    for (let i = from; i < to; i++) s += frames[i]!.rms;
    return s / (to - from);
  };
  const body = rms(0, mid);
  const end = rms(frames.length - tail, frames.length);
  const decline = body > 1e-6 ? clamp01(1 - end / body) : 1;
  return clamp01(1 - decline);
}

export function tensionArc(nodes: readonly WalkNode[], profile: TrackProfile, spike: SpikeState): TensionPoint[] {
  const resolution = resolutionOf(profile);
  const n = Math.max(1, nodes.length);
  const peakAt = 0.35 + (1 - resolution) * 0.45;
  return nodes.map((node, i) => {
    const position = i / (n - 1 || 1);
    // Arousal of the awakened fragment plus the track's own drive, shaped by the position.
    const base = (node.frag.a + 1) / 2;
    const envelope = position <= peakAt ? position / peakAt : 1 - (position - peakAt) / (1 - peakAt);
    const held = resolution < 0.5 ? 1 : 1 - (1 - resolution) * 2 * (1 - envelope);
    const tension = clamp01(0.45 * base + 0.35 * profile.arousal * envelope + 0.2 * spike.sync * held);
    return { node: i, tension };
  });
}

/** What the last sentence should feel like, given how the track actually ended. */
export function endingRegister(arc: readonly TensionPoint[], resolution: number): "settled" | "open" | "cut" {
  const last = arc[arc.length - 1]?.tension ?? 0.5;
  if (resolution >= 0.62 && last < 0.5) return "settled";
  if (resolution <= 0.34) return "cut";
  return "open";
}
