import { describe, expect, it } from "vitest";
import type { CardId } from "@project-palacio/duel-content";
import type { DuelistState } from "../../duelists/DuelistState";
import type { DuelPhase } from "../../duel/DuelPhase";
import type { DuelState } from "../../duel/DuelState";
import type { FieldActor } from "../../field/FieldActor";
import { activatePolicy, activateSetPolicy, setPolicy } from "../PolicySystem";
import { getEffectiveStats } from "../EffectiveStats";

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

function createTestState(overrides: {
  phase?: DuelPhase;
  hand?: CardId[];
  field?: FieldActor[];
} = {}): DuelState {
  return {
    turnNumber: 1,
    activeDuelistId: "duelist1",
    phase: overrides.phase ?? "campaign-1",
    winnerId: null,
    nextInstanceId: 1,
    log: [],
    election: { turn: 12, runoff: false },
    duelists: {
      duelist1: createDuelist({
        hand: overrides.hand ?? ["decreto-de-emergencia"],
        field: overrides.field ?? [],
      }),
      duelist2: createDuelist({ id: "duelist2" }),
    },
  };
}

describe("activatePolicy", () => {
  it("activates a Normal Policy for an instant Mandate gain, then archives it", () => {
    const state = createTestState({ hand: ["decreto-de-emergencia"] });

    const result = activatePolicy(state, "decreto-de-emergencia");

    expect(result).toEqual({ ok: true });
    expect(state.duelists.duelist1.hand).toEqual([]);
    expect(state.duelists.duelist1.archive).toEqual(["decreto-de-emergencia"]);
    // Decreto de Emergencia declares +5 Mandate on its card definition.
    expect(state.duelists.duelist1.mandate).toBe(25);
  });

  it("rejects activating outside a Campaign Phase", () => {
    const state = createTestState({ phase: "confrontation" });

    expect(activatePolicy(state, "decreto-de-emergencia")).toEqual({
      ok: false,
      reason: "wrong-phase",
    });
  });

  it("rejects a Policy card that isn't in hand", () => {
    const state = createTestState({ hand: [] });

    expect(activatePolicy(state, "decreto-de-emergencia")).toEqual({
      ok: false,
      reason: "card-not-in-hand",
    });
  });

  it("equips an Equip Policy onto an owned field Actor, boosting its effective stats", () => {
    const state = createTestState({
      hand: ["maletin-de-sobornos"],
      field: [createActor({ instanceId: 5 })], // agitador: atk 3 / def 1
    });

    const result = activatePolicy(state, "maletin-de-sobornos", {
      targetInstanceId: 5,
    });

    expect(result).toEqual({ ok: true });
    expect(state.duelists.duelist1.hand).toEqual([]);
    // An equip stays on the field -- face-up in a Backroom zone, attached
    // to its Actor -- rather than going to the archive.
    expect(state.duelists.duelist1.archive).toEqual([]);
    expect(state.duelists.duelist1.backroomPolicies).toEqual([
      {
        instanceId: 1,
        cardId: "maletin-de-sobornos",
        controllerId: "duelist1",
        zone: 0,
        faceDown: false,
        equippedToInstanceId: 5,
      },
    ]);

    const equipped = state.duelists.duelist1.field[0];
    expect(getEffectiveStats(equipped, state)).toEqual({ atk: 5, def: 3 });
  });

  it("puts an equip activated from hand into the requested Backroom zone", () => {
    const state = createTestState({ hand: ["maletin-de-sobornos"], field: [createActor({ instanceId: 5 })] });
    expect(activatePolicy(state, "maletin-de-sobornos", { targetInstanceId: 5, zone: 3 })).toEqual({ ok: true });
    expect(state.duelists.duelist1.backroomPolicies[0].zone).toBe(3);
  });

  it("rejects an equip when every Backroom zone is taken (Scandals count too)", () => {
    const state = createTestState({ hand: ["maletin-de-sobornos"], field: [createActor({ instanceId: 5 })] });
    state.duelists.duelist1.setScandals = [0, 1, 2, 3, 4].map((zone) => ({
      instanceId: 20 + zone,
      cardId: "escandalo-de-corrupcion" as const,
      controllerId: "duelist1" as const,
      zone,
    }));
    expect(activatePolicy(state, "maletin-de-sobornos", { targetInstanceId: 5 })).toEqual({
      ok: false,
      reason: "backroom-full",
    });
    expect(state.duelists.duelist1.hand).toEqual(["maletin-de-sobornos"]);
  });

  it("rejects an Equip Policy with no target specified", () => {
    const state = createTestState({
      hand: ["maletin-de-sobornos"],
      field: [createActor({ instanceId: 5 })],
    });

    expect(activatePolicy(state, "maletin-de-sobornos")).toEqual({
      ok: false,
      reason: "target-required",
    });
  });

  it("rejects an Equip Policy targeting an Actor the active duelist doesn't control", () => {
    const state = createTestState({ hand: ["maletin-de-sobornos"] });

    expect(
      activatePolicy(state, "maletin-de-sobornos", { targetInstanceId: 999 }),
    ).toEqual({ ok: false, reason: "target-not-owned" });
  });

  it("rejects activating a non-Policy card, even one that's in hand, without touching state", () => {
    const state = createTestState({ hand: ["agitador"] });

    expect(activatePolicy(state, "agitador" as never)).toEqual({
      ok: false,
      reason: "not-a-policy",
    });
    expect(state.duelists.duelist1.hand).toEqual(["agitador"]);
    expect(state.duelists.duelist1.mandate).toBe(20);
  });
});

