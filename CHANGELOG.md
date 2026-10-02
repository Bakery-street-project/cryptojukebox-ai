# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versions: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Documentation build-out: `docs/ARCHITECTURE.md`, `docs/API.md`,
  `docs/DEVELOPMENT.md`, `docs/RELEASING.md`, `docs/adr/` (001–007),
  `CHANGELOG.md`, root `AGENTS.md`.
- `engines.bun` pin in `package.json` (informational — Bun does not
  enforce it).
- Journal paging: `GET /api/dreams?offset=` and a **Load more** button,
  so the journal is no longer capped at twelve entries (`58f4b6d`).
- `GET /api/dreams/export` — whole journal as NDJSON attachment, plus an
  Export link in the UI: the first backup path for dream data.
- Journal empty and fetch-failure states with distinct copy and a retry
  button (previously both silently hid the section).
- Tablist Home/End keys, live `prefers-reduced-motion` tracking,
  debounced resize redraw, programmatic focus on first results show.
- `scripts/ui-validate.ts` — 23-check Playwright runtime validation,
  re-runnable release evidence (`55e906e`).

### Fixed
- Cold-load panel leak: `.tabpanel`/`.results` display rules overrode the
  UA `[hidden]` rule, so the Upload panel and empty results cards
  rendered before any decode; global `[hidden]{display:none!important}`
  (`4406ce8`).
- Journal-click/decode render race: an in-flight decode clobbered a
  clicked dream and stale status timers kept mutating `aria-busy` text;
  a `renderEpoch` guard gives the screen to whoever asked last
  (`4406ce8`).
- `render()` no longer throws on thin payloads — missing fields render
  `—`, a malformed 200 surfaces as a toast, and unreachable-server
  errors get an explicit retry message instead of "Failed to fetch".
- Neural sigil legibility: cells sized from the measured container with
  no 360 px cap; dense rasters scroll horizontally instead of shrinking
  to specks (`49ed11b`).
- `--color-secondary` `#6366f1` → `#818cf8` (3.5:1 → 5.3:1 on glass —
  AA for the 13 px uppercase headings); dead `.pulse` element removed.

## [0.1.0] — 2026-10-02

First consolidated release: everything a local user needs to feed a
track, dream, recall and share — with the x402 gate built but dormant
and the edge prepared but undeployed, both on purpose.

### Added
- Core engine: DSP feature stream (FFT 2048/512, BPM autocorrelation,
  major/minor template key/mode), 24-neuron leaky-integrate-and-fire
  network with homeostatic thresholds, seeded artifact generator
  (dream/idea/script/sigil/prompt + phosphene) — `8ede3df`.
- HTTP decode server + multi-source ingest (yt-dlp YouTube, Spotify
  preview, ≤80 MB upload) — `f19d36f`; glassmorphic neon UI — `967fe18`.
- Mechanism-driven dream engine (M1–M8 primitives, 435-fragment memory
  bank), retiring the v1 template mad-lib — `c2d547a`, `ac2df6f`.
- Unrepeatable-by-default decodes with seed recall — `6e58e97`.
- Day residue rewritten to audio-derived phonemes (never the track
  title) — `75caf45`.
- x402 fee gate around `/api/decode` with `off`/`mock`/`x402-testnet`
  modes, watch/settle-only — `0bc9399`.
- Cloudflare edge prep: x402-gated proxy Worker, D1 dream permalinks,
  R2 audio with origin fallthrough (typechecked in CI, undeployed) —
  `27d9609`.
- **Dream journal**: every decode persisted by seed in local SQLite;
  `GET /dream/:seed` + `GET /api/dreams`; UI panel and `/?seed=`
  permalinks — `a1567b5`, `db9ae47`.
- CI hardened on a self-hosted runner under an account billing lock:
  quality gate + CodeQL (default setup disabled) on `jukebox-arch` as a
  systemd user service; fork PRs verified locally via
  `scripts/pr-check.ts` — `f826df4`…`2aeeee1`.

### Changed
- Public profile/README rewritten to match the real product — `a971cf0`.
- Psytrance listening session documented; agent self-grade separated
  from the (still open) human acceptance gate — `07da65e`, `cb051c2`.

### Fixed
- Documentation fact-repair: stale test counts, false "missing
  run_audit.sh" claim, overstated "Krumhansl" key-detection wording —
  verified against source (`4627a97`).

[Unreleased]: https://github.com/Bakery-street-project/cryptojukebox-ai/commits/main
[0.1.0]: https://github.com/Bakery-street-project/cryptojukebox-ai/commits/main
