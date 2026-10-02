# ADR-007: Edge Worker proxies decode; never decodes in the Worker

Status: Accepted (retrofitted 2026-10-02; recorded in `994d3e0`,
built in `27d9609`).

## Context

The Cloudflare edge (Worker + D1 + R2) is the intended public face:
x402 gating at the boundary, permalinks served from the edge cache. The
seductive alternative — since the whole engine is TypeScript — is to
port the DSP/SNN pipeline into the Worker itself and have a
serverless jukebox.

## Decision

The Worker is a **gate + proxy + read-path**, never a compute home:

- `POST /api/decode` passes through the x402 gate (cookie-or-payment,
  `cloudflare/src/auth.ts:28-60`) and is proxied verbatim to the Bun
  origin (`index.ts:47-63`); paid decodes are recorded into D1 with
  `waitUntil` as they flow back (`index.ts:104-112`).
- Only two cheap read paths are edge-native: `/dream/:seed` from D1 and
  `/audio/:id` from R2 with origin fallthrough while the bucket is empty
  (`index.ts:123-153`) — both **free by design**: already-generated
  material costs nothing to serve; only new dreams cost money
  (`index.ts:84-88`).
- Explicit non-goals (docs/CLOUDFLARE.md): no decode inside the Worker
  (yt-dlp + ffmpeg + unbounded FFT don't fit Worker CPU/memory limits,
  and bundling them would double-maintain the engine), no KV blob
  storage, no double-gating behind the origin's own gate.
- The proxy authorizes and forwards the **same** resolved path:
  non-canonical paths (dual slashes, URL-parse drift) are rejected 400
  up front so gate and origin can never disagree about what was paid for
  (`hasNonCanonicalPath`, `index.ts:34-45`).

## Alternatives considered

- **Full engine in the Worker** — serverless purity against hard
  platform limits (audio tooling is external binaries; 22 kHz FFT over a
  full track exceeds free-tier CPU in one request); two engines to keep
  byte-identical would break ADR-001's recall promise. Rejected.
- **Edge-only journal (origin stateless)** — attractive, but the origin
  must keep dreaming for local users; hence D1-miss falls through to the
  origin journal once T1 lands (the recorded parity fix), not the other
  way round.
- **Gating at origin instead of edge** — pays for the infrastructure the
  edge already provides (TLS, DDoS, facilitator adjacency) and keeps the
  seam in one place per ADR-003's T2 end-state. Rejected as
  end-state; tolerated as current overlap.

## Consequences

- The edge stays small and auditable (~165 lines) — its tests are route
  behavior, not math.
- Deployment is blocked on the `cfut_` token only (T1), not on code.
- Until T1 the D1↔origin journal divergence is benign (edge not live);
  after T1 the fallthrough fix is a **precondition**, already written
  into the T1 prompt.
