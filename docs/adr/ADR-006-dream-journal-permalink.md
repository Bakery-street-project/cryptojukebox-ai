# ADR-006: Dream journal — the seed is the product's memory and permalink

Status: Accepted (retrofitted 2026-10-02; embodied since `a1567b5`).

## Context

Before the journal, recalling a dream meant re-decoding the track and
re-pasting the seed — right input, full pipeline cost, every time. The
seeds made dreams *reproducible* but nothing made them *possession*:
"every dream this machine has dreamed" was a claim with no store behind
it. The product needed memory that survives reboots, stays local, and
never jeopardizes the paid path.

## Decision

Persist **every successful decode** at emit time:
`recordDream(dreamSeed, title, response)` into `bun:sqlite` (WAL, path
`JUKEBOX_DATA_DIR` default `.data/dreams.db`), `INSERT OR IGNORE` —
**first seed wins**, a replay can never clobber the original entry
(`src/journal.ts:53`). Serve it back at `GET /dream/:seed` byte-identical
with `cache-control: public, max-age=31536000, immutable`
(`src/server.ts:118-125`), index at `GET /api/dreams` (newest-first,
limit clamped 1..500, `journal.ts:74`), and link in the UI at
`/?seed=…` with a journal panel + copy-link.
The journal write is wrapped in try/catch: **a broken store is a logged
miss, never a failed paid decode** (`server.ts:76-82`).
The edge D1 table mirrors the schema exactly (`cloudflare/schema.sql`)
so seeds mean the same thing in both runtimes — deliberately diverging
on conflict semantics only (edge upserts paid re-decodes,
`cloudflare/src/index.ts:74-75`).

## Alternatives considered

- **Re-decode on recall (no store)** — stateless purity at the cost of
  re-doing the full DSP→SNN→engine for every permalink visit and
  re-paying at the gate. Rejected: the product promise is memory.
- **JSON file store** — trivial, but the repo already runs SQLite on
  both ends (bun:sqlite/D1) and "schema identical to the edge" was worth
  more than fewer dependencies.
- **Last-write-wins journal** — a re-run with the same seed would
  silently rewrite history; "first seed wins" keeps a permalink's bytes
  forever true to the dream it named.

## Consequences

- Deleting `.data/` "forgets everything" — the backup story is now a
  real ops task (SETUP, DEVELOPMENT docs), not a theoretical one.
- `/dream/:seed` responses are immutable-cacheable, so the journal
  doubles as the edge fallthrough target once T1's D1-miss fix lands.
- Corrupt rows read as absent (`getDream` JSON guard) rather than
  crashing the recall path — tested in `tests/journal.test.ts`.
