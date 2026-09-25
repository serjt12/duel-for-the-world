import { describe, expect, it } from "vitest";
import type { DuelistState } from "../../duelists/DuelistState";
import type { DuelPhase } from "../../duel/DuelPhase";
import type { DuelState } from "../../duel/DuelState";
import type { FieldActor } from "../../field/FieldActor";
import { declareAttack } from "../BattleSystem";
import { changeStance } from "../StanceSystem";
import { advancePhase } from "../TurnSystem";

function createDuelist(overrides: Partial<DuelistState> = {}): DuelistState {
  return {
    id: "duelist1",
    mandate: 20,
    deck: ["agitador", "agitador", "agitador"],
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

function createActor(overrides: Partial<FieldActor> = {}): FieldActor {
  return {
    instanceId: 1,
    cardId: "agitador",
    controllerId: "duelist1",
    zone: 0,
    stance: "campaign",
    facing: "face-up",
    turnDeployed: 1,
    hasAttackedThisTurn: false,
    hasChangedStanceThisTurn: false,
    ...overrides,
  };
}

function createTestState(overrides: {
  phase?: DuelPhase;
  turnNumber?: number;
  duelist1?: Partial<DuelistState>;
  duelist2?: Partial<DuelistState>;
} = {}): DuelState {
  return {
    turnNumber: overrides.turnNumber ?? 3,
    activeDuelistId: "duelist1",
    phase: overrides.phase ?? "campaign-1",
    winnerId: null,
    nextInstanceId: 10,
    log: [],
    election: { turn: 12, runoff: false },
    duelists: {
      duelist1: createDuelist({ id: "duelist1", ...overrides.duelist1 }),
      duelist2: createDuelist({ id: "duelist2", ...overrides.duelist2 }),
    },
  };
}

describe("changeStance", () => {
  it("switches a Campaign Actor to face-up Resistance", () => {
    const state = createTestState({ duelist1: { field: [createActor()] } });

    expect(changeStance(state, 1)).toEqual({ ok: true });

    const actor = state.duelists.duelist1.field[0];
    expect(actor.stance).toBe("resistance");
    expect(actor.facing).toBe("face-up");
    expect(actor.hasChangedStanceThisTurn).toBe(true);
  });

  it("switches a face-up Resistance Actor to Campaign", () => {
    const state = createTestState({
      duelist1: { field: [createActor({ stance: "resistance", facing: "face-up" })] },
    });

    expect(changeStance(state, 1)).toEqual({ ok: true });
    expect(state.duelists.duelist1.field[0].stance).toBe("campaign");
    expect(state.duelists.duelist1.field[0].facing).toBe("face-up");
  });

  it("flips a face-down Resistance Actor face-up into Campaign", () => {
    const state = createTestState({
      duelist1: { field: [createActor({ stance: "resistance", facing: "face-down" })] },
    });

    expect(changeStance(state, 1)).toEqual({ ok: true });
    expect(state.duelists.duelist1.field[0].stance).toBe("campaign");
    expect(state.duelists.duelist1.field[0].facing).toBe("face-up");
  });

  it("works in Campaign Phase 2 as well", () => {
    const state = createTestState({ phase: "campaign-2", duelist1: { field: [createActor()] } });

    expect(changeStance(state, 1)).toEqual({ ok: true });
  });

  for (const phase of ["agenda", "confrontation", "recess"] as const) {
    it(`is rejected in the ${phase} phase`, () => {
      const state = createTestState({ phase, duelist1: { field: [createActor()] } });

      expect(changeStance(state, 1)).toEqual({ ok: false, reason: "wrong-phase" });
      expect(state.duelists.duelist1.field[0].stance).toBe("campaign");
    });
  }

  it("rejects an Actor the active duelist doesn't control", () => {
    const state = createTestState({
      duelist2: { field: [createActor({ instanceId: 5, controllerId: "duelist2" })] },
    });

    expect(changeStance(state, 5)).toEqual({ ok: false, reason: "actor-not-owned" });
    expect(state.duelists.duelist2.field[0].stance).toBe("campaign");
  });

  it("rejects an unknown or malformed instance id", () => {
    const state = createTestState({ duelist1: { field: [createActor()] } });

    expect(changeStance(state, 999)).toEqual({ ok: false, reason: "actor-not-owned" });
    expect(changeStance(state, "1" as unknown as number)).toEqual({
      ok: false,
      reason: "actor-not-owned",
    });
  });

  it("rejects an Actor deployed this turn", () => {
    const state = createTestState({
      turnNumber: 3,
      duelist1: { field: [createActor({ turnDeployed: 3 })] },
    });

    expect(changeStance(state, 1)).toEqual({ ok: false, reason: "deployed-this-turn" });
  });

  it("rejects an Actor that already attacked this turn", () => {
    const state = createTestState({
      phase: "campaign-2",
      duelist1: { field: [createActor({ hasAttackedThisTurn: true })] },
    });

    expect(changeStance(state, 1)).toEqual({ ok: false, reason: "attacked-this-turn" });
  });

  it("allows only one change per Actor per turn", () => {
    const state = createTestState({ duelist1: { field: [createActor()] } });

    expect(changeStance(state, 1)).toEqual({ ok: true });
    expect(changeStance(state, 1)).toEqual({ ok: false, reason: "already-changed-stance" });
    expect(state.duelists.duelist1.field[0].stance).toBe("resistance");
  });

  it("lets every eligible Actor change once in the same turn", () => {
    const state = createTestState({
      duelist1: {
        field: [createActor({ instanceId: 1 }), createActor({ instanceId: 2, zone: 1 })],
      },
    });

    expect(changeStance(state, 1)).toEqual({ ok: true });
    expect(changeStance(state, 2)).toEqual({ ok: true });
  });

  it("lets a flipped-to-Campaign Actor attack in the following Confrontation Phase", () => {
    const state = createTestState({
      duelist1: {
        field: [createActor({ cardId: "la-tribuna", stance: "resistance", facing: "face-down" })],
      },
    });

    expect(changeStance(state, 1)).toEqual({ ok: true });
    advancePhase(state); // -> confrontation

    const result = declareAttack(state, 1);
    expect(result.ok).toBe(true);
    expect(state.duelists.duelist2.mandate).toBe(16);
  });

  it("can change again on its controller's next turn", () => {
    const state = createTestState({ duelist1: { field: [createActor()] } });

    expect(changeStance(state, 1)).toEqual({ ok: true });

    // Finish duelist1's turn and all of duelist2's turn, then enter
    // duelist1's Campaign Phase 1 again.
    for (let i = 0; i < 4 + 5 + 1; i += 1) {
      advancePhase(state);
    }
    expect(state.activeDuelistId).toBe("duelist1");
    expect(state.phase).toBe("campaign-1");

    expect(changeStance(state, 1)).toEqual({ ok: true });
    expect(state.duelists.duelist1.field[0].stance).toBe("campaign");
  });
});