describe("setPolicy", () => {
  it("Sets a Policy face-down in a Backroom zone without using it", () => {
    const state = createTestState({ hand: ["decreto-de-emergencia"] });

    expect(setPolicy(state, "decreto-de-emergencia", 2)).toEqual({ ok: true });

    const duelist = state.duelists.duelist1;
    expect(duelist.hand).toEqual([]);
    expect(duelist.mandate).toBe(20); // not resolved
    expect(duelist.backroomPolicies).toEqual([
      {
        instanceId: 1,
        cardId: "decreto-de-emergencia",
        controllerId: "duelist1",
        zone: 2,
        faceDown: true,
        equippedToInstanceId: null,
      },
    ]);
  });

  it("shares zones with Set Scandals", () => {
    const state = createTestState({ hand: ["decreto-de-emergencia"] });
    state.duelists.duelist1.setScandals = [
      { instanceId: 9, cardId: "escandalo-de-corrupcion", controllerId: "duelist1", zone: 0 },
    ];
    expect(setPolicy(state, "decreto-de-emergencia", 0)).toEqual({ ok: false, reason: "zone-occupied" });
    expect(setPolicy(state, "decreto-de-emergencia")).toEqual({ ok: true });
    expect(state.duelists.duelist1.backroomPolicies[0].zone).toBe(1);
  });

  it("rejects outside a Campaign Phase, for non-Policies, and for cards not in hand", () => {
    expect(setPolicy(createTestState({ phase: "confrontation" }), "decreto-de-emergencia")).toEqual({
      ok: false,
      reason: "wrong-phase",
    });
    expect(setPolicy(createTestState({ hand: ["agitador"] }), "agitador" as never)).toEqual({
      ok: false,
      reason: "not-a-policy",
    });
    expect(setPolicy(createTestState({ hand: [] }), "decreto-de-emergencia")).toEqual({
      ok: false,
      reason: "card-not-in-hand",
    });
  });
});

describe("activateSetPolicy", () => {
  function withSet(cardId: "decreto-de-emergencia" | "maletin-de-sobornos", field: FieldActor[] = []) {
    const state = createTestState({ hand: [cardId], field });
    setPolicy(state, cardId, 3);
    return { state, instanceId: state.duelists.duelist1.backroomPolicies[0].instanceId };
  }

  it("resolves a Set Normal Policy, frees its zone, and archives it", () => {
    const { state, instanceId } = withSet("decreto-de-emergencia");

    expect(activateSetPolicy(state, instanceId)).toEqual({ ok: true });

    expect(state.duelists.duelist1.mandate).toBe(25);
    expect(state.duelists.duelist1.backroomPolicies).toEqual([]);
    expect(state.duelists.duelist1.archive).toEqual(["decreto-de-emergencia"]);
  });

  it("flips a Set Equip face-up in its own zone, attached to the chosen Actor", () => {
    const { state, instanceId } = withSet("maletin-de-sobornos", [createActor({ instanceId: 5 })]);

    expect(activateSetPolicy(state, instanceId, { targetInstanceId: 5 })).toEqual({ ok: true });

    const policy = state.duelists.duelist1.backroomPolicies[0];
    expect(policy.faceDown).toBe(false);
    expect(policy.zone).toBe(3);
    expect(policy.equippedToInstanceId).toBe(5);
    expect(getEffectiveStats(state.duelists.duelist1.field[0], state)).toEqual({ atk: 5, def: 3 });
  });

  it("needs a valid target for a Set Equip, leaving it face-down otherwise", () => {
    const { state, instanceId } = withSet("maletin-de-sobornos", [createActor({ instanceId: 5 })]);

    expect(activateSetPolicy(state, instanceId)).toEqual({ ok: false, reason: "target-required" });
    expect(activateSetPolicy(state, instanceId, { targetInstanceId: 99 })).toEqual({
      ok: false,
      reason: "target-not-owned",
    });
    expect(state.duelists.duelist1.backroomPolicies[0].faceDown).toBe(true);
  });

  it("only activates your own face-down Set Policies", () => {
    const { state, instanceId } = withSet("decreto-de-emergencia");
    expect(activateSetPolicy(state, 12345)).toEqual({ ok: false, reason: "set-policy-not-found" });

    activateSetPolicy(state, instanceId);
    // Already used: it's gone from the Backroom.
    expect(activateSetPolicy(state, instanceId)).toEqual({ ok: false, reason: "set-policy-not-found" });
  });

  it("rejects outside a Campaign Phase", () => {
    const { state, instanceId } = withSet("decreto-de-emergencia");
    state.phase = "confrontation";
    expect(activateSetPolicy(state, instanceId)).toEqual({ ok: false, reason: "wrong-phase" });
  });
});
