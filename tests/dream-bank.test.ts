import { describe, expect, test } from "bun:test";
import { BANK, DEFAULT_BANK, REMOTE_TAIL, parseBank, validateBank } from "../src/dream/bank.ts";

const bank = DEFAULT_BANK;

/** Undirected reachability over the symmetrised edge set. */
function componentCount(): number {
  const seen = new Set<string>();
  let components = 0;
  for (const start of bank.fragments) {
    if (seen.has(start.id)) continue;
    components += 1;
    const queue = [start.id];
    seen.add(start.id);
    while (queue.length > 0) {
      const id = queue.pop()!;
      for (const e of bank.byId.get(id)!.edges) {
        if (!seen.has(e.to)) {
          seen.add(e.to);
          queue.push(e.to);
        }
      }
    }
  }
  return components;
}

function allEdges(): { from: string; to: string; w: number }[] {
  return bank.fragments.flatMap((f) => f.edges.map((e) => ({ from: f.id, to: e.to, w: e.w })));
}

describe("dream memory bank", () => {
  test("passes structural validation", () => {
    expect(validateBank(bank)).toEqual([]);
  });

  test("edges are symmetrised on load", () => {
    for (const f of bank.fragments) {
      for (const e of f.edges) {
        const back = bank.byId.get(e.to)!.edges.find((b) => b.to === f.id);
        expect(back?.w).toBe(e.w);
      }
    }
  });

  test("no self-loops and no isolated fragments", () => {
    expect(bank.fragments.filter((f) => f.edges.some((e) => e.to === f.id))).toEqual([]);
    expect(bank.fragments.filter((f) => f.edges.length === 0)).toEqual([]);
  });

  test("the association graph is a single component", () => {
    expect(componentCount()).toBe(1);
  });

  test("every affective quadrant is populated", () => {
    const quadrants = { hi_hi: 0, hi_lo: 0, lo_hi: 0, lo_lo: 0 };
    for (const f of bank.fragments) {
      if (f.v >= 0) quadrants[f.a >= 0 ? "hi_hi" : "hi_lo"] += 1;
      else quadrants[f.a >= 0 ? "lo_hi" : "lo_lo"] += 1;
    }
    for (const [name, count] of Object.entries(quadrants)) {
      expect(count, `${name}: ${count} fragments`).toBeGreaterThanOrEqual(25);
    }
  });

  test("at least 8% of the links are weak remote associations", () => {
    const edges = allEdges();
    const weak = edges.filter((e) => e.w <= 0.25).length;
    expect(weak / edges.length).toBeGreaterThanOrEqual(0.08);
  });

  test("remote tail links are all weak and resolve", () => {
    for (const [from, to, w] of REMOTE_TAIL) {
      expect(w, `${from}→${to}`).toBeLessThanOrEqual(0.25);
      expect(bank.byId.has(to), `${from}→${to}`).toBe(true);
    }
  });

  test("a remote link from an unknown fragment fails loudly", () => {
    expect(() => parseBank([["a", "place", 0, 0]], [["ghost", "a", 0.1]])).toThrow(/unknown fragment ghost/);
  });

  test("the corpus is large enough that one dream never repeats a fragment", () => {
    expect(bank.fragments.length).toBeGreaterThanOrEqual(200);
    const cats = new Set(bank.fragments.map((f) => f.cat));
    expect(cats.size).toBe(7);
  });

  test("an unknown edge target survives parsing so validation can name it", () => {
    const broken = parseBank([
      ["a", "place", 0.1, 0.1],
      ["b", "place", -0.1, 0.2, undefined, [["ghost", 0.4]]],
    ]);
    expect(broken.byId.get("b")!.edges).toEqual([{ to: "ghost", w: 0.4 }]);
    expect(validateBank(broken)).toEqual(["b: edge to unknown fragment ghost"]);
  });

  test("ids and weights are checked", () => {
    const dup = parseBank([
      ["a", "place", 0.1, 0.1],
      ["a", "figure", 0.2, 0.2],
    ]);
    expect(validateBank(dup)).toEqual(["duplicate fragment id a"]);
    const badWeight = parseBank([
      ["a", "place", 0.1, 0.1],
      ["b", "place", 0.1, 0.1, undefined, [["a", 0]]],
    ]);
    // Symmetrisation means a bad weight is reported in both directions.
    expect(validateBank(badWeight).sort()).toEqual([
      "a→b: weight 0 outside 0…1",
      "b→a: weight 0 outside 0…1",
    ]);
  });

  test("validation rejects out-of-range affect, empty phrasing and oversized phrases", () => {
    const bad = parseBank([
      ["x", "place", 2, 0, ["up here"], [["y", 0.5]]],
      ["y", "place", 0, -3, [""]],
    ]);
    expect(validateBank(bad).sort()).toEqual([
      "x: valence 2 outside −1…1",
      "y: arousal -3 outside −1…1",
      "y: no usable phrasing",
    ]);
    const long = parseBank([["z", "scene", 0, 0, ["one two three four five six seven eight nine"]]]);
    expect(validateBank(long)).toEqual(["z: phrasing longer than 8 words"]);
  });
});
