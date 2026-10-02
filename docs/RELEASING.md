# Releasing & rollback

Product reality: this is a **locally-run** app (the user's machine is
the deployment target) plus a **not-yet-deployed** edge Worker (T1,
blocked on a `cfut_` token). Releases are therefore git- and
artifact-discipline, not server pushes — until the edge goes live.

## Version discipline

- `package.json` `version` is the source of truth; bump it **with** the
  `CHANGELOG.md` entry in the same commit, then tag:
  `git tag -a v0.1.0 -m "…"` (annotated — carries the why).
- 0.x semantics: minor bumps add capabilities, patch bumps fix;
  breaking artifact-schema changes (see below) are a minor bump with a
  journal-compatibility note.
- Tags are pushed (`git push --tags`) — a release nobody can fetch
  didn't happen.

## Release checklist

1. `bun run typecheck && bun test` green locally (83 tests).
2. `CHANGELOG.md`: move Unreleased → version section, date it.
3. `package.json` version bump + annotated tag, one commit.
4. Push `main` + tags; watch the CI run — both `quality` and `codeql`
   must pass on the runner (ADR-004/005):
   `gh run watch <id> --exit-status`.
5. Smoke the surface: `bun dev`, decode `/tmp/testtrack.wav`-class file,
   confirm `dreamSeed` recall via `GET /dream/:seed`.

## What a release must not break (data compatibility)

- **`DecodeResponse` / `artifacts` schema**: the journal stores whole
  responses as JSON and serves them back byte-identically
  (`docs/ARCHITECTURE.md` §6). Removing/renaming artifact fields does
  not corrupt storage, but `/dream/:seed` permalinks from older versions
  will return the older shape — the UI must keep rendering stored
  payloads it wrote yesterday. Schema changes are additive-first.
- **D1 parity**: `cloudflare/schema.sql` mirrors the journal table;
  column changes are coordinated with the (eventual) D1 migration, not
  done unilaterally.

## Rollback

No deploy pipeline exists to "un-publish", so rollback = revert commits:

1. `git revert <sha>` (never `reset --hard` a pushed main).
2. Push the revert, CI gate as above — the revert is a release, with its
   own `CHANGELOG.md` entry (`### Reverted`).
3. Data: a revert does **not** rewrite journal rows; newer-shape dreams
   stay stored and older code reads what it can. Journal is append-only
   by design (first seed wins), so no rollback ever destroys dreams.

## Edge release (future, T1)

The one true server-side deploy the project has. Sequence is pinned in
`docs/HANDOFF-PROMPTS.md` T1 (token → D1/R2 create → secrets →
`wrangler deploy` → routes) and its "before deploying" fallthrough fix
is a release blocker, not a nice-to-have. First real-money transaction
requires its own hardening pass first (ADR-003; SETUP §8).

## Deprecation & ending phases

Retirements are planned deletions with runbooks, not rot:

- `src/payments/` → deleted at T2 once the edge gates live
  (checklist: HANDOFF T2 — the docs phase recorded the sequence;
  never ship a moment with zero gates).
- `.Codex/status.md` → session artifact, marked superseded; product
  truth lives in README/docs.
- GitHub-hosted workflows → none remain; `remediation-scan.yml` is
  parked with revival steps in its header.
