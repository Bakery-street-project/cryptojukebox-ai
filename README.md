# cryptojukebox-ai

Conscious Cryptojukebox AI with Neuromorphic Computing and Psychedelic Consciousness

## Vision

The "bakery-street-project/cryptojukebox-ai" is an ambitious project aimed at developing a Conscious Cryptojukebox AI that incorporates neuromorphic computing and psychedelic consciousness. The project's plan outlines eight key areas:

## Features

- Developed in **TypeScript**
- Well-structured and maintainable codebase
- Integration ready for development workflows
- Comprehensive documentation
- 2. **Stack**: Here, they might be detailing the technologies, frameworks, or tools they intend to use for building the AI. Given the mention of neuromorphic computing, it's probable that they're exploring advanced computational architectures to mimic biological neural networks.
- 3. **Missing**: This section could highlight any gaps in their current setup or resources needed to achieve their vision. It might include areas where further research or development is required.
- 4. **Monetization**: Considering the project involves a "Cryptojukebox AI," monetization strategies are crucial. They might be exploring how to generate revenue through this technology, perhaps by offering subscription services, premium features, or even integrating with cryptocurrency transactions in some way.
- 5. **Lua Potential**: Lua is a lightweight programming language known for its simplicity and flexibility. Its mention here suggests that the project developers see potential in using Lua for certain components of the AI, possibly for scripting or embedding into other systems.
- 6. **Security**: Developing an AI system comes with significant security considerations. This section likely addresses measures to ensure the AI operates safely, protects user data, and maintains integrity against potential threats.

## Quick Start

### Prerequisites
- Bun 1.2+
- ffmpeg + ffprobe (audio decode)
- yt-dlp (YouTube ingest)

### Installation
```bash
git clone https://github.com/Bakery-street-project/cryptojukebox-ai
cd cryptojukebox-ai
bun install
```

### Usage
```bash
bun dev            # jukebox UI on http://localhost:8787
bun test           # feature-extraction, spiking-network and generator suites
bun run typecheck  # strict TypeScript check
```

Feed the jukebox a YouTube/Spotify link or an uploaded audio file. Pipeline:
ffmpeg decode → FFT feature stream (RMS, spectral centroid, flux, ZCR, chroma,
BPM, tonal key/mode) → 24-neuron leaky-integrate-and-fire spiking network with
homeostatic threshold adaptation → deterministic dream/idea/script/prompt
generator (optional LLM engine via env, see `.env.example`).

The crypto-fee gate is deliberately not built yet — product first, payments
last.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to contribute to this project.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Security

See [SECURITY.md](SECURITY.md) for security policy information.
