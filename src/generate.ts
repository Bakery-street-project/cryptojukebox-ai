import type { Artifacts, SpikeState, TrackProfile } from "./types.ts";
import { runDream, type DreamOptions } from "./dream/engine.ts";
import { NOTE_NAMES } from "./dream/formats.ts";

export async function generate(profile: TrackProfile, spike: SpikeState, opts?: DreamOptions): Promise<Artifacts> {
  const local = runDream(profile, spike, opts);
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
    return {
      dream: parsed.dream,
      idea: parsed.idea,
      script: parsed.script,
      prompt: parsed.prompt,
      sigil: local.sigil,
      engine: "llm",
      dreamMeta: local.dreamMeta,
    };
  } catch (e) {
    console.warn("LLM generation failed, using local engine:", e instanceof Error ? e.message : e);
    return local;
  }
}
