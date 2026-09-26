import { describe, expect, it } from "vitest";
import type { CardId } from "@project-palacio/duel-content";
import { CARDS } from "@project-palacio/duel-content";
import { buildDefaultDeck, DuelRoom } from "../DuelRoom";
import type { PlayerAction } from "../../protocol/Messages";

// A fixed deck for tests that need to know what's in the opening hand --
// the default deck is shuffled, so its hand order isn't predictable.
const KNOWN_DECK: CardId[] = [
  "agitador",
  "maletin-de-sobornos",
  "decreto-de-emergencia",
  "escandalo-de-corrupcion",
  "la-tribuna",
  "fiscal-de-barrio",
  "operador-politico",
];

function roomInCampaignPhase(): DuelRoom {
  const room = new DuelRoom(KNOWN_DECK, KNOWN_DECK);
  room.applyAction("duelist1", { type: "advance-phase" }); // -> campaign-1
  return room;
}

describe("DuelRoom", () => {
  it("assigns duelist1 then duelist2 on the first two joins, then rejects a third", () => {
    const room = new DuelRoom();

    expect(room.join()).toBe("duelist1");
    expect(room.isFull()).toBe(false);
    expect(room.join()).toBe("duelist2");
    expect(room.isFull()).toBe(true);
    expect(room.join()).toBeNull();
  });

  it("mints a reconnect token per slot on join, and reconnect() reclaims the right slot", () => {
    const room = new DuelRoom();

    room.join(); // duelist1
    room.join(); // duelist2
    const token1 = room.tokenFor("duelist1");
    const token2 = room.tokenFor("duelist2");

    expect(token1).toBeTruthy();
    expect(token2).toBeTruthy();
    expect(token1).not.toBe(token2);
    expect(room.reconnect(token1!)).toBe("duelist1");
    expect(room.reconnect(token2!)).toBe("duelist2");
    expect(room.reconnect("not-a-real-token")).toBeNull();
  });

  it("tracks per-slot connection state and reports when every filled slot has gone quiet", () => {
    const room = new DuelRoom();
    room.join();
    room.join();

    expect(room.isSlotConnected("duelist1")).toBe(true);
    expect(room.allFilledSlotsDisconnected()).toBe(false);

    room.disconnectSlot("duelist1");
    expect(room.isSlotConnected("duelist1")).toBe(false);
    expect(room.allFilledSlotsDisconnected()).toBe(false); // duelist2 still connected

    room.disconnectSlot("duelist2");
    expect(room.allFilledSlotsDisconnected()).toBe(true);

    room.reconnect(room.tokenFor("duelist1")!);
    expect(room.allFilledSlotsDisconnected()).toBe(false);
  });

  it("starts with a duel already set up via the engine's own defaults", () => {
    const room = new DuelRoom();

    expect(room.state.turnNumber).toBe(1);
    expect(room.state.activeDuelistId).toBe("duelist1");
    expect(room.state.duelists.duelist1.hand).toHaveLength(5);
  });

  it("shuffles the default deck, keeping exactly the same cards", () => {
    // A pinned random source: always 0 -> a fixed, non-identity permutation
    // (and the same Leaders picked for the listing and the room).
    const listed = buildDefaultDeck("world", () => 0);
    const room = new DuelRoom(undefined, undefined, () => 0, "world");
    const d1 = room.state.duelists.duelist1;
    const dealt = [...d1.hand, ...d1.deck];

    expect(dealt).not.toEqual(listed);
    expect([...dealt].sort()).toEqual([...listed].sort());
  });

  it("uses explicitly provided decks exactly as given (no shuffle)", () => {
    const room = new DuelRoom(KNOWN_DECK, KNOWN_DECK, () => 0);

    expect(room.state.duelists.duelist1.hand).toEqual(KNOWN_DECK.slice(0, 5));
    expect(room.state.duelists.duelist1.deck).toEqual(KNOWN_DECK.slice(5));
  });

  it("rejects an action from the duelist whose turn it isn't", () => {
    const room = new DuelRoom();

    expect(room.applyAction("duelist2", { type: "advance-phase" })).toEqual({
      ok: false,
      reason: "not-your-turn",
    });
  });

  it("routes advance-phase to the engine's TurnSystem", () => {
    const room = new DuelRoom();

    expect(room.applyAction("duelist1", { type: "advance-phase" })).toEqual({ ok: true });
    expect(room.state.phase).toBe("campaign-1");
  });

  it("routes deploy-actor to the engine and surfaces its result", () => {
    const room = roomInCampaignPhase();

    const result = room.applyAction("duelist1", {
      type: "deploy-actor",
      actorCardId: "agitador",
      options: { stance: "campaign", facing: "face-up" },
    });

    expect(result).toEqual({ ok: true });
    expect(room.state.duelists.duelist1.field).toHaveLength(1);
  });

  it("surfaces an engine rejection reason unchanged (e.g. wrong phase)", () => {
    const room = new DuelRoom(KNOWN_DECK, KNOWN_DECK);

    // Still in the Agenda Phase -- deploy isn't legal yet.
    const result = room.applyAction("duelist1", {
      type: "deploy-actor",
      actorCardId: "agitador",
      options: { stance: "campaign", facing: "face-up" },
    });

    expect(result).toEqual({ ok: false, reason: "wrong-phase" });
  });

  describe("untrusted input (actions are parsed JSON from a client)", () => {
    // Each of these used to throw (crashing the whole server process) or
    // corrupt the duel state. They must now be rejected cleanly.
    const badActions: Array<[string, unknown, string]> = [
      [
        "a Policy card sent as deploy-actor",
        { type: "deploy-actor", actorCardId: "maletin-de-sobornos", options: { stance: "campaign", facing: "face-up" } },
        "not-an-actor",
      ],
      ["an Actor card sent as activate-policy", { type: "activate-policy", policyCardId: "agitador" }, "not-a-policy"],
      ["an Actor card sent as set-scandal", { type: "set-scandal", scandalCardId: "agitador" }, "not-a-scandal"],
      ["an unknown action type", { type: "delete-everything" }, "unknown-action"],
      ["a null action", null, "invalid-action"],
      ["a non-object action", "advance-phase", "invalid-action"],
      [
        "deploy-actor with null options",
        { type: "deploy-actor", actorCardId: "agitador", options: null },
        "invalid-stance-or-facing",
      ],
    ];

    for (const [label, action, reason] of badActions) {
      it(`rejects ${label} without throwing or changing state`, () => {
        const room = roomInCampaignPhase();
        const before = JSON.stringify(room.state);

        const result = room.applyAction("duelist1", action as PlayerAction);

        expect(result).toEqual({ ok: false, reason });
        expect(JSON.stringify(room.state)).toBe(before);
      });
    }
  });

  it("passes a chosen Backroom zone through to the engine", () => {
    const room = roomInCampaignPhase();
    expect(
      room.applyAction("duelist1", { type: "set-scandal", scandalCardId: "escandalo-de-corrupcion", zone: 2 }),
    ).toEqual({ ok: true });
    expect(room.state.duelists.duelist1.setScandals[0].zone).toBe(2);
  });

  it("passes a chosen Actor zone through to the engine", () => {
    const room = roomInCampaignPhase();
    room.applyAction("duelist1", {
      type: "deploy-actor",
      actorCardId: "agitador",
      options: { stance: "campaign", facing: "face-up", zone: 4 },
    });
    expect(room.state.duelists.duelist1.field[0].zone).toBe(4);
  });

  it("routes set-policy and activate-set-policy to the engine", () => {
    const room = roomInCampaignPhase();

    expect(
      room.applyAction("duelist1", { type: "set-policy", policyCardId: "decreto-de-emergencia", zone: 4 }),
    ).toEqual({ ok: true });
    const set = room.state.duelists.duelist1.backroomPolicies[0];
    expect([set.zone, set.faceDown]).toEqual([4, true]);

    expect(room.applyAction("duelist1", { type: "activate-set-policy", instanceId: set.instanceId })).toEqual({
      ok: true,
    });
    expect(room.state.duelists.duelist1.mandate).toBe(25);
    expect(room.state.duelists.duelist1.backroomPolicies).toEqual([]);
  });

  it("routes change-stance to the engine", () => {
    const room = roomInCampaignPhase();
    expect(
      room.applyAction("duelist1", {
        type: "deploy-actor",
        actorCardId: "agitador",
        options: { stance: "resistance", facing: "face-down" },
      }),
    ).toEqual({ ok: true });
    const instanceId = room.state.duelists.duelist1.field[0].instanceId;

    // Not the turn it was deployed.
    expect(room.applyAction("duelist1", { type: "change-stance", instanceId })).toEqual({
      ok: false,
      reason: "deployed-this-turn",
    });

    // Rest of duelist1's turn + all of duelist2's, into duelist1's Campaign 1.
    for (let i = 0; i < 10; i += 1) {
      room.applyAction(room.state.activeDuelistId, { type: "advance-phase" });
    }
    expect([room.state.activeDuelistId, room.state.phase]).toEqual(["duelist1", "campaign-1"]);

    // Only the active duelist may act.
    expect(room.applyAction("duelist2", { type: "change-stance", instanceId })).toEqual({
      ok: false,
      reason: "not-your-turn",
    });

    expect(room.applyAction("duelist1", { type: "change-stance", instanceId })).toEqual({ ok: true });
    const actor = room.state.duelists.duelist1.field[0];
    expect([actor.stance, actor.facing]).toEqual(["campaign", "face-up"]);
  });

  it("builds the Colombia deck from its whole pool: 2 of each Grassroots Actor, 1 of everything else", () => {
    const deck = buildDefaultDeck("colombia");
    const count = (id: CardId) => deck.filter((card) => card === id).length;

    expect(deck).toHaveLength(34);
    expect([count("agitador"), count("la-influencer"), count("el-registrador")]).toEqual([2, 2, 2]);
    expect([count("el-caudillo"), count("la-senadora-eterna"), count("el-expresidente")]).toEqual([1, 1, 1]);
    expect([count("nombramiento-diplomatico"), count("chuzadas"), count("mocion-de-censura")]).toEqual([1, 1, 1]);
    expect(deck.some((id) => CARDS[id].edition !== "colombia")).toBe(false);
  });

  it("builds a 40-card World deck: 2 of each common, 1 of each uncommon/Establishment/Policy/Scandal, and 2 random Leaders", () => {
    const deck = buildDefaultDeck("world", () => 0.5);
    const count = (id: CardId) => deck.filter((card) => card === id).length;
    const leaders = deck.filter((id) => CARDS[id].category === "actor" && (CARDS[id] as { tier: string }).tier === "leader");

    expect(deck).toHaveLength(40);
    expect(deck.some((id) => CARDS[id].edition !== "world")).toBe(false);
    expect([count("protester"), count("bureaucrat"), count("lobbyist"), count("career-senator")]).toEqual([2, 2, 1, 1]);
    expect([count("presidential-pardon"), count("recount")]).toEqual([1, 1]);
    expect(leaders).toHaveLength(2);
    expect(new Set(leaders).size).toBe(2);
  });

  it("defaults a room to the World Edition", () => {
    const room = new DuelRoom();
    const d1 = room.state.duelists.duelist1;
    expect(room.edition).toBe("world");
    expect([...d1.hand, ...d1.deck].every((id) => CARDS[id].edition === "world")).toBe(true);
  });

  it("routes a targeted Policy's target through activate-policy", () => {
    const room = new DuelRoom(
      ["agitador", "nombramiento-diplomatico", "la-tribuna", "la-tribuna", "la-tribuna", "la-tribuna", "la-tribuna"],
      ["agitador", "la-tribuna", "la-tribuna", "la-tribuna", "la-tribuna", "la-tribuna", "la-tribuna"],
    );
    room.applyAction("duelist1", { type: "advance-phase" });
    room.applyAction("duelist1", {
      type: "deploy-actor",
      actorCardId: "agitador",
      options: { stance: "campaign", facing: "face-up" },
    });
    for (let i = 0; i < 5; i += 1) room.applyAction("duelist1", { type: "advance-phase" });
    room.applyAction("duelist2", { type: "advance-phase" });
    room.applyAction("duelist2", {
      type: "deploy-actor",
      actorCardId: "agitador",
      options: { stance: "campaign", facing: "face-up" },
    });
    for (let i = 0; i < 5; i += 1) room.applyAction("duelist2", { type: "advance-phase" });
    room.applyAction("duelist1", { type: "advance-phase" }); // T3 duelist1 campaign-1

    const theirs = room.state.duelists.duelist2.field[0].instanceId;
    expect(
      room.applyAction("duelist1", {
        type: "activate-policy",
        policyCardId: "nombramiento-diplomatico",
        options: { targetInstanceId: theirs },
      }),
    ).toEqual({ ok: true });
    expect(room.state.duelists.duelist2.field).toEqual([]);
    expect(room.state.duelists.duelist2.archive).toEqual(["agitador"]);
  });

  it("rejects play once the duel is over, and starts a fresh duel when both players ask for a rematch", () => {
    const room = new DuelRoom(KNOWN_DECK, KNOWN_DECK);
    expect(room.applyAction("duelist1", { type: "rematch" })).toEqual({ ok: false, reason: "duel-not-over" });

    room.state.winnerId = "duelist2";
    expect(room.applyAction("duelist1", { type: "advance-phase" })).toEqual({ ok: false, reason: "duel-over" });

    // Either player can ask, whoever's turn it was.
    expect(room.applyAction("duelist2", { type: "rematch" })).toEqual({ ok: true });
    expect(room.rematchVotes()).toEqual(["duelist2"]);
    expect(room.state.winnerId).toBe("duelist2");

    expect(room.applyAction("duelist1", { type: "rematch" })).toEqual({ ok: true });
    expect(room.rematchVotes()).toEqual([]);
    expect([room.state.winnerId, room.state.turnNumber, room.state.phase]).toEqual([null, 1, "agenda"]);
    expect(room.state.duelists.duelist1.hand).toEqual(KNOWN_DECK.slice(0, 5));
    expect(room.state.election).toEqual({ turn: 12, runoff: false });
  });
});
