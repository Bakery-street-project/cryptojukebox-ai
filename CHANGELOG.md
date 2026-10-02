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
