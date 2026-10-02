# Cloudflare integration plan (researched, not yet applied)

Status: **planned only — no Cloudflare resources exist for this project yet.**
`wrangler` and `@cloudflare/workers-types` are installed as devDependencies.
Deployment work is blocked until a valid API token is minted (dash →
My Profile → API Tokens; `cfut_…` format) and provided — an invalid token
was verified against the API and is not stored anywhere.

## What fits, what doesn't

| # | Integration | Fit | Effort | Notes |
|---|-------------|-----|--------|-------|
| 1 | Turnstile + rate-limiting rules on `POST /api/decode` | S | small | The abuse surface is uploads/link fetches; edge-verified before the origin burns ffmpeg CPU. |
| 2 | R2 for the decode cache (replace local `.cache/`) | M | medium | KV caps objects at 25 MiB — too small for 80 MB uploads; R2 has no such cap and no egress fee. |
| 3 | x402 at the edge (`x402-proxy-template` from cloudflare/templates) | M | medium | Would gate before the origin ever sees an unpaid request. If adopted, **pick one layer**: retire `src/payments/` rather than running the fee check at both edge and origin. |
| 4 | D1 for `dreamSeed → artifacts` persistence | M | medium | Enables recall across server restarts and `/dream/<seed>` permalinks. Today recall only works while the artifacts live in the client's response. |
| 5 | Cloudflare Analytics Engine for PV/UV | S | later | Nice-to-have telemetry; app itself stays telemetry-free by design. |

## Explicitly ruled out

- **Running the decode pipeline in a Worker** — CPU-time and native-binary
  limits rule out ffmpeg/yt-dlp on-platform.
- **Containers (now)** — heavier than the current single-Bun-process scope.
- **KV for audio blobs** — 25 MiB object cap.
- **x402 verification at both edge and origin** — double-gating buys nothing
  and doubles the failure surface.

Reference clone: `/home/kilisan/Bakery-street-project/cloudflare-refs/templates`
(`x402-proxy-template` includes its own AGENTS.md setup guide).
