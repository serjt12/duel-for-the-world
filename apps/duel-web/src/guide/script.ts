import type { CardId } from "@duel-for-the-world/duel-content";
import type { DuelistId } from "@duel-for-the-world/duel-engine";
import type { PlayerAction, PublicDuelState, PublicFieldActor } from "@duel-for-the-world/duel-server";

// The guided first duel: a short, fully scripted World Edition match that
// teaches the basics one step at a time. Both decks are stacked, the
// computer follows a fixed script (ScriptedSeat.ts) and the election comes
// early (after turn 6), so the whole lesson takes a few minutes.
//
// Every step either waits for "Next", waits for one specific move (other
// moves are blocked with a nudge), or waits while the computer plays.
// Steps are pure data over the public state, so the script can be played
// through headlessly and checked (see guide/__tests__).

export const GUIDE_YOU: DuelistId = "duelist1";
export const GUIDE_THEM: DuelistId = "duelist2";
export const GUIDE_ELECTION_TURN = 6;

const FILLER: CardId[] = ["bureaucrat", "party-loyalist", "intern", "bureaucrat", "party-loyalist", "intern"];

// Draw order: the first 5 are the opening hand; you go first (no draw on
// turn 1), then draw on turns 3 and 5. The computer draws on 2, 4 and 6.
export const GUIDE_DECKS: { you: CardId[]; them: CardId[] } = {
  you: ["protester", "riot-cop", "hot-mic", "lobbying-deal", "bot-farm", "intern", "pollster", ...FILLER],
  them: ["talk-show-host", "protester", "presidential-pardon", "leaked-emails", "riot-cop", "bureaucrat", "bureaucrat", "bureaucrat", ...FILLER],
};

/** The computer's moves, by "turn:phase". Anything else: it advances. */
export const GUIDE_OPPONENT_SCRIPT: Record<string, PlayerAction[]> = {
  "2:campaign-1": [{ type: "deploy-actor", actorCardId: "talk-show-host", options: { stance: "campaign", facing: "face-up" } }],
  "4:campaign-1": [
    { type: "deploy-actor", actorCardId: "protester", options: { stance: "campaign", facing: "face-up" } },
    // Brings the Talk-Show Host back from its Embassy (the only Actor there).
    { type: "activate-policy", policyCardId: "presidential-pardon" },
    { type: "set-scandal", scandalCardId: "leaked-emails" },
  ],
  "6:campaign-1": [{ type: "deploy-actor", actorCardId: "riot-cop", options: { stance: "resistance", facing: "face-up" } }],
};

// --- What a step can point at ------------------------------------------------

export type GuideTarget =
  | { kind: "hand"; cardId: CardId }
  // A card on the field (found by card, on your side or theirs).
  | { kind: "field"; side: "you" | "them"; cardId: CardId }
  // The opponent's face-down Set cards.
  | { kind: "their-set" }
  // A button in the open card menu, by its stable action id (set as
  // data-guide-action on the button -- see ui/renderBoard.ts's
  // menuButton() -- rather than by its translatable display label, so a
  // language switch never breaks the glow/highlight matching).
  | { kind: "menu"; action: string }
  | { kind: "advance" }
  | { kind: "mandate"; side: "you" | "them" }
  | { kind: "embassy"; side: "you" | "them" }
  | { kind: "poll" }
  | { kind: "election" };

export type GuideStep = {
  // i18n keys, resolved with t() at display time (guide/coach.ts) -- not
  // literal text -- so an in-progress tutorial re-labels itself instantly
  // on a language switch.
  title: string;
  text: string;
  targets?: GuideTarget[];
  // Where the tip sits on the phone stage: over your Backroom row ("low",
  // the default) or over your opponent's ("high", when your Backroom is
  // what the step is about).
  where?: "low" | "high";
} & (
  | { kind: "next"; button?: string }
  // One specific move: `allow` gates what you send, `done` ends the step.
  | { kind: "do"; allow: (action: PlayerAction, view: PublicDuelState) => boolean; done: (view: PublicDuelState) => boolean }
  // The computer's turn: nothing to do but watch.
  | { kind: "watch"; done: (view: PublicDuelState) => boolean }
  | { kind: "end" }
);

// --- Helpers over the public state -------------------------------------------

