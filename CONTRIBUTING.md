# Contributing to cryptojukebox-ai

cryptojukebox-ai is a proprietary, source-published project. External
contributions are welcome as discussion and bug reports; code contributions
are accepted only by explicit written agreement, and submitting a pull
request does not grant you or anyone else a license to the software.

## Bug reports & ideas

Open an issue. Include the input track (or a reproducible link/upload),
expected vs. actual behavior, and `bun --version` / OS.

## Code changes

If a contribution has been agreed:

1. Fork and branch: `git checkout -b feature/my-feature`
2. Keep commits atomic and conventional (`feat:`, `fix:`, `ci:`, `docs:`)
3. `bun test && bun run typecheck` must pass
4. Open a Pull Request against `main`

## Reviewing a pull request

CI runs on the project's self-hosted runner and is deliberately
push-only — fork PR code never executes there. So PR verification is a
local, human-invoked check:

```bash
gh pr view <N>          # read the diff and discussion first
bun scripts/pr-check.ts <N>   # CI's steps, run in a throwaway /tmp worktree
bun scripts/pr-check.ts --clean <N>
```

Note what you are agreeing to: `pr-check` runs the PR's tests, which
means running its code on your machine under your account. That is the
standard tradeoff of not giving forks a runner — read the diff before
you run it, and don't check out PRs you wouldn't execute.

## Code of conduct

Be respectful and assume good faith. Harassment or bad-faith participation
results in removal.
