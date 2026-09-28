import { describe, expect, it } from "vitest";
import type { DuelistState } from "@duel-for-the-world/duel-engine";
import type { DuelPhase, DuelState, FieldActor, FieldPolicy } from "@duel-for-the-world/duel-engine";
import { LOG_EVENTS_SENT, redactStateFor } from "../redact";

function createDuelist(overrides: Partial<DuelistState> = {}): DuelistState {
  return {
    id: "duelist1",
    mandate: 20,
    deck: ["agitador", "agitador", "la-tribuna"],
    hand: ["agitador", "el-caudillo"],
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

function maletinOn(actorInstanceId: number): FieldPolicy {
  return {
    instanceId: 50,
    cardId: "maletin-de-sobornos",
    controllerId: "duelist1",
    zone: 1,
    faceDown: false,
    equippedToInstanceId: actorInstanceId,
  };
}

function createTestState(overrides: {
  phase?: DuelPhase;
  duelist1?: Partial<DuelistState>;
  duelist2?: Partial<DuelistState>;
} = {}): DuelState {
  return {
    turnNumber: 2,
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

describe("redactStateFor", () => {
  it("shows the viewer their own hand in full", () => {
    const state = createTestState();
    const view = redactStateFor(state, "duelist1");

    expect(view.duelists.duelist1.hand).toEqual(["agitador", "el-caudillo"]);
    expect(view.duelists.duelist1.handCount).toBe(2);
  });

  it("redacts the opponent's hand to a count only", () => {
    const state = createTestState();
    const view = redactStateFor(state, "duelist1");

    expect(view.duelists.duelist2.hand).toBeNull();
    expect(view.duelists.duelist2.handCount).toBe(2);
  });

  it("redacts both decks to counts, for either viewer, including the viewer's own", () => {
    const state = createTestState();
    const view = redactStateFor(state, "duelist1");

    expect(view.duelists.duelist1.deckCount).toBe(3);
    expect(view.duelists.duelist2.deckCount).toBe(3);
    expect((view.duelists.duelist1 as { deck?: unknown }).deck).toBeUndefined();
  });

  it("reveals a face-up Actor's identity to both viewers", () => {
    const state = createTestState({
      duelist1: {
        field: [createActor({ cardId: "la-tribuna", facing: "face-up" })],
      },
    });

    const asOwner = redactStateFor(state, "duelist1");
    const asOpponent = redactStateFor(state, "duelist2");

    expect(asOwner.duelists.duelist1.field[0].cardId).toBe("la-tribuna");
    expect(asOpponent.duelists.duelist1.field[0].cardId).toBe("la-tribuna");
  });

  it("carries turnDeployed through even for a hidden face-down Actor (it's not secret, only identity is)", () => {
    const state = createTestState({
      duelist1: {
        field: [
          createActor({
            cardId: "la-tribuna",
            stance: "resistance",
            facing: "face-down",
            turnDeployed: 2,
          }),
        ],
      },
    });

    const asOwner = redactStateFor(state, "duelist1");
    const asOpponent = redactStateFor(state, "duelist2");

    expect(asOwner.duelists.duelist1.field[0].turnDeployed).toBe(2);
    expect(asOpponent.duelists.duelist1.field[0].turnDeployed).toBe(2);
  });

  it("tells both viewers whether an Actor already changed stance this turn", () => {
    const state = createTestState({
      duelist1: {
        field: [
          createActor({ instanceId: 1, hasChangedStanceThisTurn: true }),
          createActor({ instanceId: 2, zone: 1, stance: "resistance", facing: "face-down" }),
        ],
      },
    });

    for (const viewer of ["duelist1", "duelist2"] as const) {
      const field = redactStateFor(state, viewer).duelists.duelist1.field;
      expect(field.map((actor) => actor.hasChangedStanceThisTurn)).toEqual([true, false]);
    }
  });

  it("sends a face-up Actor's effective stats, including Equip bonuses, plus its equips", () => {
    const state = createTestState({
      duelist1: {
        // agitador is ATK 3 / DEF 1 base; Maletin adds +2/+2.
        field: [createActor({ instanceId: 1, cardId: "agitador" })],
        backroomPolicies: [maletinOn(1)],
      },
    });

    const asOpponent = redactStateFor(state, "duelist2");
    const actor = asOpponent.duelists.duelist1.field[0];

    expect(actor.cardId).toBe("agitador");
    expect((actor as { atk: number }).atk).toBe(5);
    expect((actor as { def: number }).def).toBe(3);
    expect(actor.equippedPolicyIds).toEqual(["maletin-de-sobornos"]);
  });

  it("never sends stats for a hidden face-down Actor (they'd hint at its identity), but does show its equips", () => {
    const state = createTestState({
      duelist1: {
        field: [
          createActor({
            cardId: "el-caudillo",
            stance: "resistance",
            facing: "face-down",
          }),
        ],
        backroomPolicies: [maletinOn(1)],
      },
    });

    const asOpponent = redactStateFor(state, "duelist2");
    const hidden = asOpponent.duelists.duelist1.field[0] as Record<string, unknown>;

    expect(hidden.cardId).toBeNull();
    expect(hidden.atk).toBeUndefined();
    expect(hidden.def).toBeUndefined();
    expect(hidden.equippedPolicyIds).toEqual(["maletin-de-sobornos"]);
  });

  it("hides a face-down Resistance Actor's identity from the opponent, but not its controller", () => {
    const state = createTestState({
      duelist1: {
        field: [
          createActor({ cardId: "la-tribuna", stance: "resistance", facing: "face-down" }),
        ],
      },
    });

    const asOwner = redactStateFor(state, "duelist1");
    const asOpponent = redactStateFor(state, "duelist2");

    expect(asOwner.duelists.duelist1.field[0].cardId).toBe("la-tribuna");
    expect(asOpponent.duelists.duelist1.field[0].cardId).toBeNull();
    expect(asOpponent.duelists.duelist1.field[0].facing).toBe("face-down");
  });

  it("hides a Set Scandal's identity from the opponent, but not its controller", () => {
    const state = createTestState({
      duelist2: {
        setScandals: [
          { instanceId: 5, cardId: "escandalo-de-corrupcion", controllerId: "duelist2", zone: 0 },
        ],
      },
    });

    const asOwner = redactStateFor(state, "duelist2");
    const asOpponent = redactStateFor(state, "duelist1");

    expect(asOwner.duelists.duelist2.setScandals[0].cardId).toBe("escandalo-de-corrupcion");
    expect(asOpponent.duelists.duelist2.setScandals[0].cardId).toBeNull();
  });

  it("leaves the archive fully visible to both viewers", () => {
    const state = createTestState({
      duelist1: { archive: ["agitador"] },
    });

    const asOpponent = redactStateFor(state, "duelist2");

    expect(asOpponent.duelists.duelist1.archive).toEqual(["agitador"]);
  });

  it("carries top-level duel fields through unchanged", () => {
    const state = createTestState({ phase: "confrontation" });
    const view = redactStateFor(state, "duelist1");

    expect(view.turnNumber).toBe(2);
    expect(view.activeDuelistId).toBe("duelist1");
    expect(view.phase).toBe("confrontation");
    expect(view.winnerId).toBeNull();
  });

  it("tells both viewers which zone each field card is in (positions are public)", () => {
    const state = createTestState({
      duelist1: {
        field: [createActor({ zone: 3, stance: "resistance", facing: "face-down" })],
        setScandals: [{ instanceId: 8, cardId: "escandalo-de-corrupcion", controllerId: "duelist1", zone: 4 }],
      },
    });
    const asOpponent = redactStateFor(state, "duelist2");
    expect(asOpponent.duelists.duelist1.field[0].zone).toBe(3);
    expect(asOpponent.duelists.duelist1.setScandals[0].zone).toBe(4);
  });

  it("hides a face-down Set Policy from the opponent, but shows face-up Equips to both", () => {
    const state = createTestState({
      duelist1: {
        field: [createActor({ instanceId: 1 })],
        backroomPolicies: [
          { instanceId: 60, cardId: "decreto-de-emergencia", controllerId: "duelist1", zone: 0, faceDown: true, equippedToInstanceId: null },
          maletinOn(1),
        ],
      },
    });

    const asOwner = redactStateFor(state, "duelist1").duelists.duelist1.backroomPolicies;
    const asOpponent = redactStateFor(state, "duelist2").duelists.duelist1.backroomPolicies;

    expect(asOwner.map((p) => p.cardId)).toEqual(["decreto-de-emergencia", "maletin-de-sobornos"]);
    expect(asOpponent.map((p) => p.cardId)).toEqual([null, "maletin-de-sobornos"]);
    expect(asOpponent.map((p) => [p.zone, p.faceDown, p.equippedToInstanceId])).toEqual([
      [0, true, null],
      [1, false, 1],
    ]);
  });

  it("sends both viewers the same recent log events, capped at LOG_EVENTS_SENT", () => {
    const state = createTestState();
    for (let i = 1; i <= LOG_EVENTS_SENT + 5; i += 1) {
      state.log.push({ kind: "turn-started", duelistId: "duelist1", turn: i, seq: i });
    }
    const one = redactStateFor(state, "duelist1").log;
    const two = redactStateFor(state, "duelist2").log;
    expect(one).toEqual(two);
    expect(one).toHaveLength(LOG_EVENTS_SENT);
    expect(one[0].seq).toBe(6);
    expect(one.at(-1)?.seq).toBe(LOG_EVENTS_SENT + 5);
  });

  it("shows a hostile equip's stat change on the opponent's Actor, and lists it among that Actor's equips", () => {
    const state = createTestState({
      duelist1: {
        backroomPolicies: [
          {
            instanceId: 40,
            cardId: "campana-de-desprestigio",
            controllerId: "duelist1",
            zone: 2,
            faceDown: false,
            equippedToInstanceId: 7,
          },
        ],
      },
      duelist2: { field: [createActor({ instanceId: 7, cardId: "la-tribuna", controllerId: "duelist2" })] },
    });
    for (const viewer of ["duelist1", "duelist2"] as const) {
      const target = redactStateFor(state, viewer).duelists.duelist2.field[0];
      expect(target.equippedPolicyIds).toEqual(["campana-de-desprestigio"]);
      expect(target.cardId !== null && [target.atk, target.def]).toEqual([1, 2]);
    }
  });

  it("sends the election countdown, the live poll and rematch votes to both viewers", () => {
    const state = createTestState({
      duelist1: { mandate: 15, field: [createActor({ instanceId: 3, cardId: "la-tribuna" })] },
    });
    for (const viewer of ["duelist1", "duelist2"] as const) {
      const view = redactStateFor(state, viewer, { rematchVotes: ["duelist2"] });
      expect(view.election).toEqual({ turn: 12, runoff: false });
      expect(view.polls.duelist1).toEqual({ mandate: 15, campaign: 4, bonus: 0, total: 19 });
      expect(view.polls.duelist2.total).toBe(20);
      expect(view.rematchVotes).toEqual(["duelist2"]);
    }
  });

  it("the Algorithm Chairman (face-up) lets its controller see the opponent's hidden cards -- and only them", () => {
    const state = createTestState({
      duelist1: { field: [createActor({ instanceId: 1, cardId: "algorithm-chairman" })] },
      duelist2: {
        field: [createActor({ instanceId: 2, cardId: "riot-cop", controllerId: "duelist2", stance: "resistance", facing: "face-down" })],
        setScandals: [{ instanceId: 3, cardId: "hot-mic", controllerId: "duelist2", zone: 0 }],
        hand: ["protester"],
      },
    });
    const seer = redactStateFor(state, "duelist1").duelists.duelist2;
    expect(seer.field[0].cardId).toBe("riot-cop");
    expect(seer.setScandals[0].cardId).toBe("hot-mic");
    expect(seer.hand).toBeNull(); // hands stay hidden

    state.duelists.duelist1.field[0].facing = "face-down";
    state.duelists.duelist1.field[0].stance = "resistance";
    expect(redactStateFor(state, "duelist1").duelists.duelist2.field[0].cardId).toBeNull();
  });

  it("tells both viewers the room's edition (World by default)", () => {
    const state = createTestState();
    expect(redactStateFor(state, "duelist1").edition).toBe("world");
    expect(redactStateFor(state, "duelist2", { edition: "colombia" }).edition).toBe("colombia");
  });
});