function actorOf(view: PublicDuelState, side: DuelistId, cardId: CardId): PublicFieldActor | undefined {
  return view.duelists[side].field.find((actor) => actor.cardId === cardId);
}

/** The instance on the field a target refers to (for highlighting and checks). */
export function fieldInstance(view: PublicDuelState, side: "you" | "them", cardId: CardId): number | null {
  return actorOf(view, side === "you" ? GUIDE_YOU : GUIDE_THEM, cardId)?.instanceId ?? null;
}

const yourTurn = (view: PublicDuelState): boolean => view.activeDuelistId === GUIDE_YOU;
const at = (view: PublicDuelState, turn: number, phase: PublicDuelState["phase"]): boolean =>
  view.turnNumber === turn && view.phase === phase;
const isAdvance = (action: PlayerAction): boolean => action.type === "advance-phase";

function advanceTo(turn: number, phase: PublicDuelState["phase"], titleKey: string, textKey: string): GuideStep {
  return {
    kind: "do",
    title: titleKey,
    text: textKey,
    targets: [{ kind: "advance" }],
    allow: isAdvance,
    done: (view) => at(view, turn, phase) || view.turnNumber > turn,
  };
}

function endTurn(turn: number, textKey: string): GuideStep {
  return {
    kind: "do",
    title: "guideStep.endTurn.title",
    text: textKey,
    targets: [{ kind: "advance" }],
    allow: isAdvance,
    done: (view) => view.turnNumber > turn,
  };
}

function watch(turn: number, textKey: string): GuideStep {
  return {
    kind: "watch",
    title: "guideStep.computersTurn.title",
    text: textKey,
    done: (view) => view.turnNumber > turn && yourTurn(view),
  };
}

function deploys(action: PlayerAction, cardId: CardId, stance: "campaign" | "resistance"): boolean {
  return (
    action.type === "deploy-actor" &&
    action.actorCardId === cardId &&
    action.options.stance === stance &&
    action.options.facing === "face-up"
  );
}

function attacks(action: PlayerAction, view: PublicDuelState, attacker: CardId, target: CardId): boolean {
  return (
    action.type === "declare-attack" &&
    action.attackerInstanceId === fieldInstance(view, "you", attacker) &&
    action.targetInstanceId !== undefined &&
    action.targetInstanceId === fieldInstance(view, "them", target)
  );
}

// --- The lesson ---------------------------------------------------------------

