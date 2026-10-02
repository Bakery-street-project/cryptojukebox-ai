import type { TrackProfile } from "../types.ts";

/**
 * M6 — day residue. Waking material leaks into dream narratives mostly as fragments of
 * the day's salient stimuli. Here that is the track title: stripped to ASCII-safe words,
 * quoted or morphed, and intruding at most twice so it reads as residue, not as metadata.
 */

const STOPWORDS = new Set([
  "the", "a", "an", "and", "of", "to", "in", "on", "with", "for", "at", "by", "from", "is", "it", "its",
  "this", "that", "my", "your", "our", "feat", "ft", "official", "video", "audio", "lyrics", "remaster",
  "version", "mix", "edit", "part", "live", "studio",
]);

function asciiWords(title: string): string[] {
  const flat = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ");
  return flat
    .split(" ")
    .map((w) => w.replace(/[^a-z0-9]/g, ""))
    .filter((w) => /^[a-z][a-z0-9]{3,}$/.test(w) && !STOPWORDS.has(w));
}

/** Deterministic: same title + same rng draw, ≤2 tokens, always printable ASCII. */
export function dayResidue(title: string, rng: () => number): string[] {
  const words = asciiWords(title);
  if (words.length === 0) return [];
  const want = Math.min(2, words.length, 1 + (rng() < 0.55 ? 1 : 0));
  const out: string[] = [];
  const pool = [...words];
  for (let i = 0; i < want && pool.length > 0; i++) {
    out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]!);
  }
  return out;
}

/** The residue shows up distorted, never as the literal title. */
export function morphResidue(word: string, rng: () => number): string {
  const mode = rng();
  if (mode < 0.34) return word.length > 4 ? `${word.slice(0, Math.ceil(word.length / 2))}-${word.slice(-3)}` : `${word}ing`;
  if (mode < 0.67) return `${word}s`;
  return word;
}
