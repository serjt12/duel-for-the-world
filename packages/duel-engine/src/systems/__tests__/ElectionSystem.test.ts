import { describe, expect, it } from "vitest";
import type { ActorCardId } from "@duel-for-the-world/duel-content";
import type { DuelistState } from "../../duelists/DuelistState";
import type { DuelPhase } from "../../duel/DuelPhase";
import type { DuelState } from "../../duel/DuelState";
import type { FieldActor } from "../../field/FieldActor";
import { ELECTION_TURN, RUNOFF_EXTRA_TURNS } from "../../config/DuelConfig";
import { declareAttack } from "../BattleSystem";
import { countVotes, holdElection } from "../ElectionSystem";
import { advancePhase } from "../TurnSystem";

function createDuelist(overrides: Partial<DuelistState> = {}): DuelistState {
  return {
    id: "duelist1",
    mandate: 20,
    deck: ["agitador", "agitador", "agitador", "agitador"],
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

let nextId = 1;
function actor(cardId: ActorCardId, overrides: Partial<FieldActor> = {}): FieldActor {
  return {
    instanceId: nextId++,
    cardId,
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

function createState(overrides: {
  phase?: DuelPhase;
  turnNumber?: number;
  runoff?: boolean;
  electionTurn?: number;
  duelist1?: Partial<DuelistState>;
  duelist2?: Partial<DuelistState>;
} = {}): DuelState {
  return {
    turnNumber: overrides.turnNumber ?? ELECTION_TURN,
    activeDuelistId: "duelist2",
    phase: overrides.phase ?? "recess",
    winnerId: null,
    nextInstanceId: 500,
    log: [],
    election: { turn: overrides.electionTurn ?? ELECTION_TURN, runoff: overrides.runoff ?? false },
    duelists: {
      duelist1: createDuelist({ id: "duelist1", ...overrides.duelist1 }),
      duelist2: createDuelist({ id: "duelist2", ...overrides.duelist2 }),
    },
  };
}

describe("countVotes", () => {
  it("is Mandate plus the effective ATK of your Campaign Actors (Resistance doesn't count)", () => {
    const state = createState({
      duelist1: {
        mandate: 12,
        field: [
          actor("la-tribuna", { instanceId: 1 }), // 4
          actor("el-caudillo", { instanceId: 2, zone: 1 }), // 7 (+2 Maletin = 9)
          actor("el-registrador", { instanceId: 3, zone: 2, stance: "resistance" }), // not counted
        ],
        backroomPolicies: [
          { instanceId: 9, cardId: "maletin-de-sobornos", controllerId: "duelist1", zone: 0, faceDown: false, equippedToInstanceId: 2 },
        ],
      },
    });
    expect(countVotes(state, "duelist1")).toEqual({ mandate: 12, campaign: 13, bonus: 0, total: 25 });
    expect(countVotes(state, "duelist2")).toEqual({ mandate: 20, campaign: 0, bonus: 0, total: 20 });
  });
});

describe("Election Night", () => {
  it("isn't held before the election turn ends", () => {
    const state = createState({ turnNumber: ELECTION_TURN - 1, duelist1: { mandate: 30 } });
    advancePhase(state);
    expect(state.winnerId).toBeNull();
    expect(state.log.some((event) => event.kind === "election-held")).toBe(false);
  });

  it("a clear lead (more than the runoff margin) wins outright as the election turn ends", () => {
    const state = createState({ duelist1: { mandate: 21, field: [actor("la-tribuna")] } }); // 25 vs 20
    advancePhase(state);
    expect(state.winnerId).toBe("duelist1");
    expect(state.turnNumber).toBe(ELECTION_TURN); // no new turn starts
    expect(state.log.map((event) => event.kind)).toEqual(["election-held", "duel-won"]);
    expect(state.log[1]).toMatchObject({ kind: "duel-won", duelistId: "duelist1", reason: "election" });
    expect(state.log[0]).toMatchObject({
      kind: "election-held",
      round: "first",
      leaderId: "duelist1",
      votes: { duelist1: { total: 25 }, duelist2: { total: 20 } },
    });
  });

  it("a close race (within the margin) calls a runoff and play goes on", () => {
    const state = createState({ duelist1: { mandate: 23 } }); // 23 vs 20: within the margin (4)
    advancePhase(state);
    expect(state.winnerId).toBeNull();
    expect(state.election).toEqual({ turn: ELECTION_TURN + RUNOFF_EXTRA_TURNS, runoff: true });
    expect(state.log.map((event) => event.kind)).toEqual(["election-held", "runoff-called", "turn-started"]);
    expect(state.turnNumber).toBe(ELECTION_TURN + 1);
  });

  it("doubles battle Mandate damage during the runoff", () => {
    const state = createState({
      runoff: true,
      electionTurn: ELECTION_TURN + 2,
      turnNumber: ELECTION_TURN + 1,
      phase: "confrontation",
      duelist2: { field: [actor("la-tribuna", { instanceId: 40, controllerId: "duelist2" })] },
    });
    declareAttack(state, 40);
    expect(state.duelists.duelist1.mandate).toBe(12); // 20 - 4 x 2
    expect(state.log.find((event) => event.kind === "battle")).toMatchObject({ mandateDamage: 8 });
  });

  it("the runoff is won by any lead", () => {
    const state = createState({ runoff: true, duelist2: { mandate: 21 } });
    holdElection(state);
    expect(state.winnerId).toBe("duelist2");
    expect(state.log.at(-1)).toMatchObject({ kind: "duel-won", reason: "runoff" });
  });

  it("a runoff dead heat goes to the cleaner record: fewer cards in La Embajada", () => {
    const state = createState({ runoff: true, duelist1: { archive: ["agitador"] }, duelist2: { archive: ["agitador", "la-tribuna"] } });
    holdElection(state);
    expect(state.winnerId).toBe("duelist1");
    expect(state.log.at(-1)).toMatchObject({ kind: "duel-won", reason: "tiebreak" });
  });

  it("...and a perfect tie goes to the duelist who played second", () => {
    const state = createState({ runoff: true });
    holdElection(state);
    expect(state.winnerId).toBe("duelist2");
  });

  it("a knockout during the runoff still ends the duel on the spot", () => {
    const state = createState({
      runoff: true,
      electionTurn: ELECTION_TURN + 2,
      turnNumber: ELECTION_TURN + 1,
      phase: "confrontation",
      duelist1: { mandate: 7 },
      duelist2: { field: [actor("la-tribuna", { instanceId: 41, controllerId: "duelist2" })] },
    });
    declareAttack(state, 41);
    expect(state.winnerId).toBe("duelist2");
    expect(state.log.at(-1)).toMatchObject({ kind: "duel-won", reason: "mandate" });
  });
});
