import { describe, expect, it } from "vitest";
import type { CardId } from "@project-palacio/duel-content";
import type { DuelistState } from "../../duelists/DuelistState";
import type { DuelPhase } from "../../duel/DuelPhase";
import type { DuelState } from "../../duel/DuelState";
import { setScandal } from "../ScandalSystem";

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

function createTestState(overrides: {
  phase?: DuelPhase;
  hand?: CardId[];
  hasSetScandalThisTurn?: boolean;
} = {}): DuelState {
  return {
    turnNumber: 1,
    activeDuelistId: "duelist1",
    phase: overrides.phase ?? "campaign-1",
    winnerId: null,
    nextInstanceId: 7,
    log: [],
    election: { turn: 12, runoff: false },
    duelists: {
      duelist1: createDuelist({
        hand: overrides.hand ?? ["escandalo-de-corrupcion"],
        hasSetScandalThisTurn: overrides.hasSetScandalThisTurn ?? false,
      }),
      duelist2: createDuelist({ id: "duelist2" }),
    },
  };
}

describe("setScandal", () => {
  it("sets a Scandal card face-down on the field", () => {
    const state = createTestState();

    const result = setScandal(state, "escandalo-de-corrupcion");

    expect(result).toEqual({ ok: true });
    expect(state.duelists.duelist1.hand).toEqual([]);
    expect(state.duelists.duelist1.setScandals).toEqual([
      { instanceId: 7, cardId: "escandalo-de-corrupcion", controllerId: "duelist1", zone: 0 },
    ]);
    expect(state.nextInstanceId).toBe(8);
    expect(state.duelists.duelist1.hasSetScandalThisTurn).toBe(true);
  });

  it("rejects Setting outside a Campaign Phase", () => {
    const state = createTestState({ phase: "confrontation" });

    expect(setScandal(state, "escandalo-de-corrupcion")).toEqual({
      ok: false,
      reason: "wrong-phase",
    });
  });

  it("rejects a second Set in the same turn", () => {
    const state = createTestState({ hasSetScandalThisTurn: true });

    expect(setScandal(state, "escandalo-de-corrupcion")).toEqual({
      ok: false,
      reason: "already-set-this-turn",
    });
  });

  it("rejects a Scandal card that isn't in hand", () => {
    const state = createTestState({ hand: [] });

    expect(setScandal(state, "escandalo-de-corrupcion")).toEqual({
      ok: false,
      reason: "card-not-in-hand",
    });
  });

  it("rejects Setting a non-Scandal card, even one that's in hand, without touching state", () => {
    const state = createTestState({ hand: ["agitador"] });

    expect(setScandal(state, "agitador" as never)).toEqual({
      ok: false,
      reason: "not-a-scandal",
    });
    expect(state.duelists.duelist1.setScandals).toHaveLength(0);
    expect(state.duelists.duelist1.hand).toEqual(["agitador"]);
  });

  describe("Backroom zones", () => {
    const setIn = (zone: number) => ({
      instanceId: 50 + zone,
      cardId: "escandalo-de-corrupcion" as const,
      controllerId: "duelist1" as const,
      zone,
    });

    it("Sets into the requested zone", () => {
      const state = createTestState();
      expect(setScandal(state, "escandalo-de-corrupcion", 4)).toEqual({ ok: true });
      expect(state.duelists.duelist1.setScandals[0].zone).toBe(4);
    });

    it("defaults to the first free zone", () => {
      const state = createTestState();
      state.duelists.duelist1.setScandals = [setIn(0), setIn(1)];
      setScandal(state, "escandalo-de-corrupcion");
      expect(state.duelists.duelist1.setScandals[2].zone).toBe(2);
    });

    it("rejects an occupied or invalid zone", () => {
      const occupied = createTestState();
      occupied.duelists.duelist1.setScandals = [setIn(2)];
      expect(setScandal(occupied, "escandalo-de-corrupcion", 2)).toEqual({ ok: false, reason: "zone-occupied" });
      expect(occupied.duelists.duelist1.hand).toEqual(["escandalo-de-corrupcion"]);

      expect(setScandal(createTestState(), "escandalo-de-corrupcion", 9)).toEqual({ ok: false, reason: "invalid-zone" });
    });

    it("rejects Setting when the Backroom is full", () => {
      const state = createTestState();
      state.duelists.duelist1.setScandals = [0, 1, 2, 3, 4].map(setIn);
      expect(setScandal(state, "escandalo-de-corrupcion")).toEqual({ ok: false, reason: "backroom-full" });
    });
  });
});
