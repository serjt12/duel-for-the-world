import { describe, expect, it } from "vitest";
import type { CardId } from "@duel-for-the-world/duel-content";
import type { DuelistState, FieldActor } from "@duel-for-the-world/duel-engine";
import { redactStateFor } from "../../protocol/redact";
import { DuelRoom } from "../../rooms/DuelRoom";
import { AiPlayer } from "../AiPlayer";
import { chooseAiAction } from "../chooseAiAction";
import type { AiLevel } from "../chooseAiAction";
import { candidateActions, imagineState } from "../search";

function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function actor(cardId: FieldActor["cardId"], overrides: Partial<FieldActor> = {}): FieldActor {
  return {
    instanceId: 1,
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

// A World room whose state we then shape by hand.
function roomWith(overrides: { phase?: "campaign-1" | "confrontation" | "campaign-2"; turn?: number; d1?: Partial<DuelistState>; d2?: Partial<DuelistState> }): DuelRoom {
  const filler: CardId[] = Array.from({ length: 20 }, () => "protester");
  const room = new DuelRoom(filler, filler, () => 0.5, "world");
  const state = room.state;
  state.turnNumber = overrides.turn ?? 5;
  state.phase = overrides.phase ?? "campaign-1";
  Object.assign(state.duelists.duelist1, { hand: [], field: [], ...overrides.d1 });
  Object.assign(state.duelists.duelist2, { hand: [], field: [], ...overrides.d2 });
  state.nextInstanceId = 100;
  return room;
}

const decide = (room: DuelRoom, level: AiLevel) =>
  chooseAiAction(redactStateFor(room.state, "duelist1", { edition: "world" }), "duelist1", level, { random: seeded(1) });

describe("the computer opponent", () => {
  it("finishes whole duels at every level without getting stuck", () => {
    for (const [a, b] of [["easy", "normal"], ["normal", "hard"]] as const) {
      const random = seeded(7);
      const room = new DuelRoom(undefined, undefined, random, "world");
      const players = { duelist1: new AiPlayer(room, "duelist1", a, random), duelist2: new AiPlayer(room, "duelist2", b, random) };
      let steps = 0;
      while (!room.state.winnerId && steps < 3000) {
        players[room.state.activeDuelistId].step();
        steps += 1;
      }
      expect(room.state.winnerId === null).toBe(false);
    }
  });

  it("decides from its redacted view only: the opponent's hidden cards can't change its move", () => {
    const base = () =>
      roomWith({
        d1: { hand: ["protester", "riot-cop"] },
        d2: {
          hand: ["bot-farm"],
          field: [actor("bureaucrat", { instanceId: 7, controllerId: "duelist2", stance: "resistance", facing: "face-down" })],
          setScandals: [{ instanceId: 8, cardId: "hot-mic", controllerId: "duelist2", zone: 0 }],
        },
      });
    const a = base();
    const b = base();
    // Different hidden cards, same public picture.
    b.state.duelists.duelist2.hand = ["impeachment"];
    b.state.duelists.duelist2.field[0].cardId = "riot-cop";
    b.state.duelists.duelist2.setScandals[0].cardId = "leaked-emails";
    for (const level of ["easy", "normal", "hard"] as const) {
      expect(decide(a, level)).toEqual(decide(b, level));
    }
  });

  it("attacks a weaker Campaign Actor with a stronger one", () => {
    const room = roomWith({
      phase: "confrontation",
      d1: { field: [actor("protester", { instanceId: 1 })] },
      d2: { field: [actor("intern", { instanceId: 2, controllerId: "duelist2" })] },
    });
    expect(decide(room, "normal")).toEqual({ type: "declare-attack", attackerInstanceId: 1, targetInstanceId: 2 });
  });

  it("doesn't throw an Actor into a stronger one -- it moves on instead", () => {
    const room = roomWith({
      phase: "confrontation",
      d1: { field: [actor("intern", { instanceId: 1 })] },
      d2: { field: [actor("career-senator", { instanceId: 2, controllerId: "duelist2" })] },
    });
    expect(decide(room, "normal")).toEqual({ type: "advance-phase" });
  });

  it("picks the most valuable card when a retrieval lets it choose", () => {
    const room = roomWith({ d1: { hand: ["presidential-pardon"], archive: ["intern", "career-senator", "protester"] } });
    expect(decide(room, "normal")).toEqual({
      type: "activate-policy",
      policyCardId: "presidential-pardon",
      options: { embassyPick: 1 },
    });
  });

  it("Hard finds the lethal direct attack", () => {
    const room = roomWith({
      phase: "confrontation",
      d1: { field: [actor("protester", { instanceId: 1 })] },
      d2: { mandate: 3 },
    });
    expect(decide(room, "hard")).toEqual({ type: "declare-attack", attackerInstanceId: 1 });
  });

  it("Hard's imagined worlds keep every visible card and every count", () => {
    const room = roomWith({
      d1: { hand: ["protester"], archive: ["intern"] },
      d2: { hand: ["bot-farm", "hot-mic"], archive: ["riot-cop"], setScandals: [{ instanceId: 9, cardId: "recount", controllerId: "duelist2", zone: 1 }] },
    });
    const view = redactStateFor(room.state, "duelist1", { edition: "world" });
    const world = imagineState(view, seeded(3));
    expect(world.duelists.duelist1.hand).toEqual(["protester"]);
    expect(world.duelists.duelist2.hand).toHaveLength(2);
    expect(world.duelists.duelist2.archive).toEqual(["riot-cop"]);
    expect(world.duelists.duelist2.setScandals).toHaveLength(1);
    expect(world.duelists.duelist2.deck).toHaveLength(room.state.duelists.duelist2.deck.length);
  });

  it("only considers moves that are its own to make", () => {
    const room = roomWith({
      phase: "confrontation",
      d1: { field: [actor("protester", { instanceId: 1 }), actor("intern", { instanceId: 3, zone: 1, turnDeployed: 5 })] },
      d2: { field: [actor("riot-cop", { instanceId: 2, controllerId: "duelist2" })] },
    });
    const view = redactStateFor(room.state, "duelist1", { edition: "world" });
    // The Intern was deployed this turn: only the Protester may attack.
    expect(candidateActions(view, "duelist1")).toEqual([
      { type: "advance-phase" },
      { type: "declare-attack", attackerInstanceId: 1, targetInstanceId: 2 },
    ]);
  });
});
