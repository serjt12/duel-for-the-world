import { describe, expect, it } from "vitest";
import { cardsOfEdition } from "../editions";
import {
  hasUnlocks,
  nextUnlock,
  starterCardsOfEdition,
  unlockOrderOfEdition,
  unlockedCardsOfEdition,
} from "../Unlocks";

const world = cardsOfEdition("world");
const starter = starterCardsOfEdition("world");
const order = unlockOrderOfEdition("world");

describe("Unlocks (World Edition)", () => {
  it("the starter set is a curated 15-20 card subset of the full pool", () => {
    expect(starter.length).toBeGreaterThanOrEqual(15);
    expect(starter.length).toBeLessThanOrEqual(20);
    for (const id of starter) expect(world).toContain(id);
    expect(new Set(starter).size).toBe(starter.length); // no duplicates
  });

  it("every World card is either a starter card or in the unlock order, exactly once", () => {
    const accounted = [...starter, ...order.map((step) => step.id)];
    expect(new Set(accounted).size).toBe(accounted.length); // no overlap, no duplicates
    expect(new Set(accounted)).toEqual(new Set(world));
  });

  it("the unlock order is sorted ascending by winsRequired", () => {
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i].winsRequired).toBeGreaterThanOrEqual(order[i - 1].winsRequired);
    }
  });

  it("a brand-new player (0 wins) has exactly the starter set", () => {
    expect(new Set(unlockedCardsOfEdition("world", 0))).toEqual(new Set(starter));
  });

  it("unlocks accumulate monotonically as wins go up, one card per threshold", () => {
    let previous = unlockedCardsOfEdition("world", 0).length;
    for (const step of order) {
      const before = unlockedCardsOfEdition("world", step.winsRequired - 1).length;
      const at = unlockedCardsOfEdition("world", step.winsRequired).length;
      expect(before).toBe(previous);
      expect(at).toBe(before + 1);
      expect(unlockedCardsOfEdition("world", step.winsRequired)).toContain(step.id);
      previous = at;
    }
  });

  it("enough wins unlocks the entire World Edition", () => {
    const maxWins = order[order.length - 1].winsRequired;
    expect(new Set(unlockedCardsOfEdition("world", maxWins))).toEqual(new Set(world));
    // Further wins don't add or remove anything once everything is unlocked.
    expect(new Set(unlockedCardsOfEdition("world", maxWins + 100))).toEqual(new Set(world));
  });

  it("nextUnlock names the soonest locked card, and is null once done", () => {
    expect(nextUnlock("world", 0)).toEqual(order[0]);
    expect(nextUnlock("world", order[0].winsRequired)).toEqual(order[1]);
    expect(nextUnlock("world", order[order.length - 1].winsRequired)).toBeNull();
  });

  it("Colombia has no curated starter set and is always fully unlocked", () => {
    expect(hasUnlocks("colombia")).toBe(false);
    const colombia = cardsOfEdition("colombia");
    expect(new Set(unlockedCardsOfEdition("colombia", 0))).toEqual(new Set(colombia));
    expect(new Set(starterCardsOfEdition("colombia"))).toEqual(new Set(colombia));
    expect(unlockOrderOfEdition("colombia")).toEqual([]);
  });

  it("World Edition does gate cards", () => {
    expect(hasUnlocks("world")).toBe(true);
  });
});
