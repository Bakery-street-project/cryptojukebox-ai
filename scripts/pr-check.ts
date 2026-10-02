/**
 * Local PR gate for fork pull requests — the repo's CI runner is
 * self-hosted and deliberately push-only (fork code must never execute
 * on it), so PR review happens here instead, on your own machine.
 *
 *   bun scripts/pr-check.ts 76        # fetch PR #76, run the CI checks on it
 *   bun scripts/pr-check.ts --clean 76  # remove its worktree + local branch
 *
 * WARNING: `bun test` executes the PR's code with your user's privileges
 * and its .env-readable paths. Review the diff (`gh pr diff 76`) first;
 * this is the accepted tradeoff of having no CI on forks. The checks run
 * in a throwaway git worktree under /tmp — your working tree, journal
 * data and branches are never touched.
 */
import { existsSync } from "node:fs";

type Step = { name: string; cmd: string[]; cwd?: string };

const prFlag = process.argv[2] === "--clean";
const pr = Number(process.argv[prFlag ? 3 : 2]);
if (!Number.isInteger(pr) || pr <= 0) {
  console.error("usage: bun scripts/pr-check.ts [--clean] <PR#>");
  process.exit(2);
}

const wt = `/tmp/juke-pr-${pr}`;
const branch = `pr-${pr}`;
const run = (cmd: string[]): Promise<number> =>
  Bun.spawn(cmd, { stdout: "inherit", stderr: "inherit" }).exited;

if (prFlag) {
  const wtOk = (await run(["git", "worktree", "remove", wt, "--force"])) === 0;
  const brOk = (await run(["git", "branch", "-D", branch])) === 0;
  console.log(`cleaned: worktree ${wtOk ? "removed" : "absent"}, branch ${brOk ? "deleted" : "absent"}`);
  process.exit(0);
}

// Drop any stale worktree first: git refuses to fetch into a branch
// that is checked out somewhere.
if (existsSync(wt)) await run(["git", "worktree", "remove", wt, "--force"]);
if ((await run(["git", "fetch", "origin", `pull/${pr}/head:${branch}`, "--force"])) !== 0) {
  console.error(`could not fetch pull/${pr}/head from origin`);
  process.exit(1);
}
if ((await run(["git", "worktree", "add", wt, branch])) !== 0) {
  console.error(`could not create worktree ${wt}`);
  process.exit(1);
}

const steps: Step[] = [
  { name: "bun install --frozen-lockfile", cmd: ["bun", "install", "--frozen-lockfile"] },
  { name: "tsc --noEmit", cmd: ["bunx", "tsc", "--noEmit"] },
  { name: "bun test", cmd: ["bun", "test"] },
  { name: "install", cmd: ["bun", "install", "--frozen-lockfile"], cwd: "cloudflare" },
  { name: "tsc --noEmit", cmd: ["bunx", "tsc", "--noEmit"], cwd: "cloudflare" },
];

const results: { name: string; ok: boolean; secs: number }[] = [];
for (const s of steps) {
  const t0 = performance.now();
  const r = await Bun.spawn(s.cmd, {
    cwd: `${wt}/${s.cwd ?? ""}`,
    stdout: "inherit",
    stderr: "inherit",
  }).exited;  results.push({ name: `${s.cwd ? `${s.cwd}/ ` : ""}${s.name}`, ok: r === 0, secs: (performance.now() - t0) / 1000 });
}

const width = Math.max(...results.map(r => r.name.length));
console.log(`\nPR #${pr} @ ${wt}`);
for (const r of results) {
  console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.name.padEnd(width)}  ${r.secs.toFixed(1)}s`);
}
const failed = results.filter(r => !r.ok).length;
console.log(failed ? `${failed} of ${results.length} checks FAILED` : `all ${results.length} checks passed`);
console.log(`review + clean up with: bun scripts/pr-check.ts --clean ${pr}`);
process.exit(failed ? 1 : 0);
