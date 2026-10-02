# Blocked-task handoff prompts

Each section is a self-contained engineering prompt for one task that is
currently blocked on something only the account owner can provide. Paste the
prompt block into a fresh agent session (or work through it by hand) once the
prerequisite is met. Every prompt states its own acceptance gate and its
hard "stop" conditions — do not relax them.

Project: `cryptojukebox-ai` (Bun + strict TypeScript, `origin/main`).
Standing constraints for all tasks: never store or log seeds/private keys;
`JUKEBOX_PAY_TO` is a public receive address, not a secret; `.env` files are
off-limits to agents; test-mode payments until an explicit first real
transaction; never run two payment gates at once.

---

## T0 — GitHub CI (RESOLVED via self-hosted runner, 2026-10-02)

The account-level billing lock still kills every GitHub-*hosted* job
(CI and CodeQL alike), so CI was moved off them: the repo now has a
self-hosted runner **jukebox-arch** (label `jukebox-ci`, install at
`~/actions-runner-jukebox/`, now run as a **systemd user service**
`actions-runner-jukebox.service` with `loginctl enable-linger kilisan`,
so it survives logout and starts at boot — no sudo involved), and
`.github/workflows/ci.yml` runs `quality` on `[self-hosted, jukebox-ci]`
with the `pull_request` trigger deliberately removed so fork PRs can
never execute code on the box. First run: success in 42 s (`f826df4`).
`stale.yml` + `dependabot-automerge.yml` now also run on the self-hosted
runner; `remediation-scan.yml` is parked at workflow_dispatch-only — not
because its parts are missing (`.github/scripts/run_audit.sh` and
`repos.json` both exist and are sound) but because it still
`runs-on: ubuntu-latest` and its Dependabot-alerts input is produced by
the billing-blocked updater. Revival is two lines once billing is
settled: restore the `schedule:` trigger (or flip `runs-on` to
`[self-hosted, jukebox-ci]` — the script only needs `gh` + `jq`).

Residual work if you want it:
1. ~~Runner persistence~~ — **done**: the runner unit restarts on failure
   (`Restart=on-failure`, `RestartSec=5`) and starts at boot via linger.
   If you ever prefer the root-managed variant instead:
   `systemctl --user disable --now actions-runner-jukebox && cd ~/actions-runner-jukebox && sudo ./svc.sh install && sudo ./svc.sh start`.
2. ~~CodeQL on hosted runners~~ — **done**: default setup disabled via
   API (`code-scanning/default-setup` → `state=not-configured`) and
   replaced by a `codeql` job in `ci.yml` on the self-hosted runner —
   first run green on Arch (`d00e0e0`, 3m10s, SARIF uploaded, 0 alerts).
   **Billing itself** is still locked (github.com/settings/billing as
   BoozeLee) — it still blocks Dependabot's updater (`dynamic/
   dependabot/dependabot-updates` cannot start while the lock stands).
3. Dependabot opened a `hono` update for `/cloudflare` whose updater run
   errored under the lock; re-check after billing is settled.

## T1 — Deploy the Cloudflare edge Worker (prerequisite: valid `cfut_` token)

**Blocked on:** the Cloudflare API token on file (`cfk_…`) verified **Invalid**;
a new `cfut_` token must be minted with Workers Scripts edit + D1 + R2 +
Secrets permissions.

> **Prompt:** Deploy the prepared edge Worker in `cloudflare/` of
> `cryptojukebox-ai`, following `cloudflare/README.md` runbook steps 1–9
> exactly, with a valid `cfut_` token exported as `CLOUDFLARE_API_TOKEN`
> (never commit it). Sequence: `wrangler d1 create cryptojukebox-dreams` →
> paste `database_id` into `wrangler.jsonc` → apply `schema.sql` remote →
> `wrangler r2 bucket create cryptojukebox-audio` → `wrangler secret put
> JWT_SECRET` (32 random bytes hex, generated locally) → add the dashboard
> rate-limit rule (20 req/60 s per IP on `POST */api/decode`; wrangler 4 has
> no top-level `ratelimit` field) → set `ORIGIN_URL` to the public Bun
> origin and `PAY_TO` to the owner's **public** Base-Sepolia receive address
> (`NETWORK: "base-sepolia"`; mainnet is forbidden in this pass). Then
> `wrangler deploy` and verify end-to-end, capturing evidence for each:
> (a) unpaid `POST /api/decode` → **402** with an x402 payment challenge;
> (b) paid → **200**, `auth_token` cookie set, and
> `wrangler d1 execute cryptojukebox-dreams --remote --command "SELECT
> seed,title FROM dreams"` shows the row;
> (c) `GET /dream/<seed>` returns the byte-identical artifacts JSON;
> (d) hammering `/api/decode` triggers the rate rule (**429**).
> **Before deploying:** the origin now keeps its own dream journal
> (`src/journal.ts`), so update `cloudflare/src/index.ts`: `GET /dream/<seed>`
> must fall through to the origin on a D1 miss instead of returning 404 —
> dreams journaled before the edge existed stay linkable.
> **Stop conditions:** any failure at (a)–(d) → do NOT proceed to T2. Do not
> touch `src/payments/` in this task. Do not wire Turnstile unless the
> sitekey verification code is actually added first (README step 7 note).

## T2 — Retire the origin payment gate (prerequisite: T1 fully verified)

**Blocked on:** T1. This is README runbook step 10 and is the *only* sanctioned
way `src/payments/` dies.

