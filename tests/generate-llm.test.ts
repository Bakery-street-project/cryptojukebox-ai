import { afterEach, describe, expect, test } from "bun:test";
import { generate } from "../src/generate.ts";
import { runDream } from "../src/dream/engine.ts";
import { DEFAULT_BANK } from "../src/dream/bank.ts";
import type { SpikeState, TrackProfile } from "../src/types.ts";

const spike: SpikeState = {
  rates: Array.from({ length: 24 }, (_, i) => 0.02 + (i % 5) * 0.01),
  meanRate: 0.04,
  sync: 0.5,
  raster: "▓·░▓·▓",
};

const profile: TrackProfile = {
  title: "test track",
  durationSec: 10,
  sampleRate: 22050,
  frames: Array.from({ length: 120 }, (_, i) => ({
    t: i / 30,
    rms: 0.1 + (i % 7) * 0.01,
    centroid: 1000,
    flux: i % 20 === 0 ? 1 : 0.05,
    zcr: 0.05 + (i % 3) * 0.02,
  })),
  bpm: 120,
  loudness: 0.1,
  brightness: 1500,
  dynamism: 0.6,
  tonal: { key: 9, mode: "minor", majorness: 0.2 },
  valence: 0.3,
  arousal: 0.7,
  signature: "deadbeef",
};

const SEED = "0000000a";

interface FetchCall {
  url: string;
  body: Record<string, unknown>;
}

const saved = {
  key: process.env.OPENAI_API_KEY,
  model: process.env.JUKEBOX_LLM_MODEL,
  base: process.env.OPENAI_BASE_URL,
};

afterEach(() => {
  if (saved.key === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = saved.key;
  if (saved.model === undefined) delete process.env.JUKEBOX_LLM_MODEL;
  else process.env.JUKEBOX_LLM_MODEL = saved.model;
  if (saved.base === undefined) delete process.env.OPENAI_BASE_URL;
  else process.env.OPENAI_BASE_URL = saved.base;
  globalThis.fetch = originalFetch;
});

const originalFetch = globalThis.fetch;

function stubFetch(respond: (call: FetchCall) => { ok: boolean; json: unknown }): FetchCall[] {
  const calls: FetchCall[] = [];
  globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
    const [input, init] = args;
    const call: FetchCall = {
      url: String(input),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    };
    calls.push(call);
    const r = respond(call);
    return {
      ok: r.ok,
      status: r.ok ? 200 : 500,
      json: async () => r.json,
    } as Response;
  }) as typeof fetch;
  return calls;
}

function enableLlm(): void {
  process.env.OPENAI_API_KEY = "test-key-not-a-secret";
  process.env.JUKEBOX_LLM_MODEL = "test-model";
  process.env.OPENAI_BASE_URL = "https://mock.local/v1";
}

const llmRetell = {
  dream: "Retold dream prose.",
  idea: "Retold idea.",
  script: "Retold script.",
  prompt: "Retold prompt.",
};

describe("LLM re-teller (mocked fetch, no key, no network)", () => {
  test("happy path: engine llm, text replaced, machine's own meta untouched", async () => {
    enableLlm();
    stubFetch(() => ({ ok: true, json: { choices: [{ message: { content: JSON.stringify(llmRetell) } }] } }));
    const arts = await generate(profile, spike, { dreamSeed: SEED });
    expect(arts.engine).toBe("llm");
    expect(arts.dream).toBe("Retold dream prose.");

    const local = runDream(profile, spike, { dreamSeed: SEED });
    expect(arts.dreamMeta).toEqual(local.dreamMeta);
    expect(arts.sigil).toBe(local.sigil);
  });

  test("the honest brief: walked fragments in, invent-nothing rule on", async () => {
    enableLlm();
    const calls = stubFetch(() => ({ ok: true, json: { choices: [{ message: { content: JSON.stringify(llmRetell) } }] } }));
    await generate(profile, spike, { dreamSeed: SEED });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://mock.local/v1/chat/completions");

    const messages = calls[0]!.body.messages as { role: string; content: string }[];
    const system = messages.find((m) => m.role === "system")!.content;
    expect(system).toContain("inventing a new fragment betrays the dream");
    expect(system).toContain("re-tell");

    const brief = JSON.parse(messages.find((m) => m.role === "user")!.content) as {
      title?: unknown;
      firstDraft: string;
      walkedScene: { fragment: string }[];
    };
    // the re-teller never sees the track's name — the dream is the signal's own
    expect(brief.title).toBeUndefined();
    expect(brief.walkedScene.length).toBeGreaterThan(0);
    const bankPhrases = new Set(DEFAULT_BANK.fragments.map((f) => f.words[0] ?? f.id));
    for (const step of brief.walkedScene) {
      expect(bankPhrases.has(step.fragment)).toBe(true);
    }
  });

  test("HTTP 500 → silent fallback to the local engine", async () => {
    enableLlm();
    stubFetch(() => ({ ok: false, json: {} }));
    const arts = await generate(profile, spike, { dreamSeed: SEED });
    expect(arts.engine).toBe("local");
    expect(arts.dream).toBe(runDream(profile, spike, { dreamSeed: SEED }).dream);
  });

  test("malformed JSON payload → fallback, no crash", async () => {
    enableLlm();
    stubFetch(() => ({ ok: true, json: { choices: [{ message: { content: "not json at all" } }] } }));
    const arts = await generate(profile, spike, { dreamSeed: SEED });
    expect(arts.engine).toBe("local");
  });

  test("incomplete payload (missing keys) → fallback", async () => {
    enableLlm();
    stubFetch(() => ({ ok: true, json: { choices: [{ message: { content: JSON.stringify({ dream: "only this" })} }] } }));
    const arts = await generate(profile, spike, { dreamSeed: SEED });
    expect(arts.engine).toBe("local");
  });

  test("no API key → fetch is never attempted", async () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.JUKEBOX_LLM_MODEL;
    const calls = stubFetch(() => ({ ok: true, json: {} }));
    const arts = await generate(profile, spike, { dreamSeed: SEED });
    expect(arts.engine).toBe("local");
    expect(calls).toHaveLength(0);
  });
});
