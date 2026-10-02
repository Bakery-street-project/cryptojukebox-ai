export interface Frame {
  t: number;
  rms: number;
  centroid: number;
  flux: number;
  zcr: number;
}

export interface TonalEstimate {
  key: number;
  mode: "major" | "minor";
  majorness: number;
}

export interface TrackProfile {
  title: string;
  durationSec: number;
  sampleRate: number;
  frames: Frame[];
  bpm: number;
  loudness: number;
  brightness: number;
  dynamism: number;
  tonal: TonalEstimate;
  valence: number;
  arousal: number;
  signature: string;
}

export interface SpikeState {
  rates: number[];
  meanRate: number;
  sync: number;
  raster: string;
}

export interface DreamMeta {
  /** Hex entropy of this dream. Paste it back as dreamSeed to replay the identical dream. */
  dreamSeed: string;
  /** 0–1 standing in for reduced executive function (M3). */
  execIndex: number;
  /** 0–1 confidence of the reconstructive recall that produced these texts (M7). */
  recallConfidence: number;
  nodeCount: number;
  burstCount: number;
  residueCount: number;
  /** M8 — the hypnagogic strip: per-neuron firing rate as luminance. */
  phosphene: string;
}

export interface Artifacts {
  dream: string;
  idea: string;
  script: string;
  sigil: string;
  prompt: string;
  engine: "local" | "llm";
  dreamMeta: DreamMeta;
}

export interface DecodeResponse {
  id: string;
  title: string;
  sourceKind: "upload" | "youtube" | "spotify-preview";
  profile: TrackProfile;
  spike: SpikeState;
  artifacts: Artifacts;
}
