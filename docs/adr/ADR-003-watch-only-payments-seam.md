# ADR-003: Watch/settle-only payments seam; no server-side keys

Status: Accepted (retrofitted 2026-10-02; embodied since `0bc9399`).

## Context

The jukebox charges for decodes via x402 (HTTP-402 + USDC/EIP-3009 on
Base). A payment-receiving server conventionally holds a wallet — and
any box with a private key on it is a box whose compromise drains real
funds, from a machine that also runs attacker-adjacent audio pipelines.

## Decision

The server is **watch/settle-only**: it never holds a private key or
seed phrase. `JUKEBOX_PAY_TO` is a **public receive address only**
(env contract stated in README, SETUP §3, `docs/HANDOFF-PROMPTS.md`
standing constraints). Verification and settlement are delegated to an
external facilitator (`JUKEBOX_X402_FACILITATOR_URL`); the origin seam
is a swappable gate (`src/payments/`, symbols
`readPaymentsConfig`/`buildPaymentGate`/`PaymentGate`, wired at
`src/server.ts:15-22,101-110`). Three modes — `off` (default), `mock`
(offline E2E), `x402-testnet` (real protocol, faucet money) — and a
standing rule: **test mode until an explicit first real transaction**,
with a dedicated hardening pass before mainnet (README "Status &
scope", SETUP §8).

## Alternatives considered

- **Server-side custody wallet** — one leaked `.env` equals drained
  funds; also incompatible with running on a personal Arch box. Rejected.
- **Browser-wallet pay button (MetaMask `eth_signTypedData_v4`)** —
  keeps keys client-side but was deliberately scoped as a next step,
  not built (SETUP §8 names it out-of-scope).
- **Staying on hosted payment rails** — contradicts the crypto-fee
  premise of the product. Rejected.

## Consequences

- A journal write failure can never sink a paid decode: the pipeline
  runs and the response is built before the best-effort
  `recordDream` try/catch (`src/server.ts:76-82`).
- The duplicate gate (origin + edge) is **temporary by design**: T2
  deletes `src/payments/` once the edge gates live, with the invariant
  "never ship a moment with zero gates on a public origin" (see
  `docs/ARCHITECTURE.md` §8, HANDOFF T2 runbook).
- Every demo/test path must be exercisable with fake money (`mock` mode
  exists so CI proves the full 402→settle→release flow offline).
