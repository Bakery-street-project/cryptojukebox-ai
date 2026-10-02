export const DREAM_SEED_PATTERN = /^[0-9a-f]{8,32}$/;

export function isDreamSeed(raw: unknown): raw is string {
  return typeof raw === "string" && DREAM_SEED_PATTERN.test(raw);
}

/** Folding is exact (mod 2^32), so bitsToDreamSeed(dreamSeedToBits(s)) round-trips for canonical 8-char seeds. */
export function dreamSeedToBits(seed: string): number {
  let h = 0;
  for (const ch of seed) h = (Math.imul(h, 16) + Number.parseInt(ch, 16)) >>> 0;
  return h;
}

export function bitsToDreamSeed(bits: number): string {
  return (bits >>> 0).toString(16).padStart(8, "0");
}
