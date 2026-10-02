import { fnv1a, mulberry32 } from "./dsp.ts";
import type { Artifacts, SpikeState, TrackProfile } from "./types.ts";

const NOTE_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];

const BANKS = {
  bright: {
    adj: ["luminous", "chlorophyll", "glass-finned", "sunlit", "ferrous", "cathedral-bright", "carbonated"],
    noun: ["orchard", "estuary", "atlas moth", "bell tower", "salt flat", "greenhouse", "tidal pool"],
    verb: ["bloom", "unfold", "ring out", "ascend", "crystallize", "take flight"],
  },
  dark: {
    adj: ["obsidian", "tidebound", "umber", "filament-thin", "basalt", "static-fed", "velvet-crushed"],
    noun: ["undercroft", "nebula reef", "dream archive", "iron garden", "hollow monolith", "black coral", "forgive engine"],
    verb: ["dissolve", "hum", "surface", "convulse", "metabolize", "echo back"],
  },
  calm: {
    motion: ["slow-pan", "hovering", "long-exposure", "drifting", "breath-paced"],
    texture: ["felt", "still water", "fog", "linen", "cold smoke"],
  },
  storm: {
    motion: ["whip-pan", "stutter-cut", "kaleidoscopic", "freefall", "tremor"],
    texture: ["broken mirror", "plasma", "rain static", "molten chrome", "spark shower"],
  },
};

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length) % arr.length]!;
}

function withArticle(phrase: string, cap = false): string {
  const vowel = /^[aeiou]/i.test(phrase);
  const a = vowel ? (cap ? "An" : "an") : cap ? "A" : "a";
  return `${a} ${phrase}`;
}

export function localGenerate(profile: TrackProfile, spike: SpikeState): Artifacts {
  const rng = mulberry1(profile, spike);
  const bright = profile.valence >= 0.5;
  const storm = profile.arousal >= 0.55;
  const bank = bright ? BANKS.bright : BANKS.dark;
  const pace = storm ? BANKS.storm : BANKS.calm;
  const bpm = Math.round(profile.bpm) || 96;
  const tonal = `${NOTE_NAMES[profile.tonal.key % 12]} ${profile.tonal.mode}`;
  const syncPct = Math.round(spike.sync * 100);

  const dream = [
    `You are inside ${withArticle(pick(rng, bank.noun))}, the air ${pick(rng, pace.texture)}.`,
    `At ${bpm} BPM the whole structure begins to ${pick(rng, bank.verb)}, and something ${pick(rng, bank.adj)} is ${pick(rng, bank.verb)}ing in the ${pick(rng, bank.noun)} below it.`,
    `${withArticle(pick(rng, bank.adj) + " figure", true)} conducts the ${tonal} field with ${syncPct}% of the crowd firing on the same beat.`,
    `You wake knowing the room was a single ${pick(rng, bank.noun)} and it was you.`,
  ].join(" ");

  const idea = [
    `Build "${pick(rng, bank.noun).replace(/(^\w|-\w)/g, (c) => c.toUpperCase())} Engine":`,
    `${withArticle(pick(rng, pace.motion))} interactive piece that converts ${tonal} audio at ${bpm} BPM into ${pick(rng, bank.adj)} procedural worlds,`,
    `with a live neural raster (${syncPct}% synchrony) as the shared heartbeat.`,
  ].join(" ");

  const script = [
    `TITLE CARD — "${profile.title.toUpperCase()}"`,
    `INT. ${pick(rng, bank.noun).toUpperCase()} — ${bright ? "DAWN" : "DEEP NIGHT"}`,
    `${pick(rng, pace.motion).toUpperCase()} SHOTS: ${pick(rng, bank.adj)} light ${pick(rng, bank.verb)}s across ${pick(rng, pace.texture)}.`,
    `VOICE (V.O.)`,
    `    It fires in ${syncPct}% of the network. The rest is ${pick(rng, bank.noun)}.`,
    `The ${pick(rng, bank.adj)} monitor blooms ${tonal.toUpperCase()}. CUT TO BLACK at ${bpm} BPM.`,
  ].join("\n");

  const prompt = [
    `surreal ${bright ? "luminous" : "chthonic"} ${pick(rng, pace.motion)} visualization of ${withArticle(pick(rng, bank.noun))},`,
    `${pick(rng, bank.adj)} palette over ${pick(rng, pace.texture)},`,
    `tempo-locked ${bpm} BPM motion, ${tonal} color temperature,`,
    `neural-firing texture (${Math.round(spike.meanRate * 100)}% neuron duty cycle), 16:9, highly detailed`,
  ].join(" ");

  return { dream, idea, script, prompt, sigil: spike.raster, engine: "local" };
}

function mulberry1(profile: TrackProfile, spike: SpikeState): () => number {
  return mulberry32(fnv1a(`${profile.signature}|${spike.meanRate.toFixed(5)}|${spike.sync.toFixed(5)}`));
}

export async function generate(profile: TrackProfile, spike: SpikeState): Promise<Artifacts> {
  const local = localGenerate(profile, spike);
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.JUKEBOX_LLM_MODEL;
  if (!apiKey || !model) return local;
  try {
    const base = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 1.1,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are the dream engine of a psychedelic neuromorphic jukebox. Given decoded musical state, emit JSON with keys dream, idea, script, prompt. dream: 3-4 sentences of second-person oneiric narrative. idea: one buildable creative concept. script: a 5-line film scene. prompt: an image-generation prompt. Never mention the analysis numbers directly; transmute them.",
          },
          {
            role: "user",
            content: JSON.stringify({
              title: profile.title,
              bpm: profile.bpm,
              key: NOTE_NAMES[profile.tonal.key % 12],
              mode: profile.tonal.mode,
              valence: profile.valence,
              arousal: profile.arousal,
              brightness: profile.brightness,
              dynamism: profile.dynamism,
              neural_mean_firing_rate: spike.meanRate,
              neural_synchrony: spike.sync,
            }),
          },
        ],
      }),
    });
    if (!res.ok) return local;
    const data = (await res.json()) as { choices: { message: { content: string } }[] };
    const parsed = JSON.parse(data.choices[0]?.message.content ?? "{}") as Partial<Record<keyof Artifacts, string>>;
    if (!parsed.dream || !parsed.idea || !parsed.script || !parsed.prompt) return local;
    return { dream: parsed.dream, idea: parsed.idea, script: parsed.script, prompt: parsed.prompt, sigil: local.sigil, engine: "llm" };
  } catch (e) {
    console.warn("LLM generation failed, using local engine:", e instanceof Error ? e.message : e);
    return local;
  }
}
