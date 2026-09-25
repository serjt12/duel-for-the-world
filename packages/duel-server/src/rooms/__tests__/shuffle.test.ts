import { describe, expect, it } from "vitest";
import { shuffle } from "../shuffle";

// A tiny deterministic PRNG (mulberry32) so shuffle order is pinned.
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("shuffle", () => {
  const items = ["a", "b", "c", "d", "e", "f", "g", "h"];

  it("returns a permutation: same items, same counts", () => {
    const result = shuffle(items, seeded(1));

    expect(result).toHaveLength(items.length);
    expect([...result].sort()).toEqual([...items].sort());
  });

  it("does not modify its input", () => {
    const input = [...items];
    shuffle(input, seeded(2));

    expect(input).toEqual(items);
  });

  it("is deterministic for a given random source", () => {
    expect(shuffle(items, seeded(42))).toEqual(shuffle(items, seeded(42)));
  });

  it("actually reorders (different seeds give different orders)", () => {
    expect(shuffle(items, seeded(1))).not.toEqual(shuffle(items, seeded(2)));
  });
});
