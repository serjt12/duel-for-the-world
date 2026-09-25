import { describe, expect, it } from "vitest";
import { CARDS } from "@project-palacio/duel-content";
import type { CardId } from "@project-palacio/duel-content";
import { createDuel } from "../../duel/createDuel";
import { STARTING_HAND_SIZE } from "../../config/DuelConfig";
import { advancePhase } from "../TurnSystem";

const ALL_CARD_IDS = Object.keys(CARDS) as CardId[];

function buildDeck(size: number): CardId[] {
  return Array.from(
    { length: size },
    (_, i) => ALL_CARD_IDS[i % ALL_CARD_IDS.length],
  );
}

describe("advancePhase", () => {
  it("steps through a single turn's phases in order without changing the active duelist", () => {
    const duel = createDuel(buildDeck(20), buildDeck(20));

    advancePhase(duel);
    expect(duel.phase).toBe("campaign-1");
    expect(duel.activeDuelistId).toBe("duelist1");

    advancePhase(duel);
    expect(duel.phase).toBe("confrontation");

    advancePhase(duel);
    expect(duel.phase).toBe("campaign-2");

    advancePhase(duel);
    expect(duel.phase).toBe("recess");
    expect(duel.activeDuelistId).toBe("duelist1");
    expect(duel.turnNumber).toBe(1);
  });

  it("rolls Recess over into the other duelist's Agenda Phase, incrementing the turn counter", () => {
    const duel = createDuel(buildDeck(20), buildDeck(20));

    for (let i = 0; i < 5; i += 1) {
      advancePhase(duel);
    }

    expect(duel.phase).toBe("agenda");
    expect(duel.activeDuelistId).toBe("duelist2");
    expect(duel.turnNumber).toBe(2);
  });

  it("skips the very first draw (turn 1) but draws normally on every later Agenda Phase", () => {
    const duel = createDuel(buildDeck(20), buildDeck(20));

    expect(duel.duelists.duelist1.hand).toHaveLength(STARTING_HAND_SIZE);

    for (let i = 0; i < 5; i += 1) {
      advancePhase(duel);
    }

    expect(duel.duelists.duelist2.hand).toHaveLength(STARTING_HAND_SIZE + 1);
    expect(duel.duelists.duelist2.deck).toHaveLength(
      20 - STARTING_HAND_SIZE - 1,
    );

    for (let i = 0; i < 5; i += 1) {
      advancePhase(duel);
    }

    expect(duel.duelists.duelist1.hand).toHaveLength(STARTING_HAND_SIZE + 1);
  });

  it("ends the duel when a duelist must draw from an empty deck", () => {
    const duel = createDuel(buildDeck(STARTING_HAND_SIZE), buildDeck(20));

    expect(duel.duelists.duelist1.deck).toHaveLength(0);

    for (let i = 0; i < 10; i += 1) {
      advancePhase(duel);
    }

    expect(duel.winnerId).toBe("duelist2");
  });

  it("resets per-turn flags and hasAttackedThisTurn for the newly active duelist only", () => {
    const duel = createDuel(buildDeck(20), buildDeck(20));

    duel.duelists.duelist1.hasNormalDeployedThisTurn = true;
    duel.duelists.duelist1.hasSetScandalThisTurn = true;
    duel.duelists.duelist1.field.push({
      instanceId: 1,
      cardId: "agitador",
      controllerId: "duelist1",
      zone: 0,
      stance: "campaign",
      facing: "face-up",
      turnDeployed: 1,
      hasAttackedThisTurn: true,
      hasChangedStanceThisTurn: true,
    });

    for (let i = 0; i < 10; i += 1) {
      advancePhase(duel);
    }

    expect(duel.activeDuelistId).toBe("duelist1");
    expect(duel.duelists.duelist1.hasNormalDeployedThisTurn).toBe(false);
    expect(duel.duelists.duelist1.hasSetScandalThisTurn).toBe(false);
    expect(duel.duelists.duelist1.field[0].hasAttackedThisTurn).toBe(false);
    expect(duel.duelists.duelist1.field[0].hasChangedStanceThisTurn).toBe(false);
  });

  it("is a no-op once the duel has a winner", () => {
    const duel = createDuel(buildDeck(STARTING_HAND_SIZE), buildDeck(20));

    for (let i = 0; i < 10; i += 1) {
      advancePhase(duel);
    }

    expect(duel.winnerId).toBe("duelist2");

    const stateBefore = JSON.stringify(duel);
    advancePhase(duel);
    const stateAfter = JSON.stringify(duel);

    expect(stateAfter).toBe(stateBefore);
  });
});
