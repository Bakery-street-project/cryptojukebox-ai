import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { getDream, journal, listDreams, recordDream } from "../src/journal.ts";

function freshStore(): void {
  process.env.JUKEBOX_DATA_DIR = mkdtempSync("/tmp/juke-journal-") + "/";
}

describe("dream journal", () => {
  test("record then recall returns the payload byte-identically", () => {
    freshStore();
    const payload = {
      id: "ab12cd34-ef",
      title: "Astrix - Deep Jungle Walk",
      sourceKind: "youtube",
      profile: { bpm: 183.9, frames: [] },
      spike: { rates: [0.02, 0.05], meanRate: 0.04, sync: 0.5 },
      artifacts: { dream: "You are put down in a low bridge at dawn.", dreamMeta: { dreamSeed: "93577cae" } },
    };
    expect(recordDream("93577cae", payload.title, payload)).toBe(true);
    const got = getDream("93577cae");
    expect(got).not.toBeNull();
    expect(got!.title).toBe(payload.title);
    expect(JSON.stringify(got!.payload)).toBe(JSON.stringify(payload));
    expect(Number.isInteger(got!.created_at)).toBe(true);
  });

  test("first seed wins — replaying an old dream cannot clobber the entry", () => {
    freshStore();
    expect(recordDream("1943e087", "Becoming Insane", { v: 1 })).toBe(true);
    expect(recordDream("1943e087", "different", { v: 2 })).toBe(false);
    expect(getDream("1943e087")!.payload).toEqual({ v: 1 });
  });

  test("non-hex seeds are rejected before they reach the store", () => {
    freshStore();
    for (const bad of ["nothex", "12", "deadbeefgg", "DEADBEEF", "a".repeat(33)]) {
      expect(recordDream(bad, "x", {})).toBe(false);
    }
    expect(getDream("nothex")).toBeNull();
  });

  test("listDreams is newest-first, capped, and stable for equal timestamps", () => {
    freshStore();
    const db = journal();
    const rows = [
      { seed: "aaaaaaaa", at: 1000 },
      { seed: "bbbbbbbb", at: 3000 },
      { seed: "cccccccc", at: 2000 },
      { seed: "dddddddd", at: 3000 },
    ];
    for (const r of rows) {
      db.run("INSERT INTO dreams (seed, title, artifacts, created_at) VALUES (?1, ?2, '{}', ?3)", [r.seed, r.seed, r.at]);
    }
    const listed = listDreams();
    expect(listed.map((d) => d.seed)).toEqual(["dddddddd", "bbbbbbbb", "cccccccc", "aaaaaaaa"]);
    expect(listDreams(2).map((d) => d.seed)).toEqual(["dddddddd", "bbbbbbbb"]);
  });

  test("a corrupted artifacts blob reads as absent, never crashes", () => {
    freshStore();
    journal().run("INSERT INTO dreams (seed, title, artifacts, created_at) VALUES (?1, 'x', '{not json', 1)", ["ffffffff"]);
    expect(getDream("ffffffff")).toBeNull();
    expect(listDreams().length).toBe(1);
  });

  test("unknown seed is a clean miss", () => {
    freshStore();
    expect(getDream("00000000")).toBeNull();
  });
});
