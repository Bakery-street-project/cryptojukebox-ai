# ADR-005: CodeQL default setup → self-hosted job, with an honest-fallback rule

Status: Accepted (retrofitted 2026-10-02; embodied in `d00e0e0`).

## Context

Security analysis ran through GitHub's CodeQL **default setup** — a
dynamic workflow generated from repo settings (visible as
`dynamic/github-code-scanning/codeql`) that always targets
GitHub-hosted runners. Under the billing lock it failed every push and
would keep failing. The plan's pre-mortem named the real risk: Arch is a
**non-supported distribution** for CodeQL, so moving the job to the
self-hosted runner could fail — and the temptation would be to fake it
green.

## Decision

Replace the dynamic setup with a repo-file job (`ci.yml`, job `codeql`,
`runs-on: [self-hosted, jukebox-ci]`, matrix `language: [typescript]`,
`autobuild: false` since TS analysis needs only the source tree, SARIF
upload via `github/codeql-action/analyze@v3`), and **disable the default
setup through the API first** (`code-scanning/default-setup` →
`state=not-configured`) so the two never race.

The plan bound an **honest-fallback rule**: if CodeQL cannot run on Arch,
delete the job, leave the default setup disabled, and record the gap in
HANDOFF as billing-blocked with `bun audit` as the interim dependency
check — no fake-green, no placeholder workflow.

## Alternatives considered

- **Leave default setup failing silently** — a red X nobody reads is
  worse than an honest absence; it also trains everyone to ignore CI.
  Rejected.
- **Third-party SAST on Arch** — new toolchain for no benefit while the
  fallback rule exists. Rejected.
- **Add `actions` language matrix** — marginal gain, larger first-run
  bundle; deferred rather than faked.

## Consequences

- The empirical gate passed: first self-hosted run green on Arch,
  3m10s, SARIF `e8da23ea…` recorded (CodeQL 2.27.1), 0 open alerts —
  no fallback needed, but the fallback path stays documented for the
  next unsupported-runner surprise.
- Security scanning is now **repo-file owned**: editable, reviewable,
  versioned — an upgrade over invisible default-setup config.
- `permissions: security-events: write` at workflow level is the only
  scope the analysis upload needs; contents stays `read`.
