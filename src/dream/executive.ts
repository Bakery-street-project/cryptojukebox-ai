import { clamp01 } from "../dsp.ts";
import type { SpikeState, TrackProfile } from "../types.ts";

/**
 * M3 — the neuromodulator collapse. During REM the noradrenergic and serotonergic drive
 * drops away and prefrontal executive control goes with it, which is why the dreamer
 * accepts absurdity, loses the sense of being the one acting, and does not notice the cuts.
 * execIndex is the engine's single dial for that lost control: low = the narrative
 * machinery stops policing itself.
 */
export interface ExecutiveState {
  /** 0.05…0.95, measured proxy for remaining executive function. */
  readonly execIndex: number;
  /** Chance of following a weak, remote association instead of a sensible one (M4). */
  readonly remoteEdgeP: number;
  /** Chance of an unannounced scene shift. */
  readonly hardCutP: number;
  /** Chance a sentence is written as something happening *to* the dreamer. */
  readonly passiveDreamerP: number;
  /** Chance of an acceptance move ("and that was ordinary here"). */
  readonly acceptanceP: number;
  /** Chance the next node continues the current scene rather than leaving it. */
  readonly sceneContinueP: number;
  /** How many Tier-A (logical) connectors the renderer must plant. */
  readonly tierAConnectors: number;
  /** Fraction of jumps that may be teleports, capped well below the chaos of a seizure. */
  readonly teleportCap: number;
}

/** Spectral chaos: how unsettled the frame-to-frame texture is (zcr spread + flux). */
export function chaosOf(profile: TrackProfile): number {
  const frames = profile.frames;
  if (frames.length < 2) return clamp01(profile.dynamism);
  let sum = 0;
  let sumSq = 0;
  for (const f of frames) {
    sum += f.zcr;
    sumSq += f.zcr * f.zcr;
  }
  const n = frames.length;
  const mean = sum / n;
  const std = Math.sqrt(Math.max(0, sumSq / n - mean * mean));
  return clamp01(std * 3.2 + profile.dynamism * 0.35);
}

export function executiveState(profile: TrackProfile, spike: SpikeState): ExecutiveState {
  const chaos = chaosOf(profile);
  const execIndex = clamp01(0.78 - chaos * 0.7 + spike.sync * 0.12);
  const e = Math.min(0.95, Math.max(0.05, execIndex));
  const wild = 1 - e;
  return {
    execIndex: e,
    remoteEdgeP: Math.min(0.5, Math.max(0.05, wild * 0.62)),
    hardCutP: Math.min(0.45, Math.max(0.03, wild * 0.5)),
    passiveDreamerP: Math.min(0.8, Math.max(0.05, wild * 0.85)),
    acceptanceP: Math.min(0.6, Math.max(0.02, wild * 0.66)),
    sceneContinueP: Math.min(0.9, Math.max(0.1, e * 0.8 + 0.1)),
    tierAConnectors: e >= 0.6 ? 3 : 2,
    teleportCap: Math.min(0.18, wild * 0.2),
  };
}
