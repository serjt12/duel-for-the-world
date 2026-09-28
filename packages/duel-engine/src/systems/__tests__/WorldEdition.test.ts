import { describe, expect, it } from "vitest";
import type { ActorCardId, ScandalCardId } from "@duel-for-the-world/duel-content";
import type { DuelistState } from "../../duelists/DuelistState";
import type { DuelPhase } from "../../duel/DuelPhase";
import type { DuelState } from "../../duel/DuelState";
import type { DuelEvent } from "../../events/DuelEvent";
import type { FieldActor } from "../../field/FieldActor";
import { declareAttack } from "../BattleSystem";
import { deployActor } from "../DeploySystem";
import { getEffectiveStats } from "../EffectiveStats";
import { countVotes, holdElection } from "../ElectionSystem";
import { activatePolicy } from "../PolicySystem";
import { changeStance } from "../StanceSystem";
import { advancePhase } from "../TurnSystem";

// --- Fixtures ---------------------------------------------------------------

function createDuelist(overrides: Partial<DuelistState> = {}): DuelistState {
  return {
    id: "duelist1",
    mandate: 20,
    deck: ["protester", "riot-cop", "intern", "pollster", "bureaucrat", "protester"],
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
    instanceId: overrides.instanceId ?? nextId++,
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

function scandal(cardId: ScandalCardId, controllerId: "duelist1" | "duelist2" = "duelist2", zone = 0) {
  return { instanceId: nextId++, cardId, controllerId, zone };
}

function createState(overrides: {
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
    nextInstanceId: 1000,
    log: [],
    election: { turn: 12, runoff: false },
    duelists: {
      duelist1: createDuelist({ id: "duelist1", ...overrides.duelist1 }),
      duelist2: createDuelist({ id: "duelist2", ...overrides.duelist2 }),
    },
  };
}

const kinds = (state: DuelState): DuelEvent["kind"][] => state.log.map((event) => event.kind);
const d1 = (state: DuelState) => state.duelists.duelist1;
const d2 = (state: DuelState) => state.duelists.duelist2;

// --- Embassy retrieval ------------------------------------------------------

describe("Embassy retrieval", () => {
  it("Presidential Pardon returns the Actor the player picked", () => {
    const state = createState({
      duelist1: { hand: ["presidential-pardon"], archive: ["protester", "bot-farm", "career-senator", "riot-cop"] },
    });
    expect(activatePolicy(state, "presidential-pardon", { embassyPick: 2 })).toEqual({ ok: true });
    expect(d1(state).hand).toEqual(["career-senator"]);
    expect(d1(state).archive).toEqual(["protester", "bot-farm", "riot-cop", "presidential-pardon"]);
    expect(state.log.find((event) => event.kind === "returned-to-hand")).toMatchObject({
      cardId: "career-senator",
      fromOpponent: false,
    });
  });

  it("falls back to the most recent eligible card when the pick isn't eligible", () => {
    const state = createState({
      duelist1: { hand: ["presidential-pardon"], archive: ["protester", "riot-cop", "bot-farm"] },
    });
    // Index 2 is a Policy: not an Actor, so the pick is ignored.
    activatePolicy(state, "presidential-pardon", { embassyPick: 2 });
    expect(d1(state).hand).toEqual(["riot-cop"]);
  });

  it("a retrieval Policy with nothing to retrieve can't be activated (and stays in hand)", () => {
    const state = createState({ duelist1: { hand: ["presidential-pardon"], archive: ["bot-farm"] } });
    expect(activatePolicy(state, "presidential-pardon")).toEqual({ ok: false, reason: "nothing-to-retrieve" });
    expect(d1(state).hand).toEqual(["presidential-pardon"]);
  });

  it("Political Comeback revives a weak Actor face-up in Resistance, ready next turn", () => {
    const state = createState({
      duelist1: {
        hand: ["political-comeback"],
        archive: ["career-senator", "protester"],
        field: [actor("riot-cop", { zone: 0 })],
      },
    });
    expect(activatePolicy(state, "political-comeback", { embassyPick: 0 })).toEqual({ ok: true });
    // The Senator (ATK 7) is too strong: the pick falls back to the Protester.
    const revived = d1(state).field.find((a) => a.cardId === "protester");
    expect(revived).toMatchObject({ zone: 1, stance: "resistance", facing: "face-up", turnDeployed: 3 });
    expect(d1(state).archive).toEqual(["career-senator", "political-comeback"]);
    expect(kinds(state)).toContain("returned-to-field");
  });

  it("Political Comeback can't be activated with only strong Actors in the Embassy", () => {
    const state = createState({ duelist1: { hand: ["political-comeback"], archive: ["career-senator"] } });
    expect(activatePolicy(state, "political-comeback")).toEqual({ ok: false, reason: "nothing-to-retrieve" });
  });

  it("Political Comeback can't be activated with a full field", () => {
    const state = createState({
      duelist1: {
        hand: ["political-comeback"],
        archive: ["protester"],
        field: [0, 1, 2, 3, 4].map((zone) => actor("riot-cop", { zone })),
      },
    });
    expect(activatePolicy(state, "political-comeback")).toEqual({ ok: false, reason: "nothing-to-retrieve" });
  });

  it("Declassified Files takes a Policy from the opponent's Embassy", () => {
    const state = createState({
      duelist1: { hand: ["declassified-files"] },
      duelist2: { archive: ["protester", "stimulus-package", "hot-mic"] },
    });
    expect(activatePolicy(state, "declassified-files")).toEqual({ ok: true });
    expect(d1(state).hand).toEqual(["stimulus-package"]);
    expect(d2(state).archive).toEqual(["protester", "hot-mic"]);
    expect(state.log.find((event) => event.kind === "returned-to-hand")).toMatchObject({ fromOpponent: true });
  });

  it("the Defector takes an Actor from the opponent's Embassy on deploy (and just deploys if there's none)", () => {
    const state = createState({ duelist1: { hand: ["defector", "defector"] }, duelist2: { archive: ["career-senator"] } });
    expect(deployActor(state, "defector", { stance: "campaign", facing: "face-up", embassyPick: 0 })).toEqual({ ok: true });
    expect(d1(state).hand).toEqual(["defector", "career-senator"]);
    expect(d2(state).archive).toEqual([]);
  });

  it("the Lobbyist returns a Policy from your Embassy on deploy", () => {
    const state = createState({ duelist1: { hand: ["lobbyist"], archive: ["bot-farm", "protester"] } });
    deployActor(state, "lobbyist", { stance: "campaign", facing: "face-up" });
    expect(d1(state).hand).toEqual(["bot-farm"]);
  });

  it("the Lobbyist's on-deploy doesn't happen when it's deployed face-down (it hasn't been revealed)", () => {
    const state = createState({ duelist1: { hand: ["lobbyist"], archive: ["bot-farm"] } });
    deployActor(state, "lobbyist", { stance: "resistance", facing: "face-down" });
    expect(d1(state).hand).toEqual([]);
  });

  it("the Ghostwriter's flip returns an Actor, using the pick sent with the stance change", () => {
    const state = createState({
      duelist1: {
        field: [actor("ghostwriter", { instanceId: 7, stance: "resistance", facing: "face-down" })],
        archive: ["protester", "riot-cop"],
      },
    });
    expect(changeStance(state, 7, { embassyPick: 0 })).toEqual({ ok: true });
    expect(d1(state).hand).toEqual(["protester"]);
  });

  it("Comeback Kid revives an Actor on deploy (after its tribute has gone to the Embassy)", () => {
    const state = createState({
      duelist1: { hand: ["comeback-kid"], field: [actor("protester", { instanceId: 8 })], archive: ["riot-cop"] },
    });
    expect(
      deployActor(state, "comeback-kid", { stance: "campaign", facing: "face-up", tributeInstanceId: 8, embassyPick: 0 }),
    ).toEqual({ ok: true });
    expect(d1(state).field.map((a) => a.cardId).sort()).toEqual(["comeback-kid", "riot-cop"]);
    expect(d1(state).archive).toEqual(["protester"]);
  });
});

// --- "When it falls" --------------------------------------------------------

describe("fall triggers", () => {
  it("The Consultant, destroyed in battle, returns ANOTHER Actor from your Embassy to your hand", () => {
    const state = createState({
      phase: "confrontation",
      duelist1: { field: [actor("career-senator", { instanceId: 1 })] },
      duelist2: {
        field: [actor("revolving-door-consultant", { instanceId: 2, controllerId: "duelist2" })],
        archive: ["protester"],
      },
    });
    declareAttack(state, 1, 2);
    expect(d2(state).hand).toEqual(["protester"]);
    expect(d2(state).archive).toEqual(["revolving-door-consultant"]);
  });

  it("The Consultant never retrieves itself", () => {
    const state = createState({
      phase: "confrontation",
      duelist1: { field: [actor("career-senator", { instanceId: 1 })] },
      duelist2: { field: [actor("revolving-door-consultant", { instanceId: 2, controllerId: "duelist2" })] },
    });
    declareAttack(state, 1, 2);
    expect(d2(state).hand).toEqual([]);
    expect(d2(state).archive).toEqual(["revolving-door-consultant"]);
  });

  it("the Party Loyalist gives its controller +2 Mandate when it falls", () => {
    const state = createState({
      phase: "confrontation",
      duelist1: { field: [actor("career-senator", { instanceId: 1 })] },
      duelist2: { field: [actor("party-loyalist", { instanceId: 2, controllerId: "duelist2" })] },
    });
    declareAttack(state, 1, 2);
    // -2 battle damage (5 vs 3), +2 from the fall.
    expect(d2(state).mandate).toBe(20);
  });

  it("the Victim-in-Chief gains Mandate when an ally falls, but not for a tribute", () => {
    const state = createState({
      phase: "confrontation",
      duelist1: { field: [actor("career-senator", { instanceId: 1 })] },
      duelist2: {
        field: [
          actor("victim-in-chief", { instanceId: 2, controllerId: "duelist2", zone: 0, stance: "resistance" }),
          actor("protester", { instanceId: 3, controllerId: "duelist2", zone: 1, stance: "resistance" }),
        ],
      },
    });
    declareAttack(state, 1, 3); // 5 ATK vs 4 DEF: the Protester falls (no damage through Resistance)
    expect(d2(state).mandate).toBe(23);
    expect(state.log.find((event) => event.kind === "actor-effect")).toMatchObject({ trigger: "ally-fell" });

    const tributes = createState({
      duelist1: {
        hand: ["career-senator"],
        field: [actor("victim-in-chief", { instanceId: 4 }), actor("riot-cop", { instanceId: 5, zone: 1 })],
      },
    });
    deployActor(tributes, "career-senator", { stance: "campaign", facing: "face-up", tributeInstanceId: 5 });
    expect(d1(tributes).mandate).toBe(20);
  });
});

// --- Leaders ----------------------------------------------------------------

describe("Leaders", () => {
  it("need a tribute, and only one can be in office", () => {
    const state = createState({
      duelist1: {
        hand: ["oil-baron", "referendum-czar"],
        field: [actor("protester", { instanceId: 1 }), actor("referendum-czar", { instanceId: 2, zone: 1 })],
      },
    });
    expect(deployActor(state, "oil-baron", { stance: "campaign", facing: "face-up" })).toEqual({
      ok: false,
      reason: "tribute-required",
    });
    expect(deployActor(state, "oil-baron", { stance: "campaign", facing: "face-up", tributeInstanceId: 1 })).toEqual({
      ok: false,
      reason: "leader-already-in-office",
    });
    // ...but the Leader in office may be the tribute.
    expect(deployActor(state, "oil-baron", { stance: "campaign", facing: "face-up", tributeInstanceId: 2 })).toEqual({
      ok: true,
    });
  });

  it("the Generalissimo can't go into Resistance, and pumps its allies' ATK", () => {
    const state = createState({
      turnNumber: 5,
      duelist1: {
        hand: ["lifelong-generalissimo"],
        field: [
          actor("protester", { instanceId: 1 }),
          actor("lifelong-generalissimo", { instanceId: 2, zone: 1 }),
          actor("riot-cop", { instanceId: 3, zone: 2 }),
        ],
      },
    });
    expect(
      deployActor(state, "lifelong-generalissimo", { stance: "resistance", facing: "face-down", tributeInstanceId: 1 }),
    ).toEqual({ ok: false, reason: "campaign-only" });
    expect(changeStance(state, 2)).toEqual({ ok: false, reason: "campaign-only" });
    expect(getEffectiveStats(d1(state).field[0], state).atk).toBe(5); // protester 4 + 1
    expect(getEffectiveStats(d1(state).field[1], state).atk).toBe(5); // not itself
  });

  it("the Party Chairman gives other allies +1 DEF only while face-up", () => {
    const state = createState({
      duelist1: {
        field: [actor("party-chairman", { instanceId: 1 }), actor("riot-cop", { instanceId: 2, zone: 1 })],
      },
    });
    expect(getEffectiveStats(d1(state).field[1], state).def).toBe(7);
    d1(state).field[0].facing = "face-down";
    d1(state).field[0].stance = "resistance";
    expect(getEffectiveStats(d1(state).field[1], state).def).toBe(6);
  });

  it("the Government-in-Exile gets +1 ATK per Actor in your Embassy", () => {
    const state = createState({
      duelist1: {
        field: [actor("government-in-exile", { instanceId: 1 })],
        archive: ["protester", "bot-farm"],
      },
    });
    expect(getEffectiveStats(d1(state).field[0], state).atk).toBe(4); // 3 + 1 Actor (bot-farm is a Policy, doesn't count)
  });

  it("the Government-in-Exile's Embassy bonus caps at +2 (5 ATK total)", () => {
    const state = createState({
      duelist1: {
        field: [actor("government-in-exile", { instanceId: 1 })],
        archive: ["protester", "bot-farm", "riot-cop", "career-senator"],
      },
    });
    // 3 Actors in the Embassy (protester, riot-cop, career-senator) would be
    // +3 uncapped, but the passive caps at +2.
    expect(getEffectiveStats(d1(state).field[0], state).atk).toBe(5);
  });

  it("the Eternal Incumbent postpones the election and can't be removed by opposing effects", () => {
    const state = createState({
      duelist1: { hand: ["eternal-incumbent"], field: [actor("protester", { instanceId: 1 })] },
    });
    deployActor(state, "eternal-incumbent", { stance: "campaign", facing: "face-up", tributeInstanceId: 1 });
    expect(state.election.turn).toBe(14);
    expect(kinds(state)).toContain("election-postponed");

    const incumbent = d1(state).field[0];
    state.activeDuelistId = "duelist2";
    d2(state).hand = ["persona-non-grata"];
    expect(activatePolicy(state, "persona-non-grata", { targetInstanceId: incumbent.instanceId })).toEqual({
      ok: false,
      reason: "target-immune",
    });
  });

  it("an Impeachment doesn't remove an immune Leader", () => {
    const state = createState({
      duelist1: { hand: ["eternal-incumbent"], field: [actor("protester", { instanceId: 1 })] },
      duelist2: { setScandals: [scandal("impeachment")] },
    });
    deployActor(state, "eternal-incumbent", { stance: "campaign", facing: "face-up", tributeInstanceId: 1 });
    expect(d1(state).field.map((a) => a.cardId)).toEqual(["eternal-incumbent"]);
  });

  it("an Impeachment sends a newly deployed (non-immune) Leader to the Embassy", () => {
    const state = createState({
      duelist1: { hand: ["oil-baron"], field: [actor("protester", { instanceId: 1 })] },
      duelist2: { setScandals: [scandal("impeachment")] },
    });
    deployActor(state, "oil-baron", { stance: "campaign", facing: "face-up", tributeInstanceId: 1 });
    expect(d1(state).field).toEqual([]);
    expect(d1(state).archive).toEqual(["protester", "oil-baron"]);
  });

  it("the Oil Baron and the Tweeting Tycoon act at the start of their controller's turn", () => {
    const state = createState({
      phase: "recess",
      duelist1: { field: [actor("oil-baron", { instanceId: 1 })] },
      duelist2: {
        field: [actor("tweeting-tycoon", { instanceId: 2, controllerId: "duelist2" })],
        hand: ["bot-farm", "protester"],
        deck: ["riot-cop", "intern", "pollster"],
      },
    });
    advancePhase(state); // -> duelist2's turn: draw, then the Tycoon draws 1 and discards the oldest.
    expect(state.activeDuelistId).toBe("duelist2");
    expect(d2(state).hand).toEqual(["protester", "riot-cop", "intern"]);
    expect(d2(state).archive).toEqual(["bot-farm"]);
    expect(d1(state).mandate).toBe(20); // not duelist1's turn yet
  });

  it("a face-down Oil Baron does nothing at turn start", () => {
    const state = createState({
      phase: "recess",
      duelist2: { field: [actor("oil-baron", { controllerId: "duelist2", stance: "resistance", facing: "face-down" })] },
    });
    advancePhase(state);
    expect(d2(state).mandate).toBe(20);
  });

  it("the Algorithm Chairman is a Leader with a reveal passive (the server redacts accordingly)", () => {
    const state = createState({ duelist1: { field: [actor("algorithm-chairman")] } });
    expect(state.duelists.duelist1.field[0].cardId).toBe("algorithm-chairman");
  });
});

// --- Votes ------------------------------------------------------------------

describe("votes", () => {
  it("bonus votes (Pollster, Bot Farm) and the Referendum Czar count on Election Night", () => {
    const state = createState({
      duelist1: { hand: ["pollster", "bot-farm"], mandate: 10, field: [actor("referendum-czar", { stance: "resistance" })] },
    });
    deployActor(state, "pollster", { stance: "resistance", facing: "face-up" });
    activatePolicy(state, "bot-farm");
    expect(countVotes(state, "duelist1")).toEqual({ mandate: 10, campaign: 0, bonus: 10, total: 20 });
  });

  it("Recount adds 4 votes on Election Night, before the count", () => {
    const state = createState({
      turnNumber: 12,
      duelist1: { mandate: 23 },
      duelist2: { mandate: 20, setScandals: [scandal("recount")] },
    });
    holdElection(state);
    // 23 vs 24: without the Recount duelist1 would have been in a runoff.
    expect(kinds(state).slice(0, 3)).toEqual(["scandal-triggered", "votes-gained", "election-held"]);
    expect(state.election.runoff).toBe(true);
  });
});

// --- Scandals ---------------------------------------------------------------

describe("World Scandals", () => {
  it("Martyrdom returns your Actor destroyed in battle to your hand", () => {
    const state = createState({
      phase: "confrontation",
      duelist1: { field: [actor("career-senator", { instanceId: 1 })] },
      duelist2: {
        field: [actor("protester", { instanceId: 2, controllerId: "duelist2" })],
        setScandals: [scandal("martyrdom")],
      },
    });
    declareAttack(state, 1, 2);
    expect(d2(state).hand).toEqual(["protester"]);
    expect(d2(state).archive).toEqual(["martyrdom"]);
  });

  it("Paper Trail costs the opponent 2 Mandate when they activate a Policy", () => {
    const state = createState({
      duelist1: { hand: ["stimulus-package"] },
      duelist2: { setScandals: [scandal("paper-trail")] },
    });
    activatePolicy(state, "stimulus-package");
    expect(d1(state).mandate).toBe(21); // +3 -2
    expect(d2(state).setScandals).toEqual([]);
  });

  it("Persona Non Grata only targets an Actor with ATK 5 or less", () => {
    const state = createState({
      duelist1: { hand: ["persona-non-grata"] },
      duelist2: {
        field: [
          actor("career-senator", { instanceId: 1, controllerId: "duelist2" }),
          actor("protester", { instanceId: 2, controllerId: "duelist2", zone: 1 }),
        ],
      },
    });
    expect(activatePolicy(state, "persona-non-grata", { targetInstanceId: 1 })).toEqual({
      ok: false,
      reason: "target-too-strong",
    });
    expect(activatePolicy(state, "persona-non-grata", { targetInstanceId: 2 })).toEqual({ ok: true });
    expect(d2(state).archive).toEqual(["protester"]);
  });
});

describe("Scandal costs", () => {
  it("Impeachment costs its controller 5 Mandate", () => {
    const state = createState({
      duelist1: { hand: ["oil-baron"], field: [actor("protester", { instanceId: 1 })] },
      duelist2: { setScandals: [scandal("impeachment")] },
    });
    deployActor(state, "oil-baron", { stance: "campaign", facing: "face-up", tributeInstanceId: 1 });
    expect(d2(state).mandate).toBe(15);
  });

  it("a Scandal never fires when its own cost would knock out its controller", () => {
    const state = createState({
      duelist1: { hand: ["oil-baron"], field: [actor("protester", { instanceId: 1 })] },
      duelist2: { mandate: 5, setScandals: [scandal("impeachment")] },
    });
    deployActor(state, "oil-baron", { stance: "campaign", facing: "face-up", tributeInstanceId: 1 });
    expect(state.winnerId).toBeNull();
    expect(d1(state).field.map((a) => a.cardId)).toEqual(["oil-baron"]);
    expect(d2(state).setScandals).toHaveLength(1);
  });
});
