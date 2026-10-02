import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { route } from "../src/server.ts";
import { recordDream } from "../src/journal.ts";

function freshStore(): void {
  process.env.JUKEBOX_DATA_DIR = mkdtempSync("/tmp/juke-routes-") + "/";
}

const get = (path: string) => new Request(`http://localhost${path}`, { method: "GET" });

describe("journal routes", () => {
  test("GET /dream/<seed> returns the stored payload, marked immutable", async () => {
    freshStore();
    recordDream("93577cae", "Deep Jungle Walk", { artifacts: { dream: "a low bridge at dawn" } });
    const res = await route(get("/dream/93577cae"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("immutable");
    expect(await res.json()).toEqual({ artifacts: { dream: "a low bridge at dawn" } });
  });

  test("unknown seed → 404 with a readable error", async () => {
    freshStore();
    const res = await route(get("/dream/deadbeef"));
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toContain("deadbeef");
  });

  test("malformed seed never reaches the store", async () => {
    freshStore();
    expect((await route(get("/dream/DEADBEEF"))).status).toBe(404);
    expect((await route(get("/dream/zz"))).status).toBe(404);
  });

  test("GET /api/dreams lists newest-first and honors limit", async () => {
    freshStore();
    const db = (await import("../src/journal.ts")).journal();
    db.run("INSERT INTO dreams (seed, title, artifacts, created_at) VALUES ('aaaaaaaa', 'old', '{}', 1000)");
    db.run("INSERT INTO dreams (seed, title, artifacts, created_at) VALUES ('bbbbbbbb', 'new', '{}', 2000)");
    const all = (await (await route(get("/api/dreams"))).json()) as { seed: string }[];
    expect(all.map((d) => d.seed)).toEqual(["bbbbbbbb", "aaaaaaaa"]);
    const one = (await (await route(get("/api/dreams?limit=1"))).json()) as { seed: string }[];
    expect(one.length).toBe(1);
    const junk = await route(get("/api/dreams?limit=abc"));
    expect(junk.status).toBe(200);
  });

  test("GET /api/dreams offset paging yields disjoint ordered pages", async () => {
    freshStore();
    const db = (await import("../src/journal.ts")).journal();
    for (const [seed, t] of [["aaaaaaaa", 1000], ["bbbbbbbb", 2000], ["cccccccc", 3000]] as const) {
      db.run("INSERT INTO dreams (seed, title, artifacts, created_at) VALUES (?, '', '{}', ?)", [seed, t]);
    }
    const p1 = (await (await route(get("/api/dreams?limit=2&offset=0"))).json()) as { seed: string }[];
    const p2 = (await (await route(get("/api/dreams?limit=2&offset=2"))).json()) as { seed: string }[];
    expect(p1.map((d) => d.seed)).toEqual(["cccccccc", "bbbbbbbb"]);
    expect(p2.map((d) => d.seed)).toEqual(["aaaaaaaa"]);
    expect(p1.some((a) => p2.some((b) => a.seed === b.seed))).toBe(false);
    // negative and junk offsets clamp to the first page instead of erroring
    const clamped = (await (await route(get("/api/dreams?limit=2&offset=-5"))).json()) as { seed: string }[];
    expect(clamped.map((d) => d.seed)).toEqual(["cccccccc", "bbbbbbbb"]);
    const junk = (await (await route(get("/api/dreams?offset=nope"))).json()) as { seed: string }[];
    expect(junk.length).toBe(3);
  });

  test("GET /api/dreams/export streams the whole journal as NDJSON", async () => {
    freshStore();
    const db = (await import("../src/journal.ts")).journal();
    const row = (seed: string, title: string, dream: string, at: number) =>
      db.run("INSERT INTO dreams (seed, title, artifacts, created_at) VALUES (?, ?, ?, ?)", [
        seed,
        title,
        JSON.stringify({ title, artifacts: { dream } }),
        at,
      ]);
    row("93577cae", "Deep Jungle Walk", "a low bridge at dawn", 1000);
    row("12ab34cd", "Neon Rain", "rain that hums in F minor", 2000);
    const res = await route(get("/api/dreams/export"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/x-ndjson");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="dreams-\d+\.ndjson"$/);
    const text = await res.text();
    const lines = text.split("\n").filter(Boolean);
    expect(lines.length).toBe(2);
    const payloads = lines.map((l) => JSON.parse(l) as { title: string; artifacts: { dream: string } });
    // newest first, whole DecodeResponse per line
    expect(payloads.map((p) => p.title)).toEqual(["Neon Rain", "Deep Jungle Walk"]);
    expect(payloads[0]!.artifacts.dream).toBe("rain that hums in F minor");
  });

  test("export of an empty journal is a valid empty NDJSON body", async () => {
    freshStore();
    const res = await route(get("/api/dreams/export"));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("");
  });

  test("decode records into the journal with its own dream seed", async () => {
    freshStore();
    const { recordDream: rec } = await import("../src/journal.ts");
    const meta = { dreamMeta: { dreamSeed: "1943e087" } };
    expect(rec(meta.dreamMeta.dreamSeed, "Becoming Insane", meta)).toBe(true);
    const res = await route(get("/dream/1943e087"));
    expect(res.status).toBe(200);
  });
});
