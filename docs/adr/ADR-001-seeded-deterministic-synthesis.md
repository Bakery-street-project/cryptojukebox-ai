# ADR-001: Seeded deterministic dream synthesis over pure sampling

Status: Accepted (retrofitted 2026-10-02; embodied since `6e58e97`).

## Context

Every decode should feel unrepeatable — yet a dream the listener loved
must be recallable on demand, shareable, and cacheable forever. Pure random
sampling gives novelty but loses recall; fixed templates give recall but
kill novelty. The product needs both at once.

## Decision

Draw 4 bytes of **crypto entropy** per decode (`src/dream/seed.ts:19-23`,
never `Math.random`), emit it as the hex `dreamSeed` in
`artifacts.dreamMeta`, and route **all** randomness through it: the SNN's
input weights (`src/snn.ts:12,18`) and every engine stage's own rng
stream (`src/dream/engine.ts:24-26,90`). Re-supplying the seed with the
same decoded signal replays the byte-identical dream; omitting it draws
fresh entropy (`src/server.ts:66`). Direct library calls without a seed
fall back to a signature-derived seed (`engine.ts:46-48`), so even the
fallback path is deterministic per track.

## Alternatives considered

- **Pure sampling, no seed** — unrepeatable but undreamable-twice; no
  permalink, no sharing, no regression tests. Rejected.
- **Fixed template per track** — fully deterministic but the "one song,
  one dream" claim dies; outputs become mad-libs (the retired v1 engine,
  `ac2df6f`). Rejected.
- **Timestamp-based entropy** — not re-injectable, so recall impossible.
  Rejected.

## Consequences

- Recall is a first-class feature: journal (`ADR-006`), `/dream/:seed`,
  `?seed=` permalinks all lean on seed byte-identity.
- Tests can assert byte-identical replay (`tests/generate.test.ts`) and
  seed-sweep invariants (`tests/dream-render.test.ts` 30-seed sweep).
- Every new stochastic stage **must** take its bits from the seed
  streams — a hidden `Math.random` anywhere would silently break recall.
  The containment and replay tests are the tripwire.
