# cryptojukebox-ai

Feed it music — a YouTube/Spotify link or an uploaded audio file — and it
dreams in artifacts: unrepeatable psychedelic dreams, project ideas, film
scripts, image-generation prompts, and a neural spike-train sigil, all derived
from a real DSP → spiking-neural-network analysis pipeline. One song, one
dream per listen — every decode draws fresh entropy and carries its
`dreamSeed`, and pasting that seed back recalls the identical dream. Runs
entirely locally on [Bun](https://bun.com); no account, no telemetry.

## The dream engine (mechanism-inspired synthesis)

The generator models how a sleeping brain builds narratives — it is a
mechanism-inspired synthesis, not a claim that the machine "understands" your
music:

- **Phasic bursts (M1)** — the track's own spectral-flux peaks fire timed
  activation events the narrative cannot veto.
- **Emotion-tagged replay (M2)** — fragments of a 435-memory association bank
  are selected by how well their affect matches what the track measures, with
  a never-zero tail so strange intrusions stay possible.
- **Executive collapse (M3)** — measured texture chaos lowers an
  executive-index: fewer logical connectors, more passive voice, absurdity
  accepted without comment.
- **Hyperpriming (M4)** — the walk follows weak, remote associations a waking
  engine would reject, with capped hard cuts.
- **Threat-simulation arc (M5)**, **day residue (M6)** — the track title leaks
  in, distorted, at most twice.
- **Reconstructive recall (M7)** — scenes fade (clear/hazy/gone) before being
  spoken; the idea/script/prompt are the *same dream* re-recalled in other
  formats, never new inventions.
- **Hypnagogic layer (M8)** — the sigil raster and phosphene strip are direct
  measurements of the spiking network.

## How it works

```
link/file ──▶ ingest (yt-dlp / Spotify preview / upload)
        ──▶ ffmpeg decode to mono 22.05 kHz PCM
        ──▶ FFT feature stream (RMS, spectral centroid, flux, ZCR, chroma,
            BPM via onset autocorrelation, Krumhansl-style key/mode)
        ──▶ 24-neuron leaky-integrate-and-fire network with homeostatic
            threshold adaptation → spike raster ("sigil")
        ──▶ dream engine: phasic bursts → emotion-tagged replay of a memory
            bank → associative walk under reduced executive function →
            tension arc → reconstructive recall rendering
        ──▶ fresh entropy per decode (recallable via dreamSeed; optional LLM
            re-telling via env)
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
  returns track profile, neural state and all artifacts. Optional
  `dreamSeed` (field or JSON key, 8–32 hex): omit it and the decode draws
  fresh entropy (a dream nobody has had); send the seed from a previous
  response's `artifacts.dreamMeta.dreamSeed` to recall that exact dream.
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
src/dream/  the mechanism engine (bank bursts replay walk executive arc
            residue render formats seed engine)
src/payments/  x402 fee gate (config / mock / server)
public/     index.html style.css app.js   (glassmorphic neon UI)
scripts/    pay-demo.ts — x402 testnet client that pays for one decode
tests/      bun test suites
docs/       SETUP.md manual, CLOUDFLARE.md edge-integration plan,
            DREAM-LISTENING.md quality-gate notes
cloudflare/ edge Worker prep (x402 gate, D1 dream permalinks, R2 audio) —
            typechecked in CI, deliberately not deployed yet
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
