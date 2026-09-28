import { describe, expect, it } from "vitest";
import { CARDS } from "@duel-for-the-world/duel-content";
import type { CardId } from "@duel-for-the-world/duel-content";
import { createDuel } from "../createDuel";
import { STARTING_HAND_SIZE, STARTING_MANDATE } from "../../config/DuelConfig";

const ALL_CARD_IDS = Object.keys(CARDS) as CardId[];

function buildDeck(size: number): CardId[] {
  return Array.from(
    { length: size },
    (_, i) => ALL_CARD_IDS[i % ALL_CARD_IDS.length],
  );
}

describe("createDuel", () => {
  it("starts both duelists at STARTING_MANDATE", () => {
    const duel = createDuel(buildDeck(20), buildDeck(20));

    expect(duel.duelists.duelist1.mandate).toBe(STARTING_MANDATE);
    expect(duel.duelists.duelist2.mandate).toBe(STARTING_MANDATE);
  });

  it("draws each duelist an opening hand of STARTING_HAND_SIZE", () => {
    const duel = createDuel(buildDeck(20), buildDeck(20));

    expect(duel.duelists.duelist1.hand).toHaveLength(STARTING_HAND_SIZE);
    expect(duel.duelists.duelist2.hand).toHaveLength(STARTING_HAND_SIZE);
    expect(duel.duelists.duelist1.deck).toHaveLength(20 - STARTING_HAND_SIZE);
    expect(duel.duelists.duelist2.deck).toHaveLength(20 - STARTING_HAND_SIZE);
  });

  it("deals the opening hand from the front of the deck, in order", () => {
    const deck = buildDeck(20);
    const duel = createDuel(deck, buildDeck(20));

    expect(duel.duelists.duelist1.hand).toEqual(
      deck.slice(0, STARTING_HAND_SIZE),
    );
    expect(duel.duelists.duelist1.deck).toEqual(
      deck.slice(STARTING_HAND_SIZE),
    );
  });

  it("starts with empty fields and archives", () => {
    const duel = createDuel(buildDeck(20), buildDeck(20));

    expect(duel.duelists.duelist1.field).toEqual([]);
    expect(duel.duelists.duelist1.archive).toEqual([]);
    expect(duel.duelists.duelist2.field).toEqual([]);
    expect(duel.duelists.duelist2.archive).toEqual([]);
  });

  it("starts on turn 1, duelist1's Agenda Phase, with no winner", () => {
    const duel = createDuel(buildDeck(20), buildDeck(20));

    expect(duel.turnNumber).toBe(1);
    expect(duel.activeDuelistId).toBe("duelist1");
    expect(duel.phase).toBe("agenda");
    expect(duel.winnerId).toBeNull();
    expect(duel.nextInstanceId).toBe(1);
  });
});
