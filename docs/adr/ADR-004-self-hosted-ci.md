# ADR-004: Self-hosted CI under a billing lock; forks never execute here

Status: Accepted (retrofitted 2026-10-02; embodied since `f826df4`).

## Context

The GitHub account sits under a billing lock: every `ubuntu-latest` job
queues forever ("account is locked due to a billing issue") even for
public repos, while **self-hosted runners keep working** — proven
empirically when the first self-hosted run finished in 42 s. The only
runner available is a personal Arch box (`jukebox-arch`, label
`jukebox-ci`, `~/actions-runner-jukebox/`, managed as a systemd user
service with `enable-linger` — no sudo, survives reboot). A self-hosted
runner has one property GitHub-hosted runners give you for free: code
from `pull_request` events comes from **any fork of any repo**, and
Actions' "secrets aren't exposed to forks" comfort breaks when the
runner is your own machine, shares your filesystem, and can read `.env`
files.

## Decision

1. Every workflow triggers **push/dispatch/schedule only** — the
   `pull_request` trigger was deliberately deleted from CI
   (`.github/workflows/ci.yml:7-8` comment).
2. PR verification moves to a **human-invoked local replay**:
   `bun scripts/pr-check.ts <N>` fetches `pull/<N>/head` into a
   throwaway `/tmp/juke-pr-<N>` git worktree and reruns the CI steps
   there (header comment + CONTRIBUTING state the tradeoff plainly:
   running a PR's tests executes its code locally — review the diff
   first).
3. Runner persistence is a systemd **user** unit (`Restart=on-failure`,
   PATH includes `~/.bun/bin`) rather than the root `svc.sh` install,
   to stay sudo-free on the user's daily driver.

## Alternatives considered

- **Settle billing, keep hosted runners** — the honest fix, but a
  payment decision belongs to the account owner; the user chose the
  runner route when asked.
- **GitHub Codespaces / third-party CI** — new accounts, new billing
  surfaces, no advantage over the box already humming.
- **Running fork PRs on the self-hosted runner anyway** — equivalent to
  `curl | bash` from strangers on your filesystem. Rejected hard.
- **No PR checks at all** — reviews would fly blind; pr-check.ts keeps
  the gate real without exposing the box.

## Consequences

- CI coverage of forks is structurally impossible here; PRs from
  outsiders are verified by a human with a script, and the script's
  PASS/FAIL table is the review artifact.
- Billing remains a standing external constraint: Dependabot's updater
  (`dynamic/dependabot/dependabot-updates`) still cannot run, recorded
  in `docs/HANDOFF-PROMPTS.md` T0 residuals.
- The runner is single-box, no-queue-redundancy: if it dies, CI stops.
  Mitigated by `Restart=on-failure` + linger; documented switch path to
  root `svc.sh` in HANDOFF T0.1.
