# Development guide

Everything a contributor (human or agent) needs to build, check and
operate on this repo. Ops/runbook material lives in `docs/SETUP.md`;
system design in `docs/ARCHITECTURE.md`.

## Toolchain

- **Bun ≥ 1.3.14** — CI pins 1.3.14 (`ci.yml`) and `package.json`
  declares `engines.bun` (informational: Bun does not enforce engines,
  the pin is intent + future-tooling signal).
- ffmpeg + ffprobe (audio decode), yt-dlp (YouTube ingest) — see SETUP §1.
- Two packages, deliberately separate installs:
  root (`src/`, `tests/`, `scripts/`) and `cloudflare/` (Worker).
  `cloudflare/` deps (hono 4.11.1, x402) never enter the origin runtime.

## The check matrix (what CI runs, in order)

| # | Command | Scope |
|---|---|---|
| 1 | `bun install --frozen-lockfile` | root |
| 2 | `bunx tsc --noEmit` | root — strict; `include: ["src","tests"]` |
| 3 | `bun test` | 89 tests / 11 files, ~1 s |
| 4 | `cd cloudflare && bun install --frozen-lockfile && bunx tsc --noEmit` | Worker |
| 5 | `codeql` job (parallel) | SARIF → code scanning |

Local equivalent before any commit: `bun run typecheck && bun test`.

**Gotcha:** `scripts/` is outside tsconfig `include`, so
`bun scripts/pr-check.ts` type-errors surface only when Bun runs them —
keep scripts self-contained and read the runtime error, it is accurate
(Bun transpiles, tsc checks; two different nets).

## Reviewing a fork PR locally

```bash
gh pr view <N>                # read the diff FIRST — tests execute PR code
bun scripts/pr-check.ts <N>   # replays steps 1–4 in /tmp/juke-pr-<N> worktree
bun scripts/pr-check.ts --clean <N>
```

No `pull_request` CI trigger exists on purpose (ADR-004): fork code must
never run on the self-hosted runner, so this script is the gate. It
force-refetches `pull/<N>/head`, drops any stale worktree first (git
refuses to fetch into a checked-out branch), and never touches the main
working tree or `.data/`.

## Tests

- `bun test` from the repo root; no watch config needed.
- **Journal isolation**: every journal-touching test sets
  `JUKEBOX_DATA_DIR` to a fresh `mkdtemp` dir; `journal.ts`'s singleton
  reopens when the env path changes. Copy that pattern — sharing
  `.data/` between tests is a flake factory.
- Engine invariants worth knowing before editing `src/dream/`:
  byte-identical seed replay, cross-artifact containment (artifacts may
  mention only walked fragments, 30-seed sweep), bank structure
  validation (`tests/dream-bank.test.ts`), anti-word-salad floors
  (`tests/dream-render.test.ts`). These are the guardrails ADR-001/002
  made testable — break them deliberately or not at all.

## UI runtime validation

- `scripts/ui-validate.ts` drives the **running app** in headless
  Chromium (Playwright) — 23 checks covering the two historical UI
  blockers (cold-load `[hidden]` leak, journal/decode render race) with
  before/after proof, decode E2E, journal paging/export, tab keyboard
  semantics and deep links. Run it against any live instance:
  `UI_URL=http://localhost:8787 TRACK=/path/to/short.wav bun scripts/ui-validate.ts`
  (needs a `playwright`-resolvable `node_modules` in this machine's
  resolution chain; screenshots land in `/tmp`). Unit tests prove the
  engine; this proves the product surface — RELEASING's smoke step
  points here.

## Runner operations (CI box = this machine)

- Service: `systemctl --user {status,restart} actions-runner-jukebox`;
  logs follow the unit (`journalctl --user -u actions-runner-jukebox`).
- Survives reboot/logout via `loginctl enable-linger kilisan`; restarts
  on failure (`Restart=on-failure`, `RestartSec=5`).
- PATH inside CI runs comes from the unit file
  (`~/.bun/bin:/usr/local/bin:/usr/bin:/bin`) — a tool invisible to CI is
  usually a PATH omission there, not a runner bug.
- Root-managed alternative (needs sudo, only if the user service ever
  proves fragile): see the one-liner in HANDOFF T0.1.

## Local debugging notes (learned the hard way)

- `bun dev` = `bun src/server.ts` — **no hot reload**; restart after
  every `src/` edit.
- `Subprocess.stdout`/`stderr` from `Bun.$\`…\`.nothrow()` are not
  Readers — use `Bun.spawn({stdout:"inherit"})` or `.bytes()` on the
  right object type.
- `res.json()` is `unknown` under strict TS — cast explicitly in tests.
- Under `noUncheckedIndexedAccess`, destructuring tuple-array entries
  yields `T | undefined`; prefer object-shaped fixtures.
- `gh run list` without `--workflow` shows Dependabot noise — filter by
  `"CI — cryptojukebox-ai"`.

## Edge development (cloudflare/)

`bun run typecheck` / `bun run dry-run` (`wrangler deploy --dry-run`)
work offline; `bun run deploy` needs the `cfut_` token (blocked, HANDOFF
T1). CI typechecks it every push, so the Worker never bit-rot waits for
deployment to discover breakage.

## Release hygiene

See `docs/RELEASING.md` — version discipline, changelog duties, rollback.
Short version: every push to `main` must be releasable; `CHANGELOG.md`
records what shipped; a revert is the rollback.
