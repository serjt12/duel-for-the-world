import { describe, expect, it } from "vitest";
import type { DuelistState } from "../../duelists/DuelistState";
import type { DuelState } from "../../duel/DuelState";
import { resolveInstantEffects } from "../resolveInstantEffects";

function createDuelist(overrides: Partial<DuelistState> = {}): DuelistState {
  return {
    id: "duelist1",
    mandate: 20,
    deck: [],
    hand: [],
    field: [],
    archive: [],
    setScandals: [],
    backroomPolicies: [],
    hasNormalDeployedThisTurn: false,
    hasSetScandalThisTurn: false,
    bonusVotes: 0,
    ...overrides,
  };
}

function createTestState(mandate1 = 20, mandate2 = 20): DuelState {
  return {
    turnNumber: 1,
    activeDuelistId: "duelist1",
    phase: "campaign-1",
    winnerId: null,
    nextInstanceId: 1,
    log: [],
    election: { turn: 12, runoff: false },
    duelists: {
      duelist1: createDuelist({ id: "duelist1", mandate: mandate1 }),
      duelist2: createDuelist({ id: "duelist2", mandate: mandate2 }),
    },
  };
}

describe("resolveInstantEffects", () => {
  it("applies change-mandate to the controller ('you')", () => {
    const state = createTestState();
    resolveInstantEffects(state, "duelist1", [
      { kind: "change-mandate", recipient: "you", amount: 5 },
    ]);
    expect(state.duelists.duelist1.mandate).toBe(25);
    expect(state.duelists.duelist2.mandate).toBe(20);
  });

  it("resolves 'opponent' relative to whoever played the card", () => {
    const state = createTestState();
    resolveInstantEffects(state, "duelist2", [
      { kind: "change-mandate", recipient: "opponent", amount: -3 },
    ]);
    expect(state.duelists.duelist1.mandate).toBe(17);
    expect(state.duelists.duelist2.mandate).toBe(20);
  });

  it("resolves multiple effects in order", () => {
    const state = createTestState();
    resolveInstantEffects(state, "duelist1", [
      { kind: "change-mandate", recipient: "you", amount: -2 },
      { kind: "change-mandate", recipient: "opponent", amount: -4 },
    ]);
    expect(state.duelists.duelist1.mandate).toBe(18);
    expect(state.duelists.duelist2.mandate).toBe(16);
  });

  it("floors Mandate at 0 and awards the duel to the controller when the opponent hits 0", () => {
    const state = createTestState(20, 3);
    resolveInstantEffects(state, "duelist1", [
      { kind: "change-mandate", recipient: "opponent", amount: -10 },
    ]);
    expect(state.duelists.duelist2.mandate).toBe(0);
    expect(state.winnerId).toBe("duelist1");
  });

  it("awards the duel to the opponent if a card brings its own controller to 0", () => {
    const state = createTestState(2, 20);
    resolveInstantEffects(state, "duelist1", [
      { kind: "change-mandate", recipient: "you", amount: -5 },
    ]);
    expect(state.duelists.duelist1.mandate).toBe(0);
    expect(state.winnerId).toBe("duelist2");
  });

  it("stops resolving once an effect has ended the duel", () => {
    const state = createTestState(20, 3);
    resolveInstantEffects(state, "duelist1", [
      { kind: "change-mandate", recipient: "opponent", amount: -3 },
      { kind: "change-mandate", recipient: "you", amount: 100 },
    ]);
    expect(state.winnerId).toBe("duelist1");
    expect(state.duelists.duelist1.mandate).toBe(20);
  });
});
