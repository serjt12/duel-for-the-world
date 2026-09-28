import { describe, expect, it } from "vitest";
import type { PlayerAction, PublicDuelState } from "@duel-for-the-world/duel-server";
import { DuelRoom, redactStateFor } from "@duel-for-the-world/duel-server/offline";
import { ScriptedSeat } from "../ScriptedSeat";
import {
  fieldInstance,
  GUIDE_DECKS,
  GUIDE_ELECTION_TURN,
  GUIDE_OPPONENT_SCRIPT,
  GUIDE_STEPS,
  GUIDE_THEM,
  GUIDE_YOU,
} from "../script";

// Plays the guided first duel from start to finish exactly as a player
// following the tips would, and checks every tip can be completed.

function setup() {
  const room = new DuelRoom(GUIDE_DECKS.you, GUIDE_DECKS.them, () => 0.5, "world");
  room.state.election.turn = GUIDE_ELECTION_TURN;
  const computer = new ScriptedSeat(room, GUIDE_THEM, GUIDE_OPPONENT_SCRIPT);
  const view = (): PublicDuelState => redactStateFor(room.state, GUIDE_YOU, { edition: "world" });
  return { room, computer, view };
}

// What the player does for each "do" step (by step title and turn).
function moveFor(stepIndex: number, view: PublicDuelState): PlayerAction {
  const step = GUIDE_STEPS[stepIndex];
  const you = (cardId: Parameters<typeof fieldInstance>[2]) => fieldInstance(view, "you", cardId) as number;
  const them = (cardId: Parameters<typeof fieldInstance>[2]) => fieldInstance(view, "them", cardId) as number;
  switch (step.title) {
    case "Deploy an Actor":
      return { type: "deploy-actor", actorCardId: "protester", options: { stance: "campaign", facing: "face-up" } };
    case "Resistance stance":
      return { type: "deploy-actor", actorCardId: "riot-cop", options: { stance: "resistance", facing: "face-up" } };
    case "Attack!":
      return { type: "declare-attack", attackerInstanceId: you("protester"), targetInstanceId: them("talk-show-host") };
    case "Set a Scandal":
      return { type: "set-scandal", scandalCardId: "hot-mic" };
    case "Play a Policy":
      return { type: "activate-policy", policyCardId: "bot-farm" };
    case "Equip an Actor":
      return { type: "activate-policy", policyCardId: "lobbying-deal", options: { targetInstanceId: you("protester") } };
    case "Attack their Protester":
      return { type: "declare-attack", attackerInstanceId: you("protester"), targetInstanceId: them("protester") };
    case "Stand up for the count":
      return { type: "change-stance", instanceId: you("riot-cop") };
    default:
      return { type: "advance-phase" };
  }
}

describe("the guided first duel", () => {
  it("can be followed from the first tip to a won election", () => {
    const { room, computer, view } = setup();
    let guard = 0;
    for (let index = 0; index < GUIDE_STEPS.length; index += 1) {
      const step = GUIDE_STEPS[index];
      if (step.kind === "next") continue;
      if (step.kind === "end") break;
      while (!step.done(view()) && guard < 500) {
        guard += 1;
        if (step.kind === "watch") {
          expect(computer.isToMove(), `step ${index} (${step.title}): nobody moves`).toBe(true);
          expect(computer.step()?.result.ok, `step ${index}: a scripted move was rejected`).toBe(true);
          continue;
        }
        const action = moveFor(index, view());
        expect(step.allow(action, view()), `step ${index} (${step.title}) blocks ${action.type}`).toBe(true);
        const result = room.applyAction(GUIDE_YOU, action);
        expect(result.ok, `step ${index} (${step.title}): ${result.ok ? "" : result.reason}`).toBe(true);
      }
    }
    const final = view();
    expect(final.winnerId).toBe(GUIDE_YOU);
    expect(final.duelists[GUIDE_YOU].mandate).toBe(20); // 26 - 2 (Talk-Show Host) - 4 (Leaked Emails)
    expect(final.polls[GUIDE_YOU].total).toBe(31); // 20 mandate + 8 campaign ATK + 3 bonus votes
    expect(final.polls[GUIDE_THEM].total).toBe(24); // 26 - 1 (lost Host) - 1 (lost Protester)
  });

  it("blocks moves that aren't the tip's", () => {
    const { view } = setup();
    const deploy = GUIDE_STEPS.find((step) => step.title === "Deploy an Actor");
    if (deploy?.kind !== "do") throw new Error("missing step");
    expect(deploy.allow({ type: "advance-phase" }, view())).toBe(false);
    expect(
      deploy.allow({ type: "deploy-actor", actorCardId: "protester", options: { stance: "resistance", facing: "face-up" } }, view()),
    ).toBe(false);
  });
});
