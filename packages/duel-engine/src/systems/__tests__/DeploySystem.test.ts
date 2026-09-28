import { describe, expect, it } from "vitest";
import type { CardId } from "@duel-for-the-world/duel-content";
import type { DuelistState } from "../../duelists/DuelistState";
import type { DuelPhase } from "../../duel/DuelPhase";
import type { DuelState } from "../../duel/DuelState";
import type { FieldActor } from "../../field/FieldActor";
import { deployActor } from "../DeploySystem";

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
  field?: FieldActor[];
  hasNormalDeployedThisTurn?: boolean;
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
        hand: overrides.hand ?? ["agitador"],
        field: overrides.field ?? [],
        hasNormalDeployedThisTurn: overrides.hasNormalDeployedThisTurn ?? false,
      }),
      duelist2: createDuelist({ id: "duelist2" }),
    },
  };
}

describe("deployActor", () => {
  it("deploys a Grassroots Actor in Campaign Stance face-up", () => {
    const state = createTestState();

    const result = deployActor(state, "agitador", {
      stance: "campaign",
      facing: "face-up",
    });

    expect(result).toEqual({ ok: true });
    expect(state.duelists.duelist1.hand).toEqual([]);
    expect(state.duelists.duelist1.field).toHaveLength(1);

    const deployed = state.duelists.duelist1.field[0];

    expect(deployed.cardId).toBe("agitador");
    expect(deployed.controllerId).toBe("duelist1");
    expect(deployed.stance).toBe("campaign");
    expect(deployed.facing).toBe("face-up");
    expect(deployed.turnDeployed).toBe(1);
    expect(deployed.hasAttackedThisTurn).toBe(false);
    expect(deployed.instanceId).toBe(1);
    expect(state.nextInstanceId).toBe(2);
    expect(state.duelists.duelist1.hasNormalDeployedThisTurn).toBe(true);
  });

  it("deploys a Grassroots Actor in Resistance Stance face-down", () => {
    const state = createTestState();

    const result = deployActor(state, "agitador", {
      stance: "resistance",
      facing: "face-down",
    });

    expect(result).toEqual({ ok: true });
    expect(state.duelists.duelist1.field[0].stance).toBe("resistance");
    expect(state.duelists.duelist1.field[0].facing).toBe("face-down");
  });

  it("rejects Campaign Stance face-down and changes nothing", () => {
    const state = createTestState();

    const result = deployActor(state, "agitador", {
      stance: "campaign",
      facing: "face-down",
    });

    expect(result).toEqual({ ok: false, reason: "invalid-facing-for-stance" });
    expect(state.duelists.duelist1.hand).toEqual(["agitador"]);
    expect(state.duelists.duelist1.field).toEqual([]);
  });

  it("rejects deploying outside a Campaign Phase", () => {
    const state = createTestState({ phase: "confrontation" });

    const result = deployActor(state, "agitador", {
      stance: "campaign",
      facing: "face-up",
    });

    expect(result).toEqual({ ok: false, reason: "wrong-phase" });
  });

  it("rejects a second Normal Deploy in the same turn", () => {
    const state = createTestState({ hasNormalDeployedThisTurn: true });

    const result = deployActor(state, "agitador", {
      stance: "campaign",
      facing: "face-up",
    });

    expect(result).toEqual({ ok: false, reason: "already-deployed-this-turn" });
  });

  it("rejects a card that isn't in hand", () => {
    const state = createTestState({ hand: [] });

    const result = deployActor(state, "agitador", {
      stance: "campaign",
      facing: "face-up",
    });

    expect(result).toEqual({ ok: false, reason: "card-not-in-hand" });
  });

  it("removes only one copy of a duplicated card from hand", () => {
    const state = createTestState({ hand: ["agitador", "agitador"] });

    deployActor(state, "agitador", { stance: "campaign", facing: "face-up" });

    expect(state.duelists.duelist1.hand).toEqual(["agitador"]);
  });

  it("requires a tribute for an Establishment-tier Actor", () => {
    const state = createTestState({ hand: ["el-caudillo"] });

    const result = deployActor(state, "el-caudillo", {
      stance: "campaign",
      facing: "face-up",
    });

    expect(result).toEqual({ ok: false, reason: "tribute-required" });
  });

  it("rejects a tribute that isn't one of the duelist's own field Actors", () => {
    const state = createTestState({ hand: ["el-caudillo"] });

    const result = deployActor(state, "el-caudillo", {
      stance: "campaign",
      facing: "face-up",
      tributeInstanceId: 999,
    });

    expect(result).toEqual({ ok: false, reason: "tribute-not-owned" });
  });

  it("deploys an Establishment Actor by tributing an owned field Actor", () => {
    const state = createTestState({
      hand: ["el-caudillo"],
      field: [
        {
          instanceId: 1,
          cardId: "agitador",
          controllerId: "duelist1",
          zone: 0,
          stance: "campaign",
          facing: "face-up",
          turnDeployed: 1,
          hasAttackedThisTurn: false,
          hasChangedStanceThisTurn: false,
        },
      ],
    });
    state.nextInstanceId = 2;

    const result = deployActor(state, "el-caudillo", {
      stance: "campaign",
      facing: "face-up",
      tributeInstanceId: 1,
    });

    expect(result).toEqual({ ok: true });
    expect(state.duelists.duelist1.field).toHaveLength(1);
    expect(state.duelists.duelist1.field[0].cardId).toBe("el-caudillo");
    expect(state.duelists.duelist1.field[0].instanceId).toBe(2);
    expect(state.duelists.duelist1.archive).toEqual(["agitador"]);
  });

  it("rejects deploying a non-Actor card, even one that's in hand, without touching state", () => {
    const state = createTestState({ hand: ["maletin-de-sobornos"] });

    expect(
      deployActor(state, "maletin-de-sobornos" as never, { stance: "campaign", facing: "face-up" }),
    ).toEqual({ ok: false, reason: "not-an-actor" });
    expect(state.duelists.duelist1.hand).toEqual(["maletin-de-sobornos"]);
    expect(state.duelists.duelist1.field).toHaveLength(0);
  });

  it("rejects ids that only exist on the object prototype (e.g. 'constructor')", () => {
    const state = createTestState({ hand: ["constructor" as never] });

    expect(
      deployActor(state, "constructor" as never, { stance: "campaign", facing: "face-up" }),
    ).toEqual({ ok: false, reason: "not-an-actor" });
  });

  it("rejects an unknown stance or facing instead of writing it into the duel", () => {
    const state = createTestState();

    expect(
      deployActor(state, "agitador", { stance: "flying" as never, facing: "face-up" }),
    ).toEqual({ ok: false, reason: "invalid-stance-or-facing" });
    expect(deployActor(state, "agitador", null as never)).toEqual({
      ok: false,
      reason: "invalid-stance-or-facing",
    });
    expect(state.duelists.duelist1.field).toHaveLength(0);
  });

  it("sends a tributed Actor's Equips to the archive along with it", () => {
    const state = createTestState({
      hand: ["el-caudillo"],
      field: [
        {
          instanceId: 1,
          cardId: "agitador",
          controllerId: "duelist1",
          zone: 0,
          stance: "campaign",
          facing: "face-up",
          turnDeployed: 1,
          hasAttackedThisTurn: false,
          hasChangedStanceThisTurn: false,
        },
      ],
    });
    state.duelists.duelist1.backroomPolicies = [
      {
        instanceId: 9,
        cardId: "maletin-de-sobornos",
        controllerId: "duelist1",
        zone: 0,
        faceDown: false,
        equippedToInstanceId: 1,
      },
    ];
    state.nextInstanceId = 2;

    const result = deployActor(state, "el-caudillo", {
      stance: "campaign",
      facing: "face-up",
      tributeInstanceId: 1,
    });

    expect(result).toEqual({ ok: true });
    expect(state.duelists.duelist1.archive).toEqual(["agitador", "maletin-de-sobornos"]);
    expect(state.duelists.duelist1.backroomPolicies).toHaveLength(0);
  });

  describe("zones", () => {
    function actorInZone(instanceId: number, zone: number): FieldActor {
      return {
        instanceId,
        cardId: "agitador",
        controllerId: "duelist1",
        zone,
        stance: "campaign",
        facing: "face-up",
        turnDeployed: 1,
        hasAttackedThisTurn: false,
        hasChangedStanceThisTurn: false,
      };
    }

    it("deploys into the requested zone", () => {
      const state = createTestState();
      expect(deployActor(state, "agitador", { stance: "campaign", facing: "face-up", zone: 3 })).toEqual({ ok: true });
      expect(state.duelists.duelist1.field[0].zone).toBe(3);
    });

    it("defaults to the first free zone", () => {
      const state = createTestState({ field: [actorInZone(1, 0), actorInZone(2, 2)] });
      deployActor(state, "agitador", { stance: "campaign", facing: "face-up" });
      expect(state.duelists.duelist1.field[2].zone).toBe(1);
    });

    it("rejects an occupied zone without changing anything", () => {
      const state = createTestState({ field: [actorInZone(1, 2)] });
      expect(deployActor(state, "agitador", { stance: "campaign", facing: "face-up", zone: 2 })).toEqual({
        ok: false,
        reason: "zone-occupied",
      });
      expect(state.duelists.duelist1.hand).toEqual(["agitador"]);
      expect(state.duelists.duelist1.field).toHaveLength(1);
    });

    it("rejects out-of-range and non-integer zones", () => {
      for (const zone of [-1, 5, 1.5, "2" as never, null as never]) {
        const state = createTestState();
        expect(deployActor(state, "agitador", { stance: "campaign", facing: "face-up", zone })).toEqual({
          ok: false,
          reason: "invalid-zone",
        });
      }
    });

    it("rejects a Grassroots deploy when all 5 Actor zones are full", () => {
      const state = createTestState({ field: [0, 1, 2, 3, 4].map((z) => actorInZone(z + 1, z)) });
      expect(deployActor(state, "agitador", { stance: "campaign", facing: "face-up" })).toEqual({
        ok: false,
        reason: "field-full",
      });
    });

    it("lets an Establishment Actor take the tributed Actor's zone, even on a full field", () => {
      const state = createTestState({
        hand: ["el-caudillo"],
        field: [0, 1, 2, 3, 4].map((z) => actorInZone(z + 1, z)),
      });
      state.nextInstanceId = 10;
      expect(
        deployActor(state, "el-caudillo", { stance: "campaign", facing: "face-up", tributeInstanceId: 4 }),
      ).toEqual({ ok: true });
      const caudillo = state.duelists.duelist1.field.find((a) => a.cardId === "el-caudillo");
      expect(caudillo?.zone).toBe(3);
    });

    it("keeps the tribute on the field if the chosen zone is invalid (no half-applied deploy)", () => {
      const state = createTestState({ hand: ["el-caudillo"], field: [actorInZone(1, 0), actorInZone(2, 1)] });
      expect(
        deployActor(state, "el-caudillo", {
          stance: "campaign",
          facing: "face-up",
          tributeInstanceId: 1,
          zone: 1,
        }),
      ).toEqual({ ok: false, reason: "zone-occupied" });
      expect(state.duelists.duelist1.field).toHaveLength(2);
      expect(state.duelists.duelist1.archive).toEqual([]);
    });
  });
});
