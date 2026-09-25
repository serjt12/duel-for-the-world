import { describe, expect, it } from "vitest";
import type { DuelistState } from "../../duelists/DuelistState";
import type { DuelPhase } from "../../duel/DuelPhase";
import type { DuelState } from "../../duel/DuelState";
import type { FieldActor } from "../../field/FieldActor";
import type { FieldPolicy } from "../../field/FieldPolicy";
import { declareAttack } from "../BattleSystem";

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

// A face-up Maletin de Sobornos in a Backroom zone, attached to an Actor.
function maletinOn(actorInstanceId: number, controllerId: "duelist1" | "duelist2" = "duelist1"): FieldPolicy {
  return {
    instanceId: 100 + actorInstanceId,
    cardId: "maletin-de-sobornos",
    controllerId,
    zone: 0,
    faceDown: false,
    equippedToInstanceId: actorInstanceId,
  };
}

function createTestState(overrides: {
  phase?: DuelPhase;
  turnNumber?: number;
  duelist1?: Partial<DuelistState>;
  duelist2?: Partial<DuelistState>;
} = {}): DuelState {
  return {
    turnNumber: overrides.turnNumber ?? 2,
    activeDuelistId: "duelist1",
    phase: overrides.phase ?? "confrontation",
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

describe("declareAttack", () => {
  it("hits Mandate directly when the opponent controls no Actors", () => {
    const state = createTestState({
      duelist1: {
        field: [createActor({ instanceId: 1, cardId: "la-tribuna" })], // atk 4
      },
    });

    const result = declareAttack(state, 1);

    expect(result).toEqual({
      ok: true,
      outcome: { attackerDestroyed: false, defenderDestroyed: false, mandateDamage: 4 },
    });
    expect(state.duelists.duelist2.mandate).toBe(16);
    expect(state.duelists.duelist1.field[0].hasAttackedThisTurn).toBe(true);
  });

  it("clamps Mandate damage at 0 rather than going negative", () => {
    const state = createTestState({
      duelist1: {
        field: [createActor({ instanceId: 1, cardId: "la-tribuna" })], // atk 4
      },
      duelist2: { mandate: 2 },
    });

    declareAttack(state, 1);

    expect(state.duelists.duelist2.mandate).toBe(0);
  });

  it("wins the duel for the attacker when the defending Mandate hits 0", () => {
    const state = createTestState({
      duelist1: {
        field: [createActor({ instanceId: 1, cardId: "la-tribuna" })], // atk 4
      },
      duelist2: { mandate: 4 },
    });

    declareAttack(state, 1);

    expect(state.duelists.duelist2.mandate).toBe(0);
    expect(state.winnerId).toBe("duelist1");
  });

  it("Campaign vs Campaign: higher ATK destroys the target and deals the ATK difference as Mandate damage", () => {
    const state = createTestState({
      duelist1: {
        field: [createActor({ instanceId: 1, cardId: "la-tribuna" })], // atk 4
      },
      duelist2: {
        field: [
          createActor({
            instanceId: 2,
            cardId: "agitador", // atk 3
            controllerId: "duelist2",
          }),
        ],
      },
    });

    const result = declareAttack(state, 1, 2);

    expect(result).toEqual({
      ok: true,
      outcome: { attackerDestroyed: false, defenderDestroyed: true, mandateDamage: 1 },
    });
    expect(state.duelists.duelist2.field).toEqual([]);
    expect(state.duelists.duelist2.archive).toEqual(["agitador"]);
    expect(state.duelists.duelist2.mandate).toBe(19);
    expect(state.duelists.duelist1.field).toHaveLength(1);
  });

  it("Campaign vs Campaign: a losing attacker is destroyed with no Mandate damage to either side", () => {
    const state = createTestState({
      duelist1: {
        field: [createActor({ instanceId: 1, cardId: "agitador" })], // atk 3
      },
      duelist2: {
        field: [
          createActor({
            instanceId: 2,
            cardId: "la-tribuna", // atk 4
            controllerId: "duelist2",
          }),
        ],
      },
    });

    const result = declareAttack(state, 1, 2);

    expect(result).toEqual({
      ok: true,
      outcome: { attackerDestroyed: true, defenderDestroyed: false, mandateDamage: 0 },
    });
    expect(state.duelists.duelist1.field).toEqual([]);
    expect(state.duelists.duelist1.archive).toEqual(["agitador"]);
    expect(state.duelists.duelist2.field).toHaveLength(1);
    expect(state.duelists.duelist1.mandate).toBe(20);
    expect(state.duelists.duelist2.mandate).toBe(20);
  });

  it("Campaign vs Campaign: a tie destroys both with no Mandate damage", () => {
    const state = createTestState({
      duelist1: {
        field: [createActor({ instanceId: 1, cardId: "agitador" })], // atk 3
      },
      duelist2: {
        field: [
          createActor({
            instanceId: 2,
            cardId: "operador-politico", // atk 3
            controllerId: "duelist2",
          }),
        ],
      },
    });

    const result = declareAttack(state, 1, 2);

    expect(result).toEqual({
      ok: true,
      outcome: { attackerDestroyed: true, defenderDestroyed: true, mandateDamage: 0 },
    });
    expect(state.duelists.duelist1.field).toEqual([]);
    expect(state.duelists.duelist2.field).toEqual([]);
  });

  it("vs Resistance Stance: ATK > DEF destroys the target with no Mandate damage, and flips it face-up", () => {
    const state = createTestState({
      duelist1: {
        field: [createActor({ instanceId: 1, cardId: "la-tribuna" })], // atk 4
      },
      duelist2: {
        field: [
          createActor({
            instanceId: 2,
            cardId: "agitador", // def 1
            controllerId: "duelist2",
            zone: 0,
            stance: "resistance",
            facing: "face-down",
          }),
        ],
      },
    });

    const result = declareAttack(state, 1, 2);

    expect(result).toEqual({
      ok: true,
      outcome: { attackerDestroyed: false, defenderDestroyed: true, mandateDamage: 0 },
    });
    expect(state.duelists.duelist2.field).toEqual([]);
    expect(state.duelists.duelist2.mandate).toBe(20);
  });

  it("vs Resistance Stance: ATK < DEF destroys the attacker instead, target still flips face-up", () => {
    const state = createTestState({
      duelist1: {
        field: [createActor({ instanceId: 1, cardId: "agitador" })], // atk 3
      },
      duelist2: {
        field: [
          createActor({
            instanceId: 2,
            cardId: "fiscal-de-barrio", // def 5
            controllerId: "duelist2",
            zone: 0,
            stance: "resistance",
            facing: "face-down",
          }),
        ],
      },
    });

    const result = declareAttack(state, 1, 2);

    expect(result).toEqual({
      ok: true,
      outcome: { attackerDestroyed: true, defenderDestroyed: false, mandateDamage: 0 },
    });
    expect(state.duelists.duelist1.field).toEqual([]);
    expect(state.duelists.duelist2.field[0].facing).toBe("face-up");
  });

  it("vs Resistance Stance: ATK === DEF destroys neither, but still flips the target face-up", () => {
    const state = createTestState({
      duelist1: {
        field: [createActor({ instanceId: 1, cardId: "operador-politico" })], // atk 3
      },
      duelist2: {
        field: [
          createActor({
            instanceId: 2,
            cardId: "operador-politico", // def 3
            controllerId: "duelist2",
            zone: 0,
            stance: "resistance",
            facing: "face-down",
          }),
        ],
      },
    });

    const result = declareAttack(state, 1, 2);

    expect(result).toEqual({
      ok: true,
      outcome: { attackerDestroyed: false, defenderDestroyed: false, mandateDamage: 0 },
    });
    expect(state.duelists.duelist1.field).toHaveLength(1);
    expect(state.duelists.duelist2.field).toHaveLength(1);
    expect(state.duelists.duelist2.field[0].facing).toBe("face-up");
  });

  it("rejects attacking outside the Confrontation Phase", () => {
    const state = createTestState({
      phase: "campaign-1",
      duelist1: { field: [createActor({ instanceId: 1 })] },
    });

    expect(declareAttack(state, 1)).toEqual({ ok: false, reason: "wrong-phase" });
  });

  it("rejects an attackerInstanceId the active duelist doesn't control", () => {
    const state = createTestState();

    expect(declareAttack(state, 999)).toEqual({
      ok: false,
      reason: "attacker-not-owned",
    });
  });

  it("rejects attacking with an Actor in Resistance Stance", () => {
    const state = createTestState({
      duelist1: {
        field: [createActor({ instanceId: 1, stance: "resistance" })],
      },
    });

    expect(declareAttack(state, 1)).toEqual({
      ok: false,
      reason: "attacker-not-in-campaign-stance",
    });
  });

  it("rejects attacking the same turn the Actor was deployed", () => {
    const state = createTestState({
      turnNumber: 1,
      duelist1: { field: [createActor({ instanceId: 1, turnDeployed: 1 })] },
    });

    expect(declareAttack(state, 1)).toEqual({
      ok: false,
      reason: "attacker-deployed-this-turn",
    });
  });

  it("rejects attacking twice in the same turn", () => {
    const state = createTestState({
      duelist1: {
        field: [createActor({ instanceId: 1, hasAttackedThisTurn: true })],
      },
    });

    expect(declareAttack(state, 1)).toEqual({
      ok: false,
      reason: "attacker-already-attacked",
    });
  });

  it("rejects a targetInstanceId that isn't one of the opponent's Actors", () => {
    const state = createTestState({
      duelist1: {
        field: [createActor({ instanceId: 1 }), createActor({ instanceId: 3 })],
      },
    });

    expect(declareAttack(state, 1, 3)).toEqual({
      ok: false,
      reason: "target-not-owned-by-opponent",
    });
  });

  it("Escandalo de Corrupcion: a Set Scandal destroys the attacker before damage when its Actor is targeted", () => {
    const state = createTestState({
      duelist1: {
        field: [createActor({ instanceId: 1, cardId: "la-tribuna" })], // atk 4
      },
      duelist2: {
        field: [createActor({ instanceId: 2, cardId: "agitador", controllerId: "duelist2" })],
        setScandals: [
          { instanceId: 9, cardId: "escandalo-de-corrupcion", controllerId: "duelist2", zone: 0 },
        ],
      },
    });

    const result = declareAttack(state, 1, 2);

    expect(result).toEqual({
      ok: true,
      outcome: { attackerDestroyed: true, defenderDestroyed: false, mandateDamage: 0 },
    });
    expect(state.duelists.duelist1.field).toEqual([]);
    expect(state.duelists.duelist1.archive).toEqual(["la-tribuna"]);
    // The targeted Actor survives untouched -- the Scandal intercepted
    // the attack rather than the two sides fighting it out.
    expect(state.duelists.duelist2.field).toHaveLength(1);
    // The Scandal is spent: consumed off the field and into the archive.
    expect(state.duelists.duelist2.setScandals).toEqual([]);
    expect(state.duelists.duelist2.archive).toEqual(["escandalo-de-corrupcion"]);
  });

  it("a Maletin de Sobornos equip raises its Actor's effective ATK in combat", () => {
    const state = createTestState({
      duelist1: {
        field: [
          createActor({
            instanceId: 1,
            cardId: "agitador", // base atk 3, +2 equipped = 5
          }),
        ],
        backroomPolicies: [maletinOn(1)],
      },
    });

    const result = declareAttack(state, 1);

    expect(result).toEqual({
      ok: true,
      outcome: { attackerDestroyed: false, defenderDestroyed: false, mandateDamage: 5 },
    });
    expect(state.duelists.duelist2.mandate).toBe(15);
  });

  it("rejects a direct attack while the opponent still controls an Actor", () => {
    const state = createTestState({
      duelist1: { field: [createActor({ instanceId: 1 })] },
      duelist2: {
        field: [createActor({ instanceId: 2, controllerId: "duelist2" })],
      },
    });

    expect(declareAttack(state, 1)).toEqual({
      ok: false,
      reason: "must-target-when-opponent-has-actors",
    });
  });

  // Regression: an Actor leaving the field used to archive only itself,
  // so any Equip attached to it vanished from the game entirely.
  it("sends an equipped Actor's Equips to the archive with it when destroyed in battle", () => {
    const state = createTestState({
      duelist1: { field: [createActor({ instanceId: 1, cardId: "el-caudillo" })] }, // atk 7
      duelist2: {
        field: [
          createActor({
            instanceId: 2,
            cardId: "agitador", // atk 3 (+2 = 5)
            controllerId: "duelist2",
          }),
        ],
        backroomPolicies: [maletinOn(2, "duelist2")],
      },
    });

    declareAttack(state, 1, 2);

    expect(state.duelists.duelist2.field).toHaveLength(0);
    expect(state.duelists.duelist2.archive).toEqual(["agitador", "maletin-de-sobornos"]);
    expect(state.duelists.duelist2.backroomPolicies).toHaveLength(0); // its zone is freed
  });

  it("archives the attacker's Equips too when a Scandal destroys it", () => {
    const state = createTestState({
      duelist1: {
        field: [createActor({ instanceId: 1 })],
        backroomPolicies: [maletinOn(1)],
      },
      duelist2: {
        field: [createActor({ instanceId: 2, cardId: "fiscal-de-barrio", controllerId: "duelist2" })],
        setScandals: [
          { instanceId: 5, cardId: "escandalo-de-corrupcion", controllerId: "duelist2", zone: 0 },
        ],
      },
    });

    declareAttack(state, 1, 2);

    expect(state.duelists.duelist1.field).toHaveLength(0);
    expect(state.duelists.duelist1.archive).toEqual(["agitador", "maletin-de-sobornos"]);
    expect(state.duelists.duelist1.backroomPolicies).toHaveLength(0);
    expect(state.duelists.duelist2.archive).toEqual(["escandalo-de-corrupcion"]);
    expect(state.duelists.duelist2.setScandals).toHaveLength(0);
  });

  it("marks the attacker as having attacked even when a Scandal destroys it", () => {
    const state = createTestState({
      duelist1: { field: [createActor({ instanceId: 1 }), createActor({ instanceId: 3 })] },
      duelist2: {
        field: [createActor({ instanceId: 2, cardId: "fiscal-de-barrio", controllerId: "duelist2" })],
        setScandals: [
          { instanceId: 5, cardId: "escandalo-de-corrupcion", controllerId: "duelist2", zone: 0 },
        ],
      },
    });

    const result = declareAttack(state, 1, 2);

    expect(result).toEqual({
      ok: true,
      outcome: { attackerDestroyed: true, defenderDestroyed: false, mandateDamage: 0 },
    });
    // The Scandal is spent: a second attack goes through normally.
    expect(state.duelists.duelist2.setScandals).toHaveLength(0);
  });
});
