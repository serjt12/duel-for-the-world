import { describe, expect, it } from "vitest";
import type { ActorCardId, CardId } from "@project-palacio/duel-content";
import type { DuelistState } from "../../duelists/DuelistState";
import type { DuelPhase } from "../../duel/DuelPhase";
import type { DuelState } from "../../duel/DuelState";
import type { DuelEvent } from "../../events/DuelEvent";
import type { FieldActor } from "../../field/FieldActor";
import type { FieldPolicy } from "../../field/FieldPolicy";
import { declareAttack } from "../BattleSystem";
import { deployActor } from "../DeploySystem";
import { getEffectiveStats } from "../EffectiveStats";
import { activatePolicy, activateSetPolicy, setPolicy } from "../PolicySystem";
import { setScandal } from "../ScandalSystem";
import { changeStance } from "../StanceSystem";
import { advancePhase } from "../TurnSystem";

// --- Fixtures ---------------------------------------------------------------

function createDuelist(overrides: Partial<DuelistState> = {}): DuelistState {
  return {
    id: "duelist1",
    mandate: 20,
    deck: ["agitador", "la-tribuna", "fiscal-de-barrio", "operador-politico"],
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
  const instanceId = overrides.instanceId ?? nextId++;
  return {
    instanceId,
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

function equip(
  cardId: FieldPolicy["cardId"],
  onInstanceId: number,
  controllerId: "duelist1" | "duelist2" = "duelist1",
  zone = 0,
): FieldPolicy {
  return { instanceId: nextId++, cardId, controllerId, zone, faceDown: false, equippedToInstanceId: onInstanceId };
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

// The log without seq numbers, for readable expectations.
function events(state: DuelState): Array<Omit<DuelEvent, "seq">> {
  return state.log.map(({ seq: _seq, ...rest }) => rest);
}

function kinds(state: DuelState): string[] {
  return state.log.map((event) => event.kind);
}

// --- Battle report (the bug report that motivated the log) -----------------

describe("battle report: equipped Caudillo vs plain Caudillo", () => {
  it("a plain Caudillo attacking an equipped one loses, and the log shows the numbers", () => {
    const equipped = actor("el-caudillo", { controllerId: "duelist2", instanceId: 50 });
    const plain = actor("el-caudillo", { controllerId: "duelist1", instanceId: 60 });
    const state = createState({
      phase: "confrontation",
      duelist1: { field: [plain] },
      duelist2: { field: [equipped], backroomPolicies: [equip("maletin-de-sobornos", 50, "duelist2")] },
    });

    const result = declareAttack(state, 60, 50);

    expect(result).toEqual({ ok: true, outcome: { attackerDestroyed: true, defenderDestroyed: false, mandateDamage: 0 } });
    expect(events(state)).toEqual([
      { kind: "attack-declared", duelistId: "duelist1", attackerCardId: "el-caudillo", targetCardId: "el-caudillo", direct: false },
      {
        kind: "battle",
        duelistId: "duelist1",
        attackerInstanceId: 60,
        attackerCardId: "el-caudillo",
        attackerAtk: 7,
        target: { instanceId: 50, cardId: "el-caudillo", stance: "campaign", value: 9 },
        attackerDestroyed: true,
        defenderDestroyed: false,
        mandateDamage: 0,
      },
      { kind: "sent-to-embassy", duelistId: "duelist1", cardId: "el-caudillo", reason: "battle" },
    ]);
  });

  it("an equipped Caudillo attacking into a Set Escandalo is destroyed before battle -- and the log says why", () => {
    const equipped = actor("el-caudillo", { controllerId: "duelist1", instanceId: 50 });
    const plain = actor("el-caudillo", { controllerId: "duelist2", instanceId: 60 });
    const state = createState({
      phase: "confrontation",
      duelist1: { field: [equipped], backroomPolicies: [equip("maletin-de-sobornos", 50)] },
      duelist2: {
        field: [plain],
        setScandals: [{ instanceId: 70, cardId: "escandalo-de-corrupcion", controllerId: "duelist2", zone: 0 }],
      },
    });

    declareAttack(state, 50, 60);

    expect(events(state)).toEqual([
      { kind: "attack-declared", duelistId: "duelist1", attackerCardId: "el-caudillo", targetCardId: "el-caudillo", direct: false },
      { kind: "scandal-triggered", duelistId: "duelist2", cardId: "escandalo-de-corrupcion" },
      { kind: "sent-to-embassy", duelistId: "duelist1", cardId: "el-caudillo", reason: "scandal" },
      { kind: "sent-to-embassy", duelistId: "duelist1", cardId: "maletin-de-sobornos", reason: "scandal" },
    ]);
    expect(state.duelists.duelist1.archive).toEqual(["el-caudillo", "maletin-de-sobornos"]);
    expect(state.duelists.duelist2.field).toHaveLength(1);
  });
});

// --- Log is public by construction ------------------------------------------

describe("the duel log never names a hidden card", () => {
  it("logs a face-down deploy without its card, and names it only once a battle flips it", () => {
    const state = createState({ duelist1: { hand: ["fiscal-de-barrio"] } });
    deployActor(state, "fiscal-de-barrio", { stance: "resistance", facing: "face-down" });
    expect(events(state)).toEqual([
      { kind: "actor-deployed", duelistId: "duelist1", cardId: null, stance: "resistance", tributedCardId: null },
    ]);

    // Opponent attacks it next turn.
    const hidden = state.duelists.duelist1.field[0];
    state.log = [];
    state.activeDuelistId = "duelist2";
    state.turnNumber = 4;
    state.phase = "confrontation";
    state.duelists.duelist2.field = [actor("la-tribuna", { controllerId: "duelist2", instanceId: 90 })];
    declareAttack(state, 90, hidden.instanceId);

    expect(state.log[0]).toMatchObject({ kind: "attack-declared", targetCardId: null });
    expect(state.log[1]).toMatchObject({
      kind: "battle",
      target: { cardId: "fiscal-de-barrio", stance: "resistance", value: 5 },
    });
  });

  it("logs Set Policies and Scandals without naming them", () => {
    const state = createState({ duelist1: { hand: ["decreto-de-emergencia", "chuzadas"] } });
    setPolicy(state, "decreto-de-emergencia");
    setScandal(state, "chuzadas");
    expect(events(state)).toEqual([
      { kind: "card-set", duelistId: "duelist1", category: "policy" },
      { kind: "card-set", duelistId: "duelist1", category: "scandal" },
    ]);
    expect(JSON.stringify(state.log)).not.toContain("decreto");
    expect(JSON.stringify(state.log)).not.toContain("chuzadas");
  });

  it("numbers events in order and logs turn changes and a deck-out win", () => {
    const state = createState({ phase: "recess", duelist2: { deck: [] } });
    advancePhase(state);
    expect(events(state)).toEqual([
      { kind: "turn-started", duelistId: "duelist2", turn: 4 },
      { kind: "duel-won", duelistId: "duelist1", reason: "deck-out" },
    ]);
    expect(state.log.map((event) => event.seq)).toEqual([1, 2]);
  });
});

// --- Wave 2 Actors ------------------------------------------------------------

describe("on-deploy Actors", () => {
  it("La Influencer draws a card when deployed face-up, but not when Set", () => {
    const up = createState({ duelist1: { hand: ["la-influencer"] } });
    deployActor(up, "la-influencer", { stance: "campaign", facing: "face-up" });
    expect(up.duelists.duelist1.hand).toEqual(["agitador"]);
    expect(kinds(up)).toEqual(["actor-deployed", "actor-effect", "cards-drawn"]);

    const down = createState({ duelist1: { hand: ["la-influencer"] } });
    deployActor(down, "la-influencer", { stance: "resistance", facing: "face-down" });
    expect(down.duelists.duelist1.hand).toEqual([]);
  });

  it("El Contratista costs 2 Mandate; El Lider Comunal gains 2", () => {
    const state = createState({ duelist1: { hand: ["el-contratista"] } });
    deployActor(state, "el-contratista", { stance: "campaign", facing: "face-up" });
    expect(state.duelists.duelist1.mandate).toBe(18);

    const other = createState({ duelist1: { hand: ["lider-comunal"] } });
    deployActor(other, "lider-comunal", { stance: "resistance", facing: "face-up" });
    expect(other.duelists.duelist1.mandate).toBe(22);
  });

  it("El Expresidente takes 2 Mandate from the opponent; La Senadora Eterna draws", () => {
    const state = createState({
      duelist1: { hand: ["el-expresidente", "la-senadora-eterna"], field: [actor("agitador", { instanceId: 1 })] },
    });
    deployActor(state, "el-expresidente", { stance: "campaign", facing: "face-up", tributeInstanceId: 1 });
    expect(state.duelists.duelist2.mandate).toBe(18);
    expect(events(state)[1]).toEqual({
      kind: "actor-deployed",
      duelistId: "duelist1",
      cardId: "el-expresidente",
      stance: "campaign",
      tributedCardId: "agitador",
    });

    state.duelists.duelist1.hasNormalDeployedThisTurn = false;
    const expresidente = state.duelists.duelist1.field[0].instanceId;
    deployActor(state, "la-senadora-eterna", { stance: "campaign", facing: "face-up", tributeInstanceId: expresidente });
    expect(state.duelists.duelist1.hand).toContain("agitador");
  });
});

describe("La Periodista Investigativa (on-flip)", () => {
  it("costs the opponent 3 Mandate when flipped by changing stance", () => {
    const state = createState({
      duelist1: { field: [actor("periodista-investigativa", { instanceId: 5, stance: "resistance", facing: "face-down" })] },
    });
    changeStance(state, 5);
    expect(state.duelists.duelist2.mandate).toBe(17);
    expect(kinds(state)).toEqual(["stance-changed", "actor-effect", "mandate-changed"]);
  });

  it("still costs the attacker 3 Mandate when flipped by an attack that destroys her", () => {
    const state = createState({
      phase: "confrontation",
      duelist1: { field: [actor("la-tribuna", { instanceId: 9 })] },
      duelist2: {
        field: [
          actor("periodista-investigativa", {
            instanceId: 5,
            controllerId: "duelist2",
            stance: "resistance",
            facing: "face-down",
          }),
        ],
      },
    });
    declareAttack(state, 9, 5);
    expect(state.duelists.duelist2.field).toEqual([]);
    expect(state.duelists.duelist1.mandate).toBe(17);
  });

  it("does nothing extra when she's already face-up", () => {
    const state = createState({
      duelist1: { field: [actor("periodista-investigativa", { instanceId: 5, stance: "resistance", facing: "face-up" })] },
    });
    changeStance(state, 5);
    expect(state.duelists.duelist2.mandate).toBe(20);
  });
});

// --- Wave 2 Policies ----------------------------------------------------------

describe("Encuesta Amañada", () => {
  it("draws 2, or as many as the deck has -- never a deck-out", () => {
    const state = createState({ duelist1: { hand: ["encuesta-amanada"], deck: ["agitador"] } });
    activatePolicy(state, "encuesta-amanada");
    expect(state.duelists.duelist1.hand).toEqual(["agitador"]);
    expect(state.winnerId).toBeNull();
    expect(state.duelists.duelist1.archive).toEqual(["encuesta-amanada"]);
  });
});

describe("Nombramiento Diplomático", () => {
  function setup(): DuelState {
    return createState({
      duelist1: { hand: ["nombramiento-diplomatico"], field: [actor("agitador", { instanceId: 1 })] },
      duelist2: {
        field: [actor("el-caudillo", { instanceId: 2, controllerId: "duelist2" })],
        backroomPolicies: [equip("maletin-de-sobornos", 2, "duelist2")],
      },
    });
  }

  it("needs an opposing Actor as its target", () => {
    const state = setup();
    expect(activatePolicy(state, "nombramiento-diplomatico")).toEqual({ ok: false, reason: "target-required" });
    expect(activatePolicy(state, "nombramiento-diplomatico", { targetInstanceId: 1 })).toEqual({
      ok: false,
      reason: "target-not-opposing",
    });
    expect(state.duelists.duelist1.hand).toEqual(["nombramiento-diplomatico"]);
  });

  it("sends the target and its equips to the opponent's Embajada", () => {
    const state = setup();
    expect(activatePolicy(state, "nombramiento-diplomatico", { targetInstanceId: 2 })).toEqual({ ok: true });
    expect(state.duelists.duelist2.field).toEqual([]);
    expect(state.duelists.duelist2.archive).toEqual(["el-caudillo", "maletin-de-sobornos"]);
    expect(state.duelists.duelist1.archive).toEqual(["nombramiento-diplomatico"]);
    expect(events(state)[0]).toEqual({
      kind: "policy-activated",
      duelistId: "duelist1",
      cardId: "nombramiento-diplomatico",
      targetCardId: "el-caudillo",
    });
  });

  it("can hit a face-down Actor without naming it in the log", () => {
    const state = setup();
    state.duelists.duelist2.field[0].facing = "face-down";
    state.duelists.duelist2.field[0].stance = "resistance";
    activatePolicy(state, "nombramiento-diplomatico", { targetInstanceId: 2 });
    expect(events(state)[0]).toMatchObject({ kind: "policy-activated", targetCardId: null });
    // It is public once it reaches La Embajada.
    expect(events(state)[1]).toMatchObject({ kind: "sent-to-embassy", cardId: "el-caudillo" });
  });

  it("works from a Set card too", () => {
    const state = setup();
    setPolicy(state, "nombramiento-diplomatico");
    const set = state.duelists.duelist1.backroomPolicies[0];
    expect(activateSetPolicy(state, set.instanceId)).toEqual({ ok: false, reason: "target-required" });
    expect(activateSetPolicy(state, set.instanceId, { targetInstanceId: 2 })).toEqual({ ok: true });
    expect(state.duelists.duelist2.field).toEqual([]);
    expect(state.duelists.duelist1.backroomPolicies).toEqual([]);
  });
});

describe("Llamado a Consultas", () => {
  it("returns the most recently sent Actor from your Embajada to your hand", () => {
    const archive: CardId[] = ["la-tribuna", "decreto-de-emergencia", "el-caudillo", "maletin-de-sobornos"];
    const state = createState({ duelist1: { hand: ["llamado-a-consultas"], archive } });
    activatePolicy(state, "llamado-a-consultas");
    expect(state.duelists.duelist1.hand).toEqual(["el-caudillo"]);
    expect(state.duelists.duelist1.archive).toEqual([
      "la-tribuna",
      "decreto-de-emergencia",
      "maletin-de-sobornos",
      "llamado-a-consultas",
    ]);
    expect(events(state)[1]).toEqual({ kind: "returned-to-hand", duelistId: "duelist1", cardId: "el-caudillo", fromOpponent: false });
  });

  it("can't be activated (and stays in hand) when there's no Actor in your Embajada", () => {
    const state = createState({ duelist1: { hand: ["llamado-a-consultas"], archive: ["decreto-de-emergencia"] } });
    expect(activatePolicy(state, "llamado-a-consultas")).toEqual({ ok: false, reason: "nothing-to-retrieve" });
    expect(state.duelists.duelist1.hand).toEqual(["llamado-a-consultas"]);
  });
});

describe("Campaña de Desprestigio (hostile equip)", () => {
  it("attaches to an opposing Actor from your Backroom and cuts its ATK by 3", () => {
    const state = createState({
      duelist1: { hand: ["campana-de-desprestigio"], field: [actor("agitador", { instanceId: 1 })] },
      duelist2: { field: [actor("la-tribuna", { instanceId: 2, controllerId: "duelist2" })] },
    });
    expect(activatePolicy(state, "campana-de-desprestigio", { targetInstanceId: 1 })).toEqual({
      ok: false,
      reason: "target-not-opposing",
    });
    expect(activatePolicy(state, "campana-de-desprestigio", { targetInstanceId: 2, zone: 3 })).toEqual({ ok: true });

    const policy = state.duelists.duelist1.backroomPolicies[0];
    expect([policy.zone, policy.equippedToInstanceId, policy.faceDown]).toEqual([3, 2, false]);
    expect(getEffectiveStats(state.duelists.duelist2.field[0], state)).toEqual({ atk: 1, def: 2 });
  });

  it("never takes ATK below 0, and goes to ITS controller's Embajada when the Actor leaves", () => {
    const state = createState({
      phase: "confrontation",
      duelist1: {
        field: [actor("la-tribuna", { instanceId: 1 })],
        backroomPolicies: [equip("campana-de-desprestigio", 2, "duelist1")],
      },
      duelist2: { field: [actor("fiscal-de-barrio", { instanceId: 2, controllerId: "duelist2" })] },
    });
    expect(getEffectiveStats(state.duelists.duelist2.field[0], state)).toEqual({ atk: 0, def: 5 });

    // Fiscal 0/5 in Campaign vs La Tribuna 4: Fiscal is destroyed.
    declareAttack(state, 1, 2);
    expect(state.duelists.duelist2.archive).toEqual(["fiscal-de-barrio"]);
    expect(state.duelists.duelist1.archive).toEqual(["campana-de-desprestigio"]);
    expect(state.duelists.duelist1.backroomPolicies).toEqual([]);
    expect(state.duelists.duelist2.mandate).toBe(16);
  });
});

describe("Subsidio Electoral", () => {
  it("gives your Actor +1 ATK / +3 DEF", () => {
    const state = createState({
      duelist1: { hand: ["subsidio-electoral"], field: [actor("agitador", { instanceId: 1 })] },
    });
    activatePolicy(state, "subsidio-electoral", { targetInstanceId: 1 });
    expect(getEffectiveStats(state.duelists.duelist1.field[0], state)).toEqual({ atk: 4, def: 4 });
  });
});

// --- Wave 2 Scandals ----------------------------------------------------------

describe("Chuzadas", () => {
  function setup(opponentField: FieldActor[]): DuelState {
    return createState({
      phase: "confrontation",
      duelist1: { field: [actor("la-tribuna", { instanceId: 1 })] },
      duelist2: {
        field: opponentField,
        setScandals: [{ instanceId: 3, cardId: "chuzadas", controllerId: "duelist2", zone: 0 }],
      },
    });
  }

  it("destroys an Actor that attacks you directly, before any damage", () => {
    const state = setup([]);
    expect(declareAttack(state, 1)).toEqual({
      ok: true,
      outcome: { attackerDestroyed: true, defenderDestroyed: false, mandateDamage: 0 },
    });
    expect(state.duelists.duelist2.mandate).toBe(20);
    expect(state.duelists.duelist2.archive).toEqual(["chuzadas"]);
  });

  it("ignores attacks on your Actors", () => {
    const state = setup([actor("agitador", { instanceId: 2, controllerId: "duelist2" })]);
    declareAttack(state, 1, 2);
    expect(state.duelists.duelist2.setScandals).toHaveLength(1);
    expect(state.duelists.duelist1.field).toHaveLength(1);
  });
});

describe("Moción de Censura", () => {
  function setup(): DuelState {
    return createState({
      duelist1: { hand: ["la-senadora-eterna"], field: [actor("agitador", { instanceId: 1 })] },
      duelist2: { setScandals: [{ instanceId: 3, cardId: "mocion-de-censura", controllerId: "duelist2", zone: 0 }] },
    });
  }

  it("sends a face-up Establishment Actor away after its tribute, before its own effect", () => {
    const state = setup();
    expect(
      deployActor(state, "la-senadora-eterna", { stance: "campaign", facing: "face-up", tributeInstanceId: 1 }),
    ).toEqual({ ok: true });
    expect(state.duelists.duelist1.field).toEqual([]);
    expect(state.duelists.duelist1.archive).toEqual(["agitador", "la-senadora-eterna"]);
    // Her on-deploy draw never happened.
    expect(state.duelists.duelist1.hand).toEqual([]);
    expect(kinds(state)).toEqual([
      "sent-to-embassy",
      "actor-deployed",
      "scandal-triggered",
      "sent-to-embassy",
    ]);
  });

  it("can't see a face-down Set, and ignores Grassroots deploys", () => {
    const state = setup();
    deployActor(state, "la-senadora-eterna", { stance: "resistance", facing: "face-down", tributeInstanceId: 1 });
    expect(state.duelists.duelist1.field).toHaveLength(1);
    expect(state.duelists.duelist2.setScandals).toHaveLength(1);

    const grassroots = createState({
      duelist1: { hand: ["agitador"] },
      duelist2: { setScandals: [{ instanceId: 3, cardId: "mocion-de-censura", controllerId: "duelist2", zone: 0 }] },
    });
    deployActor(grassroots, "agitador", { stance: "campaign", facing: "face-up" });
    expect(grassroots.duelists.duelist2.setScandals).toHaveLength(1);
  });
});

describe("Filtración a la Prensa", () => {
  it("costs the attacker 3 Mandate, and the battle still happens", () => {
    const state = createState({
      phase: "confrontation",
      duelist1: { field: [actor("la-tribuna", { instanceId: 1 })] },
      duelist2: {
        field: [actor("agitador", { instanceId: 2, controllerId: "duelist2" })],
        setScandals: [{ instanceId: 3, cardId: "filtracion-a-la-prensa", controllerId: "duelist2", zone: 0 }],
      },
    });
    declareAttack(state, 1, 2);
    expect(state.duelists.duelist1.mandate).toBe(17);
    expect(state.duelists.duelist2.field).toEqual([]);
    expect(state.duelists.duelist2.mandate).toBe(19);
    expect(kinds(state)).toEqual([
      "attack-declared",
      "scandal-triggered",
      "mandate-changed",
      "battle",
      "sent-to-embassy",
    ]);
  });

  it("wins the duel on the spot if the leak takes the attacker to 0 -- no battle follows", () => {
    const state = createState({
      phase: "confrontation",
      duelist1: { mandate: 3, field: [actor("la-tribuna", { instanceId: 1 })] },
      duelist2: {
        field: [actor("agitador", { instanceId: 2, controllerId: "duelist2" })],
        setScandals: [{ instanceId: 3, cardId: "filtracion-a-la-prensa", controllerId: "duelist2", zone: 0 }],
      },
    });
    declareAttack(state, 1, 2);
    expect(state.winnerId).toBe("duelist2");
    expect(state.duelists.duelist2.field).toHaveLength(1);
    expect(kinds(state)).not.toContain("battle");
    expect(kinds(state).at(-1)).toBe("duel-won");
  });
});
