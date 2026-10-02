# Setup & Operations Manual

Everything needed to install, configure, run and maintain cryptojukebox-ai.

## 1. Requirements

| Tool | Min version | Purpose |
|------|-------------|---------|
| [Bun](https://bun.com) | 1.2 | runtime, package manager, bundler, test runner |
| ffmpeg + ffprobe | any recent | decode any input to mono 22.05 kHz PCM |
| yt-dlp | latest | YouTube audio ingest |

Install on Arch-based systems:

```bash
sudo pacman -S ffmpeg
bunx yt-dlp --version   # yt-dlp via bun/npx, or: sudo pacman -S python-yt-dlp
curl -fsSL https://bun.sh/install | bash
```

On Debian/Ubuntu: `sudo apt install ffmpeg`, `pipx install yt-dlp`.

## 2. Install

```bash
git clone https://github.com/Bakery-street-project/cryptojukebox-ai
cd cryptojukebox-ai
bun install            # deterministic: bun.lock is committed
```

## 3. Configure

All configuration is environment variables; everything is optional and the
app degrades gracefully (see `.env.example`):

```bash
cp .env.example .env   # .env is gitignored, never commit secrets
```

- `PORT` (default 8787) — HTTP listen port.
- `OPENAI_API_KEY` + `JUKEBOX_LLM_MODEL` (+ optional `OPENAI_BASE_URL`) —
  have the LLM re-tell the walked dream in prose. The scene graph, `dreamSeed`
  and every measured value stay the machine's own either way; unset → the local
  mechanism engine (recall by seed is identical in both modes).
- `SPOTIFY_CLIENT_ID` + `SPOTIFY_CLIENT_SECRET` — Spotify ingest via the
  official 30-second preview endpoint (DRM limitation is reported honestly
  when unset).
- `JUKEBOX_PAYMENTS` (`off`|`mock`|`x402-testnet`, default `off`) +
  `JUKEBOX_PAY_TO` / `JUKEBOX_PAY_NETWORK` / `JUKEBOX_PAY_PRICE_USDC` /
  `JUKEBOX_X402_FACILITATOR_URL` — the x402 crypto-fee gate. `JUKEBOX_PAY_TO`
  is a **public receive address only**: the server is watch/settle-only and
  must never hold a private key or seed phrase. `x402-testnet` requires the
  facilitator URL; `mock` settles fake payments locally for E2E tests.
- `JUKEBOX_DATA_DIR` (default `.data/`) — where the dream journal
  (`dreams.db`, SQLite) lives. Every successful decode is recorded there by
  seed; delete the file to forget everything. The journal never blocks a
  decode: a broken store is a logged miss, not a 500.

## 4. Run

```bash
bun dev        # or: bun start — UI at http://localhost:8787
```

Decoded audio is cached under `.cache/` (gitignored). Deleting `.cache/` is
always safe.

### Run as a service (systemd)

```ini
# /etc/systemd/system/cryptojukebox.service
[Unit]
Description=cryptojukebox-ai
After=network.target

[Service]
WorkingDirectory=/opt/cryptojukebox-ai
ExecStart=/usr/bin/env bun src/server.ts
Restart=on-failure
EnvironmentFile=/opt/cryptojukebox-ai/.env

[Install]
WantedBy=multi-user.target
```

## 5. Verify

```bash
bun test           # DSP, spiking-network, generator suites
bun run typecheck  # strict TypeScript (noUncheckedIndexedAccess et al.)
```

Manual smoke test: open the UI, upload any mp3/wav/ogg, confirm BPM/key/
valence/arousal metrics, waveform canvas, four artifact cards and the neural
sigil render.

Payment gate smoke test (offline, no chain):

```bash
JUKEBOX_PAYMENTS=mock JUKEBOX_PAY_TO=0x1111111111111111111111111111111111111111 bun dev
# unpaid → 402 with x402 requirements:
curl -s -F "file=@some.wav" http://localhost:8787/api/decode
# paid (mock X-PAYMENT header = base64 x402 payload; see tests/payments.test.ts) → 200 artifacts
```

Testnet leg (real x402 protocol, faucet money only — see the header comments
in `scripts/pay-demo.ts` for the full sequence: funded throwaway test wallet,
`JUKEBOX_PAYMENTS=x402-testnet`, public facilitator, `bun scripts/pay-demo.ts
<track-url>`).

## 6. CI & automation

- `.github/workflows/ci.yml` — typecheck + tests on every push/PR.
- `.github/workflows/remediation-scan.yml` — Dependabot-config audit
  (workflow_dispatch, scoped to this repo via `repos.json`).
- `.github/workflows/stale.yml` — issue hygiene;
  `dependabot-automerge.yml` — auto-merge for green Dependabot patches.
- `.github/dependabot.yml` — weekly bumps for npm deps + GitHub Actions.

## 7. Troubleshooting

| Symptom | Fix |
|---------|-----|
| `ffmpeg: command not found` | install ffmpeg (step 1) |
| YouTube link fails | `bunx yt-dlp -U` (extractor rot is common) |
| Spotify link returns "DRM" error | expected without API creds — see step 3 |
| Port already in use | `PORT=8788 bun dev` |
| Dream text is identical on every decode | a `dreamSeed` is stuck in the recall field — clear it and each decode draws fresh entropy (the engine badge on the dream card shows which engine is active) |
| `POST /api/decode` returns 402 | payment gate is on (`JUKEBOX_PAYMENTS=mock|x402-testnet`) — set it to `off` for free decoding, or pay with an `X-PAYMENT` header |

## 8. Out of scope (deliberate)

- Mainnet payments and real money: the gate runs in test mode (`off`/`mock`/
  `x402-testnet`) until a dedicated hardening pass precedes any real
  transaction.
- Browser-wallet pay button (MetaMask `eth_signTypedData_v4`): the paid loop
  is proven via the x402 client script, not an in-browser wallet yet.
- Multi-chain "pay from any chain": x402 is protocol-native for other chains
  (e.g. Solana SVM scheme) but only Base USDC is built.
