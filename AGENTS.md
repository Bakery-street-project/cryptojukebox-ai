# AGENTS.md — cryptojukebox-ai

Guidance for AI agents (and humans) working in this repo.

## What this is

A Bun + strict-TypeScript local web app: feed it a track (YouTube,
Spotify preview, upload) and it synthesizes "dreams" — artifacts from a
real DSP → 24-neuron spiking-network pipeline, mechanism-inspired
synthesis of sleep-dreaming processes. It runs entirely locally; every
successful decode is journaled by seed in SQLite and recallable
byte-identically.

## Commands

```bash
bun install
bun dev              # src/server.ts on :8787 — NO hot reload, restart after src/ edits
bun run typecheck    # tsc --noEmit (include: src, tests — scripts/ is NOT covered)
bun test             # 89 tests / 11 files
cd cloudflare && bun install && bunx tsc --noEmit   # edge Worker (separate package)
bun scripts/pr-check.ts <N>   # review a fork PR locally (see CONTRIBUTING)
```

Gate before **every** commit: `bun run typecheck && bun test`.

## Read before writing docs or code

- `docs/ARCHITECTURE.md` — system shape, all path:line contracts.
- `docs/adr/` — seven decisions; do not re-litigate one in code without
  a new ADR superseding it.
- `docs/API.md` — both runtimes' route contracts.
- `docs/DEVELOPMENT.md` — check matrix, runner ops, debugging gotchas.
- `docs/SETUP.md` / `docs/CLOUDFLARE.md` / `docs/RELEASING.md`.
- `docs/HANDOFF-PROMPTS.md` — T0–T5: what is blocked on the account
  owner (billing, `cfut_` token, OpenAI key, testnet wallet, human
  grading) and the exact prompts to resume each.

## Standing constraints (non-negotiable)

- **No credentials in any tree.** Never read, copy, or transmit
  secrets; `.env` files are off-limits to agents.
- The server is **watch/settle-only** for payments — never store a seed
  phrase or private key; `JUKEBOX_PAY_TO` is a public receive address,
  not a secret. **Test-mode payments only** until an explicit first
  real transaction with a hardening pass (ADR-003).
- Copy discipline: outputs are **"mechanism-inspired synthesis"** —
  never claim the engine understands music. Dream content derives from
  the audio signal, **never the track title** (ADR-002).
- Docs must be evidence-locked: cite `path:line` (or a commit) for
  every factual claim, verified against the current tree. Do not assert
  counts, sizes, or file existence from memory — this repo has been
  burned by exactly that (see `4627a97`).
- Git: atomic conventional commits; commit or push only when asked;
  never force-push a shared branch; a rollback is `git revert`, never
  history rewrite.
- CI runs on the owner's personal Arch box via self-hosted runner
  `jukebox-arch`. **Never** add a `pull_request` trigger — fork code
  must not execute there (ADR-004). A second unrelated runner on that
  box (`~/actions-runner/`, CloudyMcCodeFace) must never be touched.

## Environment facts

- Bun ≥ 1.3.14 (CI pin; `engines` in package.json).
- Journal store: `JUKEBOX_DATA_DIR` (default `.data/`) — tests isolate
  by pointing it at a fresh `mkdtemp` dir; deleting it "forgets
  everything" by design.
- Optional env (all degradable): `OPENAI_API_KEY`+`JUKEBOX_LLM_MODEL`
  (re-teller), `SPOTIFY_CLIENT_ID`/`SECRET`, `JUKEBOX_PAYMENTS` (see
  SETUP §3).
