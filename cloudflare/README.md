# cryptojukebox-edge — Cloudflare Worker (prep, not deployed)

Payment-gated reverse proxy in front of the Bun origin. **Status: code-ready,
undeployed** — every step below needs a valid Cloudflare API token (`cfut_…`);
the token on file verified Invalid, so nothing here has touched the account.

Origin gate (`src/payments/`) stays live until this Worker is actually deployed
and verified; retirement is a follow-up commit, sequenced in step 9.

## What this is

| Route | Behavior |
|---|---|
| `POST /api/decode` | x402 gate ($0.05 USDC, facilitator verify/settle) → proxy to origin → record `seed → artifacts` into D1 in flight → 1 h paid-access cookie |
| `GET /dream/<seed>` | free permalink: artifacts JSON from D1, 404 if never decoded through the edge |
| `GET /audio/<id>` | R2 object if present, else falls through to the origin's local cache |
| anything else | proxied to `ORIGIN_URL` untouched |

Adapted from Cloudflare's **x402-proxy-template** (MIT License, Copyright (c)
2018 Cloudflare, Inc., from the `cloudflare/templates` repository): proxy +
payment middleware + stateless HMAC cookie. Not ported: bot-management
(Enterprise-only). Added here: D1/R2 routes and the in-flight dream recorder.

## Local checks (no token needed)

```bash
cd cloudflare
bun install
bunx tsc --noEmit                      # strict typecheck
bunx wrangler deploy --dry-run         # bundles + validates config
```

## Deploy runbook (needs a valid cfut_ token)

1. `npx wrangler login` (or `CLOUDFLARE_API_TOKEN=cfut_…`).
2. D1: `wrangler d1 create cryptojukebox-dreams` → paste the returned
   `database_id` over `REPLACE_WITH_D1_ID` in `wrangler.jsonc`.
3. Schema: `wrangler d1 execute cryptojukebox-dreams --remote --file=schema.sql`.
4. R2: `wrangler r2 bucket create cryptojukebox-audio`.
5. Secrets: `wrangler secret put JWT_SECRET` (32 random bytes hex).
6. Dashboard → this Worker → **Settings → Rate limiting rules**: add one
   matching `POST */api/decode`, per-IP, e.g. 20 req/60 s. (wrangler 4 has no
   top-level `ratelimit` field; this is dashboard-only.)
7. Turnstile: dashboard → Turnstile → create widget for the zone → put the
   sitekey in `vars.TURNSTILE_SITEKEY`; wire token verification into the
   protected leg before relying on it (not implemented in this prep code).
8. Point `vars.ORIGIN_URL` at the public Bun origin, set a real
   `PAY_TO` (public receive address — never a key), `NETWORK: "base-sepolia"`.
9. `wrangler deploy`, then verify end-to-end: unpaid `POST /api/decode` → 402
   x402 challenge; paid → 200 + `auth_token` cookie + row in D1
   (`wrangler d1 execute … --command "SELECT seed,title FROM dreams"`);
   `GET /dream/<seed>` → same JSON; bot fetch of `/api/decode` → 429 from the
   rate rule.
10. **Only after 9 passes**: origin `JUKEBOX_PAYMENTS=off`, then a follow-up
    commit deletes `src/payments/` and its server.ts seam. Never run two gates.

## Non-goals of this prep

- No `wrangler deploy`, no cloud resources created.
- Decode itself stays on the Bun origin (ffmpeg); R2 holds *serving* copies —
  migration of decode output retention is a separate later change.
- Mainnet (`NETWORK: "base"`) forbidden until the usual hardening pass.
