# ADR-002: Dream content is audio-driven, never title-driven

Status: Accepted (retrofitted 2026-10-02; enforced since `75caf45`).

## Context

The first day-residue implementation (M6) leaked fragments of the **track
title** into the dream text. A listener who named a track "electric
moonlight" got "electric moonlight" hallucinated back — cheap cold
reading, and it invalidated the product's core honesty claim: dreams
derived from a real DSP → SNN analysis of the *sound*.

## Decision

Dream text may only incorporate what the decoded signal carries. M6
residues are phonemes folded from the loudest transients — zero-crossing
rate → onset hardness, spectral centroid → vowel color — distorted and
capped at two (`src/dream/residue.ts`, tests "residue reads the signal,
not the name" in `tests/dream-mechanisms.test.ts`). The title reaches
only the profile `signature` hash (`src/features.ts:178-180`) used for
fallback seeding, never the fragment selection or rendering. Copy
language is fixed: **"mechanism-inspired synthesis"**, never any claim
that the engine understands music (README §"The dream engine").

## Alternatives considered

- **Title as "day residue"** (what v1 did) — emotionally satisfying,
  intellectually dishonest; the dream would just echo the metadata the
  user already knows. Rejected by the product owner mid-project.
- **Allowing the LLM re-teller to invent imagery** — breaks the
  containment invariant that artifacts mention only walked fragments;
  the re-teller's brief explicitly forbids using anything but the walked
  fragments (`src/generate.ts:42`). Rejected.

## Consequences

- A title-word audit is a release ritual: `docs/DREAM-LISTENING.md`
  states it per session, and the acceptance gate is a **human** listener
  table, not an agent self-grade.
- Renaming a track cannot rewrite an existing dream: over HTTP the seed
  always comes from entropy or the client, and fragment selection never
  consults the title. (The library-only fallback seed does hash the
  title — `features.ts:178-180` — which is exactly why the server path
  supplies a real seed instead.)
- The honesty wording ("mechanism-inspired synthesis") is now a standing
  constraint repeated in `AGENTS.md` and all handoff prompts.
