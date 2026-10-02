# Cloudflare integration plan (edge prep applied to the repo)

Status: **decision made, prep code committed — still no Cloudflare resources.**
The x402 gate will live at the **edge** as a Worker; the origin gate
(`src/payments/`) is retired **only after** that Worker is deployed and
verified end-to-end (see `cloudflare/README.md`, step 10). Deployment work is
blocked until a valid API token is minted (dash → My Profile → API Tokens;
`cfut_…` format) — an invalid token was verified against the API and is not
stored anywhere.

## What fits, what doesn't

| # | Integration | Fit | Effort | Notes |
|---|-------------|-----|--------|-------|
| 1 | Turnstile + rate-limiting rules on `POST /api/decode` | S | small | Rate rules are dashboard-only (wrangler 4 has no top-level `ratelimit` field). Turnstile widget verification is not yet wired in the prep Worker — runbook step 7. |
| 2 | R2 for audio serving/retention (`GET /audio/<id>`) | M | **prep: `cloudflare/` dir** | Decode itself stays on the Bun origin (ffmpeg); the edge Worker serves R2 objects and falls through while the bucket is empty. KV's 25 MiB cap ruled it out. |
| 3 | x402 at the edge (`cloudflare/src/index.ts`, adapted from `x402-proxy-template`, MIT) | M | **prep committed; deploy blocked on token** | Decision recorded: the edge replaces `src/payments/`, one layer only. Retirement sequence: deploy → verify 402/pay/cookie/D1-row → origin `JUKEBOX_PAYMENTS=off` → follow-up commit deletes `src/payments/`. |
| 4 | D1 for `dreamSeed → artifacts` permalinks (`GET /dream/<seed>`) | M | **prep: schema.sql + in-flight recorder** | The edge records paid decode responses as they pass through, so the origin stays stateless. Recall then survives anything that happens to the origin process. |
| 5 | Cloudflare Analytics Engine for PV/UV | S | later | Nice-to-have telemetry; app itself stays telemetry-free by design. |

## Explicitly ruled out

- **Running the decode pipeline in a Worker** — CPU-time and native-binary
  limits rule out ffmpeg/yt-dlp on-platform.
- **Containers (now)** — heavier than the current single-Bun-process scope.
- **KV for audio blobs** — 25 MiB object cap.
- **x402 verification at both edge and origin** — double-gating buys nothing;
  the transition is edge-on-then-origin-off, never both.

## Repo layout

- `cloudflare/` — Worker prep: `wrangler.jsonc`, `src/{index,auth,jwt,env,bindings}.ts`,
  `schema.sql`, operator runbook `README.md`. Never imported by the Bun app;
  CI typechecks it separately (`cloudflare/` step in `.github/workflows/ci.yml`).
- Reference clone: `/home/kilisan/Bakery-street-project/cloudflare-refs/templates`
  (`x402-proxy-template`, MIT License, Copyright (c) 2018 Cloudflare, Inc. —
  attribution preserved in the adapted files' headers).
