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

export interface Artifacts {
  dream: string;
  idea: string;
  script: string;
  sigil: string;
  prompt: string;
  engine: "local" | "llm";
}

export interface DecodeResponse {
  id: string;
  title: string;
  sourceKind: "upload" | "youtube" | "spotify-preview";
  profile: TrackProfile;
  spike: SpikeState;
  artifacts: Artifacts;
}