> **Prompt:** The edge Worker deployed in T1 has passed all four verification
> checks (quote the captured evidence in the commit message). Now retire the
> redundant origin gate in `cryptojukebox-ai`, one layer only:
> 1. Set origin env `JUKEBOX_PAYMENTS=off` and restart (`bun src/server.ts`
>    has no hot reload); confirm `POST /api/decode` on the origin alone no
>    longer 402s while the edge still gates it.
> 2. Delete `src/payments/` (config.ts, mock.ts, server.ts, types.ts) and
>    its seam in `src/server.ts` — locate by symbol, not line number: the
>    `readPaymentsConfig`/`buildPaymentGate`/`PaymentGate` imports, the
>    `gatePromise`/`getPaymentGate` block, and the `verdict.release` branch
>    inside the `/api/decode` route. Nothing else in server.ts may change —
>    the dream-journal recording and `/dream/:seed` route must survive.
> 3. Delete `tests/payments.test.ts` (12 tests) alongside the code it covers.
> 4. Update `docs/SETUP.md` (remove the `JUKEBOX_PAYMENTS` rows/lines, point
>    payment config at the edge) and the decision table in
>    `docs/CLOUDFLARE.md`.
> 5. Gates: `bun run typecheck && bun test` (expect 83 minus the 12
>    payments-only tests = **71**), then `git push`; CI must be green
>    (needs T0).
> **Stop conditions:** if any doubt remains that the edge is verified, stop
> and leave `src/payments/` in place. Never ship a moment with zero gates on
> a public origin: sequence is off-origin-last, edge-live-first.
>
> **Ending-phase closeout** (make the retirement *final*, per
> `docs/RELEASING.md` "Deprecation & ending phases"): `CHANGELOG.md`
> entry; update ADR-003's consequence note (origin gate → deleted,
> edge-only); strip `JUKEBOX_PAYMENTS*` from `.env.example`; delete
> `scripts/pay-demo.ts` or retarget it at the edge; re-point any
> remaining README "Status & scope" lines at the edge gate.

## T3 — Real OPENAI-key run of the LLM re-teller (prerequisite: an API key)

**Blocked on:** `OPENAI_API_KEY` + `JUKEBOX_LLM_MODEL` (see `src/generate.ts:26-30`;
optional `OPENAI_BASE_URL`). The path is fully mocked-tested (`tests/generate-llm.test.ts`)
but has never seen a live model.

> **Prompt:** With a real OpenAI key exported in the shell (never in a file
> the agent can read), run `bun src/server.ts` and decode one known track via
> the local UI or `POST /api/decode`. Verify from the response JSON:
> 1. `artifacts.engine` shows the LLM re-tell actually ran (not the silent
>    local fallback — a fallback means the call failed; capture the server
>    log line).
> 2. The re-told `dream` text preserves **every walked fragment** and adds
>    **no new fragment** — run the containment check: for each fragment
>    phrase mentioned, it must exist in the dream bank's walked set
>    (`artifacts.dreamMeta` lists what was walked). This is the point of
>    the whole mechanism; a single invented fragment is a FAIL.
> 3. `dreamMeta` (seed, exec, recall, residues) is unchanged from the
>    machine's own values — the LLM never touches metadata.
> 4. The LLM brief (log the outbound `messages[1].content` once) contains no
>    track title — proven by unit test, worth confirming live.
> 5. Recall: replaying the returned seed server-side still returns the
>    **local** draft byte-identical (the LLM layer must not corrupt
>    determinism; if it does, that is a design bug to fix, not accept).
> **Stop conditions:** if the provider 401/404s, check env names against
> `src/generate.ts` before changing code. Do not commit anything containing
> the key or full request dumps.

## T4 — Live x402 testnet payment run (prerequisite: Base-Sepolia funds + owner wallet)

**Blocked on:** a funded testnet wallet for the payer and a decision on the
receive address. Test-mode only until the user explicitly performs a first
real transaction.

> **Prompt:** Exercise the x402 flow end-to-end on **Base Sepolia only**.
> Origin mode first: `JUKEBOX_PAYMENTS=x402-testnet` with
> `JUKEBOX_PAY_TO=<public address>` and the public facilitator
> (`https://x402.org/facilitator`); run `scripts/pay-demo.ts` (per
> `docs/SETUP.md`) and capture: 402 challenge → payment built and signed in
> memory (key never printed/logged) → facilitator verify+settle → 200 with
> decode payload. Record the settle tx hash. Then repeat the same flow
> through the deployed edge from T1 if it is live — the edge path is the
> future, the origin path exists only until T2. Acceptance: one full paid
> decode on each live path, facilitator reports settlement, and grep proves
> no private key material appears in any log or file written during the run.
> **Stop conditions:** any mainnet address or `NETWORK: "base"` in configs →
> abort. If the facilitator is down, report it; do not switch networks.

## T5 — Human grading of the psytrance session (prerequisite: nothing — only you)

**Blocked on:** the one acceptance call the machine may not make.

> **Prompt (for the human, not an agent):** Open `docs/DREAM-LISTENING.md`,
> read the four dream texts ideally while hearing each track (YouTube links
> are in each section), and fill the empty "Human listener" table:
> dreamlike 1–5 and word-salad 1–5 (lower = better) per track, plus notes.
> Acceptance bar: dreamlike ≥ 3 and word-salad ≤ 2 on a majority of tracks.
> The agent self-grade (4/4 pass) is deliberately side-by-side so you can
> disagree — disagreement is fine; only the human table flips the project's
> Phase 8 gate. When done: `git commit -am "docs(dream): human grading"`.
