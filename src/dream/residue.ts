import type { TrackProfile } from "../types.ts";

/**
 * M6 — day residue. The dream never sees the track's metadata: what leaks in
 * is what the signal itself left in the auditory cortex while the track
 * played. The loudest transients of the decode are folded into pronounceable
 * half-words — zero-crossing rate picks the onset consonant, spectral
 * centroid picks the vowel, transient strength may leave a stopped coda.
 * Same signal + same draw ⇒ same word; nothing about title, artist or tags
 * can reach the prose.
 */

/** Sorted soft→hard: low zero-crossing (voiced, breathy) first. */
const ONSETS = ["m", "n", "l", "w", "v", "h", "f", "th", "sh", "s", "b", "d", "g", "p", "t", "k", "br", "tr", "dr", "gl", "sm", "sk", "st", "kr"];
/** Sorted dark→bright. */
const VOWELS = ["oo", "oh", "uh", "ah", "aw", "or", "eh", "ih", "ee", "ay"];
const CODAS = ["t", "k", "p", "l", "n", "r"];

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function pick<T>(table: readonly T[], q: number): T {
  return table[Math.min(table.length - 1, Math.floor(clamp01(q) * table.length))]!;
}

/**
 * Deterministic: ≤2 syllabic tokens read off the loudest flux frames,
 * always lowercase ASCII. No frames → no residue.
 */
export function dayResidue(profile: TrackProfile, rng: () => number): string[] {
  const frames = profile.frames;
  if (frames.length === 0) return [];

  const loud = [...frames]
    .sort((a, b) => b.flux - a.flux)
    .slice(0, Math.min(8, frames.length));

  const want = Math.min(2, loud.length, 1 + (rng() < 0.55 ? 1 : 0));
  const out: string[] = [];
  const pool = [...loud];
  for (let i = 0; i < want && pool.length > 0; i++) {
    const f = pool.splice(Math.floor(rng() * pool.length), 1)[0]!;
    let word = pick(ONSETS, f.zcr / 0.25) + pick(VOWELS, f.centroid / 5000);
    if (f.flux > 0.5) word += pick(CODAS, f.rms / 0.4);
    out.push(word);
  }
  return out;
}

/** The residue shows up distorted, never as a clean repeat of the sound. */
export function morphResidue(word: string, rng: () => number): string {
  const mode = rng();
  if (mode < 0.34) return word.length > 4 ? `${word.slice(0, Math.ceil(word.length / 2))}-${word.slice(-3)}` : `${word}ing`;
  if (mode < 0.67) return `${word}s`;
  return word;
}
