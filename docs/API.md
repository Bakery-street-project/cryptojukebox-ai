# API reference

Both runtimes, verified against source on 2026-10-02 (citations are the
contract; if they drift, fix this file). Reviewed with the `api-design`
skill (its naming/versioning/error-envelope checklist; deviations are
**recorded at the bottom, not silently "fixed"** — changing routes is a
code decision, ADR discipline).

## Origin (Bun, default port 8787 — `src/server.ts`)

### `POST /api/decode`

Two request shapes (`server.ts:37-56`):

| Shape | Fields | Limits |
|---|---|---|
| `multipart/form-data` | `file` (audio), optional `dreamSeed` | file ≤ 80 MB (`:44`); < 0.5 s audio rejected (`ingest.ts:36`) |
| `application/json` | `{"url": "https://…"}` (YouTube or Spotify), optional `dreamSeed` | http(s) only (`:50`) |

`dreamSeed` — optional `[0-9a-f]{8,32}`. Omit: the decode draws 4 bytes
of crypto entropy and emits its own seed (unrepeatable by default).
Supply a previous `artifacts.dreamMeta.dreamSeed`: byte-identical recall
for the same audio (`ADR-001`).

**200 → `DecodeResponse`** (`src/types.ts:61-68`):

```jsonc
{
  "id": "cache key for /audio/:id",
  "title": "source title",
  "sourceKind": "upload" | "youtube" | "spotify-preview",
  "profile": {
    "durationSec": 0, "sampleRate": 22050,
    "frames": [ { "t": 0, "rms": 0, "centroid": 0, "flux": 0, "zcr": 0 } ],  // downsampled ≤1500, t 2dp (server.ts:86-95)
    "bpm": 0, "loudness": 0, "brightness": 0, "dynamism": 0,
    "tonal": { "key": 0, "mode": "major|minor", "majorness": 0 },
    "valence": 0, "arousal": 0, "signature": "hex fnv1a"
  },
  "spike": { "rates": [24 floats], "meanRate": 0, "sync": 0, "raster": "≤4000 chars" },
  "artifacts": {
    "dream": "…", "idea": "…", "script": "…", "sigil": "…", "prompt": "…",
    "engine": "local" | "llm",
    "dreamMeta": {
      "dreamSeed": "hex8-32", "execIndex": 0, "recallConfidence": 0,
      "nodeCount": 0, "burstCount": 0, "residueCount": 0,
      "phosphene": "24 chars from ' ·░▒▓█'"
    }
  }
}
```

Errors — `{"error": "<message>"}` (`server.ts:112-116`):

| Status | When |
|---|---|
| 400 | any `IngestError`: missing/oversize file, non-http(s) URL, unsupported host, bad `dreamSeed` format |
| 500 | pipeline failure (post-ingest) |
| 402 | only with `JUKEBOX_PAYMENTS≠off`: x402 v2 body `{x402Version: 2, error, …}` + `X-PAYMENT-REQUIRED` header (base64 requirements) (`src/payments/mock.ts:45-52`); retry identical request with `X-PAYMENT` header |

Side effect: every 200 is journaled (first seed wins, best-effort —
journal failure never turns a paid 200 into a 500, `server.ts:76-82`).

### `GET /dream/:seed`

`:seed` = `[0-9a-f]{8,32}` (route regex `server.ts:118`).

| Status | Body |
|---|---|
| 200 | the **full stored `DecodeResponse`** (not just artifacts), `cache-control: public, max-age=31536000, immutable` |
| 404 | `{"error": "no dream recorded for seed <seed>"}` |
| 404 (plain) | seed-shaped but unroutable paths fall to static handling — malformed seeds never reach the store (`tests/journal-routes.test.ts`) |

### `GET /api/dreams?limit=&offset=`

`DreamSummary[]` — `{"seed","title","created_at" /* epoch ms */}`,
newest-first; `limit` default 50, clamped to 1..500; `offset` default 0,
clamped to ≥0 (junk and negatives fall back to the first page, never a
400 — the list shape is a plain array, so paging is additive and old
clients are unaffected) (`server.ts:135-140`, `journal.ts:73-80`).

### `GET /api/dreams/export`

The whole journal as **NDJSON** — one stored `DecodeResponse` per line,
newest-first (`server.ts:126-133`, `journal.ts:87-93`).
`application/x-ndjson`, `content-disposition: attachment;
filename="dreams-<epoch-seconds>.ndjson"`. Deliberately unpaged: a
backup that silently drops rows is worse than none. Empty journal →
200 with an empty body (still valid NDJSON). No auth — the journal is
local data the caller already owns.

### `GET /audio/:id`

`:id` = `[a-z0-9-]{1,64}` case-insensitive (`server.ts:142`). Streams the
cached source file with `accept-ranges: bytes` and a MIME map
(html/js/css/mp3/ogg/m4a/webm/wav/flac). 404 plain text "not found".

### Static

`/` and `/index.html` serve the UI; other paths resolve against
`public/` after character whitelisting and `..` stripping
(`server.ts:157-162`).

## Edge (Cloudflare Worker, `cloudflare/src/index.ts`) — prepared, not deployed

| Route | Cost | Behavior | Evidence |
|---|---|---|---|
| `POST /api/decode` (and any `PROTECTED_PATTERNS` match) | **paid** | valid `auth_token` cookie → pass; else x402 gate (402 → facilitator verify/settle → proxy to origin); on 200, artifacts recorded into D1 via `waitUntil` | `index.ts:92-119`, `auth.ts:28-60` |
| `GET /dream/:seed` | free | D1 row's **artifacts JSON** (⚠ not the full response), immutable cache header; bad seed 400 `{"error":"bad seed"}`; miss 404 `{"error":"no dream stored for this seed"}` | `index.ts:123-133` |
| `GET /audio/:id` | free | R2 exact-key then `<id>.` prefix lookup; **falls through to origin** while R2 empty; `etag`, `cache-control: max-age=86400` | `index.ts:136-153` |
| `GET /__edge/health` | free | `{status, edge, hasOrigin, patterns, timestamp}` | `index.ts:155-163` |
| everything else | — | proxied verbatim to origin (`ORIGIN_URL` or `ORIGIN_SERVICE`); 502 plain text "edge not configured: ORIGIN_URL is empty" when unset | `index.ts:47-63` |

Gate-integrity guard: non-canonical paths (dual slashes, URL-parse
drift between auth and origin) are rejected `400 "Non-canonical request
path"` before the gate runs (`index.ts:34-45`).

Edge D1 conflict semantics differ from the origin journal by design:
`ON CONFLICT DO UPDATE` (paid re-decodes overwrite) vs origin
`INSERT OR IGNORE` (first seed wins) — ADR-006.

## Recorded deviations (api-design review; no action unless a code phase approves it)

- `dreamSeed` travels three ways (form field, JSON key, embedded in the
  response path) — naming is consistent; only the multiplicity is worth
  noting in the UI docs.
- `/dream/:seed` returns **full response** at origin, **artifacts only**
  at edge — same route, different payload scope. The UI consumes
  artifacts from both; flagged in HANDOFF T1 parity notes.
- Journal index exposes `created_at` as snake_case epoch-ms while the
  rest of the API is camelCase — historical (matches the D1/SQLite
  column name).
- 404 body on `/dream/:seed` echoes user input (the seed) — safe only
  because the route regex pre-validates hex (`server.ts:118`); keep the
  regex if this ever moves.
