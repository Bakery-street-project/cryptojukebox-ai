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

  test("decode records into the journal with its own dream seed", async () => {
    freshStore();
    const { recordDream: rec } = await import("../src/journal.ts");
    const meta = { dreamMeta: { dreamSeed: "1943e087" } };
    expect(rec(meta.dreamMeta.dreamSeed, "Becoming Insane", meta)).toBe(true);
    const res = await route(get("/dream/1943e087"));
    expect(res.status).toBe(200);
  });
});
