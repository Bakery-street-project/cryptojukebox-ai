# Architecture Decision Records

Retrofitted 2026-10-02 from code and git history, in the format of the
`documentation-and-adrs` / `architecture-decision` skills (context →
alternatives → consequences). One decision per file; status is
`Accepted` unless noted.

| ID | Decision | Status |
|---|---|---|
| [001](ADR-001-seeded-deterministic-synthesis.md) | Seeded deterministic dream synthesis over pure sampling | Accepted |
| [002](ADR-002-audio-driven-content.md) | Dream content is audio-driven, never title-driven | Accepted |
| [003](ADR-003-watch-only-payments-seam.md) | Watch/settle-only payments seam; no server-side keys | Accepted |
| [004](ADR-004-self-hosted-ci.md) | Self-hosted CI under a billing lock; forks never execute here | Accepted |
| [005](ADR-005-codeql-self-hosted.md) | CodeQL default setup → self-hosted job, with an honest-fallback rule | Accepted |
| [006](ADR-006-dream-journal-permalink.md) | Dream journal: the seed is the product's memory and permalink | Accepted |
| [007](ADR-007-edge-proxy-only-decode.md) | Edge Worker proxies decode; never decodes in the Worker | Accepted |
