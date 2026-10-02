# cryptojukebox-ai

Feed it music — a YouTube/Spotify link or an uploaded audio file — and it
dreams in artifacts: deterministic psychedelic dreams, project ideas, film
scripts, image-generation prompts, and a neural spike-train sigil, all derived
from a real DSP → spiking-neural-network analysis pipeline. Runs entirely
locally on [Bun](https://bun.com); no account, no telemetry.

## How it works

```
link/file ──▶ ingest (yt-dlp / Spotify preview / upload)
        ──▶ ffmpeg decode to mono 22.05 kHz PCM
        ──▶ FFT feature stream (RMS, spectral centroid, flux, ZCR, chroma,
            BPM via onset autocorrelation, Krumhansl-style key/mode)
        ──▶ 24-neuron leaky-integrate-and-fire network with homeostatic
            threshold adaptation → spike raster ("sigil")
        ──▶ deterministic artifact generator (seeded by track signature +
            neural sync rate; optional LLM engine via env)
```

## Quick start

### Prerequisites

- Bun 1.2+
- ffmpeg + ffprobe (audio decode)
- yt-dlp (YouTube ingest)

### Run

```bash
git clone https://github.com/Bakery-street-project/cryptojukebox-ai
cd cryptojukebox-ai
bun install
bun dev            # jukebox UI on http://localhost:8787
```

Full setup, configuration and operations manual: [docs/SETUP.md](docs/SETUP.md).

### Verify

```bash
bun test           # feature-extraction, spiking-network and generator suites
bun run typecheck  # strict TypeScript check
```

## API

- `POST /api/decode` — multipart file upload (≤80 MB) or JSON `{"url": "…"}`;
  returns track profile, neural state and all artifacts.
- `GET /audio/:id` — streams previously decoded cached audio.

When the payment gate is enabled (`JUKEBOX_PAYMENTS=mock|x402-testnet`) an
unpaid `POST /api/decode` returns **HTTP 402** with x402 payment requirements;
retry the identical request with an `X-PAYMENT` header and the pipeline only
runs after the payment verifies and settles (funds land in `JUKEBOX_PAY_TO`;
the server holds no keys). With the default `JUKEBOX_PAYMENTS=off` there is no
payment step at all.

Everything degrades gracefully with no env set; optional keys
(`OPENAI_API_KEY`, `SPOTIFY_CLIENT_ID`/`SECRET`) unlock LLM generation and
Spotify-preview ingest — see `.env.example`.

## Project layout

```
src/        dsp.ts features.ts snn.ts generate.ts ingest.ts server.ts
src/payments/  x402 fee gate (config / mock / server)
public/     index.html style.css app.js   (glassmorphic neon UI)
scripts/    pay-demo.ts — x402 testnet client that pays for one decode
tests/      bun test suites
docs/       SETUP.md operations manual
.github/    CI, dependabot, audit workflows
```

## Status & scope

- Crypto-fee gate: built as [x402](https://docs.x402.org/) (HTTP-402 open
  standard, USDC via EIP-3009 on Base/Base-Sepolia), **test-mode by default** —
  `off` (no payment), `mock` (fake facilitator, offline E2E), `x402-testnet`
  (real protocol, faucet test-USDC, no real money). Mainnet, self-hosted
  facilitator and browser-wallet pay-button are deliberately next steps, not
  done.
- "Any blockchain" is currently Base-USDC-only; Solana (x402 SVM scheme) is
  protocol-native but unbuilt.
- Spotify links honestly report the DRM/preview limitation until API
  credentials are provided.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Proprietary — source is published, all rights reserved. See
[LICENSE](LICENSE). Report issues privately per [SECURITY.md](SECURITY.md).
