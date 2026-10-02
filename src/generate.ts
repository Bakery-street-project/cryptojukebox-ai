import type { Artifacts, SpikeState, TrackProfile } from "./types.ts";
import { runDreamWithState, type DreamOptions } from "./dream/engine.ts";
import type { DreamState } from "./dream/types.ts";

/** The scene as the mechanism walked it — what the LLM is allowed to re-tell. */
function dreamBrief(state: DreamState): string {
  const peak = state.arc.reduce((best, p) => (p.tension > best.tension ? p : best), state.arc[0] ?? { node: 0, tension: 0 });
  return JSON.stringify({
    firstDraft: state.text,
    walkedScene: state.nodes.map((n) => ({
      fragment: n.frag.words[0] ?? n.frag.id.replace(/_/g, " "),
      category: n.frag.cat,
      arrivedBy: n.via,
      mood: [n.frag.v, n.frag.a],
    })),
    recallFades: state.fades,
    dayResidue: state.residues,
    tensionPeakAtNode: peak.node,
    executiveFunction: state.exec.execIndex,
    recallConfidence: state.recallConfidence,
  });
}

export async function generate(profile: TrackProfile, spike: SpikeState, opts?: DreamOptions): Promise<Artifacts> {
  const { state, artifacts: local } = runDreamWithState(profile, spike, opts);
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
              "You are the waking re-teller of a neuromorphic jukebox. A dream mechanism (phasic bursts, affect-weighted replay, an associative walk under reduced executive function) has already walked a scene and narrated it roughly. Your job is only to re-tell that dream in better prose. Rules: use nothing but the walked fragments, the associations recorded in arrivedBy, and the day-residue words — inventing a new fragment betrays the dream. Keep the odd that the fades mark as hazy or gone; do not tidy it. Never mention analysis numbers or the mechanism. dream: 3-6 sentences, second person. idea: one buildable creative concept from the same fragments. script: a 5-line film scene. prompt: an image-generation prompt. Emit JSON with keys dream, idea, script, prompt.",
          },
          { role: "user", content: dreamBrief(state) },
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