export const GUIDE_STEPS: GuideStep[] = [
  {
    kind: "next",
    button: "guideStep.s0.button",
    title: "guideStep.s0.title",
    text: "guideStep.s0.text",
    targets: [{ kind: "mandate", side: "you" }, { kind: "mandate", side: "them" }],
  },
  advanceTo(1, "campaign-1", "guideStep.s1.title", "guideStep.s1.text"),
  {
    kind: "do",
    title: "guideStep.s2.title",
    text: "guideStep.s2.text",
    targets: [{ kind: "hand", cardId: "protester" }, { kind: "menu", action: "deploy-campaign" }],
    allow: (action) => deploys(action, "protester", "campaign"),
    done: (view) => actorOf(view, GUIDE_YOU, "protester") !== undefined,
  },
  {
    kind: "next",
    title: "guideStep.s3.title",
    text: "guideStep.s3.text",
    targets: [{ kind: "field", side: "you", cardId: "protester" }, { kind: "poll" }],
  },
  endTurn(1, "guideStep.s4.text"),
  watch(1, "guideStep.s5.text"),
  {
    kind: "next",
    title: "guideStep.s6.title",
    text: "guideStep.s6.text",
    targets: [{ kind: "field", side: "them", cardId: "talk-show-host" }, { kind: "mandate", side: "you" }],
  },
  advanceTo(3, "campaign-1", "guideStep.s7.title", "guideStep.s7.text"),
  {
    kind: "do",
    title: "guideStep.s8.title",
    text: "guideStep.s8.text",
    targets: [{ kind: "hand", cardId: "riot-cop" }, { kind: "menu", action: "deploy-resistance" }],
    allow: (action) => deploys(action, "riot-cop", "resistance"),
    done: (view) => actorOf(view, GUIDE_YOU, "riot-cop") !== undefined,
  },
  advanceTo(3, "confrontation", "guideStep.s9.title", "guideStep.s9.text"),
  {
    kind: "do",
    title: "guideStep.s10.title",
    text: "guideStep.s10.text",
    targets: [
      { kind: "field", side: "you", cardId: "protester" },
      { kind: "field", side: "them", cardId: "talk-show-host" },
    ],
    allow: (action, view) => attacks(action, view, "protester", "talk-show-host"),
    done: (view) => view.duelists[GUIDE_THEM].archive.includes("talk-show-host"),
  },
  {
    kind: "next",
    title: "guideStep.s11.title",
    text: "guideStep.s11.text",
    targets: [{ kind: "embassy", side: "them" }, { kind: "mandate", side: "them" }],
  },
  advanceTo(3, "campaign-2", "guideStep.s12.title", "guideStep.s12.text"),
  {
    kind: "do",
    title: "guideStep.s13.title",
    text: "guideStep.s13.text",
    targets: [{ kind: "hand", cardId: "hot-mic" }, { kind: "menu", action: "set-face-down" }],
    where: "high",
    allow: (action) => action.type === "set-scandal" && action.scandalCardId === "hot-mic",
    done: (view) => view.duelists[GUIDE_YOU].setScandals.length > 0,
  },
  endTurn(3, "guideStep.s14.text"),
  watch(3, "guideStep.s15.text"),
  {
    kind: "next",
    title: "guideStep.s16.title",
    text: "guideStep.s16.text",
    targets: [{ kind: "field", side: "them", cardId: "protester" }, { kind: "their-set" }],
  },
  {
    kind: "next",
    title: "guideStep.s17.title",
    text: "guideStep.s17.text",
    targets: [{ kind: "election" }, { kind: "poll" }],
  },
  advanceTo(5, "campaign-1", "guideStep.s18.title", "guideStep.s18.text"),
  {
    kind: "do",
    title: "guideStep.s19.title",
    text: "guideStep.s19.text",
    targets: [{ kind: "hand", cardId: "bot-farm" }, { kind: "menu", action: "activate" }],
    allow: (action) => action.type === "activate-policy" && action.policyCardId === "bot-farm",
    done: (view) => view.duelists[GUIDE_YOU].archive.includes("bot-farm"),
  },
  {
    kind: "do",
    title: "guideStep.s20.title",
    text: "guideStep.s20.text",
    targets: [
      { kind: "hand", cardId: "lobbying-deal" },
      { kind: "menu", action: "activate" },
      { kind: "field", side: "you", cardId: "protester" },
    ],
    where: "high",
    allow: (action, view) =>
      action.type === "activate-policy" &&
      action.policyCardId === "lobbying-deal" &&
      action.options?.targetInstanceId === fieldInstance(view, "you", "protester"),
    done: (view) => view.duelists[GUIDE_YOU].backroomPolicies.some((policy) => policy.cardId === "lobbying-deal"),
  },
  advanceTo(5, "confrontation", "guideStep.s21.title", "guideStep.s21.text"),
  {
    kind: "do",
    title: "guideStep.s22.title",
    text: "guideStep.s22.text",
    targets: [
      { kind: "field", side: "you", cardId: "protester" },
      { kind: "field", side: "them", cardId: "protester" },
    ],
    allow: (action, view) => attacks(action, view, "protester", "protester"),
    done: (view) => actorOf(view, GUIDE_THEM, "protester") === undefined,
  },
  {
    kind: "next",
    title: "guideStep.s23.title",
    text: "guideStep.s23.text",
    targets: [{ kind: "mandate", side: "you" }],
  },
  advanceTo(5, "campaign-2", "guideStep.s24.title", "guideStep.s24.text"),
  {
    kind: "do",
    title: "guideStep.s25.title",
    text: "guideStep.s25.text",
    targets: [{ kind: "field", side: "you", cardId: "riot-cop" }, { kind: "menu", action: "to-campaign" }],
    allow: (action, view) =>
      action.type === "change-stance" && action.instanceId === fieldInstance(view, "you", "riot-cop"),
    done: (view) => actorOf(view, GUIDE_YOU, "riot-cop")?.stance === "campaign",
  },
  endTurn(5, "guideStep.s26.text"),
  {
    kind: "watch",
    title: "guideStep.s27.title",
    text: "guideStep.s27.text",
    targets: [{ kind: "poll" }],
    done: (view) => view.winnerId !== null,
  },
  {
    kind: "end",
    title: "guideStep.s28.title",
    text: "guideStep.s28.text",
  },
];
